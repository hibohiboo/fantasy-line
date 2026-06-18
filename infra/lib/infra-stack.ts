import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as path from 'path';
import { execSync } from 'child_process';
import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { CognitoConstruct } from './auth/CognitoConstruct.js';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const isLocal = process.env.LOCAL_API === 'true';

    // -- VPC --
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'aurora',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
        {
          name: 'lambda',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });
    // -- Security Groups --
    const lambdaSecurityGroup = new ec2.SecurityGroup(
      this,
      'LambdaSecurityGroup',
      {
        vpc,
        description: 'Security group for Lambda functions',
        allowAllOutbound: false,
      },
    );

    const eiceSecurityGroup = new ec2.SecurityGroup(this, 'EiceSecurityGroup', {
      vpc,
      description: 'Security group for EC2 Instance Connect Endpoint',
    });

    const auroraSecurityGroup = new ec2.SecurityGroup(
      this,
      'AuroraSecurityGroup',
      {
        vpc,
        description: 'Security group for Aurora MySQL Serverless V2',
        allowAllOutbound: false,
      },
    );

    const AURORA_PORT = 3389;
    auroraSecurityGroup.addIngressRule(
      ec2.Peer.securityGroupId(eiceSecurityGroup.securityGroupId),
      ec2.Port.tcp(AURORA_PORT),
    );

    // lambda -> Aurora
    auroraSecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(AURORA_PORT),
      'Allow MySQL from Lambda',
    );
    lambdaSecurityGroup.addEgressRule(
      auroraSecurityGroup,
      ec2.Port.tcp(AURORA_PORT),
      'Allow MySQL to Aurora',
    );

    // lambda -> Secrets Manager VPC Endpoint
    lambdaSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC Endpoint',
    );

    // -- VPC Endpoint (Secrets Manager)
    vpc.addInterfaceEndpoint('SecretsMangaerEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      subnets: { subnetGroupName: 'lambda' },
      securityGroups: [lambdaSecurityGroup],
    });

    // -- Aurora --
    const auroraCluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      engine: rds.DatabaseClusterEngine.auroraMysql({
        version: rds.AuroraMysqlEngineVersion.VER_3_12_0,
      }),
      writer: rds.ClusterInstance.serverlessV2('writer'),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      port: AURORA_PORT,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [auroraSecurityGroup],
      credentials: rds.Credentials.fromGeneratedSecret('admin'),
      defaultDatabaseName: 'myapp',
      storageEncrypted: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    auroraCluster.connections.allowFrom(
      lambdaSecurityGroup,
      ec2.Port.tcp(AURORA_PORT),
    );

    // -- Lambda Layer --
    // CDK の bundling 機構（temp dir → rename）は Windows で EPERM になるため使わない。
    // 代わりに CDK staging より前に layer/nodejs/ へ直接 npm install し、
    // fromAsset でそのまま zip する方式を採用している。
    const layerDir = path.join(__dirname, '../layer');
    const nodejsDir = path.join(layerDir, 'nodejs');
    mkdirSync(nodejsDir, { recursive: true });
    copyFileSync(path.join(layerDir, 'package.json'), path.join(nodejsDir, 'package.json'));
    // node_modules が存在しない場合のみ npm install を実行する。
    // CI では cdk コマンド実行前に `npm install --omit=dev` を layer/nodejs/ で事前実行しておくこと。
    if (!existsSync(path.join(nodejsDir, 'node_modules'))) {
      execSync('npm install --omit=dev', { cwd: nodejsDir, stdio: 'inherit' });
    }

    const sharedDepsLayer = new lambda.LayerVersion(this, 'SharedDepsLayer', {
      layerVersionName: 'fantasy-line-shared-deps',
      code: lambda.Code.fromAsset(layerDir),
      compatibleRuntimes: [lambda.Runtime.NODEJS_24_X],
      compatibleArchitectures: [lambda.Architecture.ARM_64, lambda.Architecture.X86_64],
      description: 'Shared npm dependencies: drizzle-orm, mysql2, zod',
    });

    // -- Lambda Functions --
    const lambdaDefaults: Omit<lambdaNodejs.NodejsFunctionProps, 'entry'> = {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: isLocal ? undefined : lambda.Architecture.ARM_64,
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      vpc,
      vpcSubnets: { subnetGroupName: 'lambda' },
      securityGroups: [lambdaSecurityGroup],
      environment: {
        DB_SECRET_ARN: auroraCluster.secret!.secretArn,
      },
      layers: [sharedDepsLayer],
      projectRoot: path.join(__dirname, '../..'),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node24',
        externalModules: ['@aws-sdk/*', 'drizzle-orm', 'mysql2', 'zod'],
      },
    };

    const echoFunction = new lambdaNodejs.NodejsFunction(this, 'EchoFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: isLocal ? undefined : lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../apps/api/src/echo/echo.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
    });

    const itemsFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ItemsFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/item/items.ts'),
      },
    );
    auroraCluster.secret!.grantRead(itemsFunction);

    const createVillageFunction = new lambdaNodejs.NodejsFunction(
      this,
      'CreateVillageFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/village/createVillage.ts'),
      },
    );
    auroraCluster.secret!.grantRead(createVillageFunction);

    const listVillagesFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ListVillagesFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/village/listVillages.ts'),
      },
    );
    auroraCluster.secret!.grantRead(listVillagesFunction);

    const createResidentFunction = new lambdaNodejs.NodejsFunction(
      this,
      'CreateResidentFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/resident/createResident.ts'),
      },
    );
    auroraCluster.secret!.grantRead(createResidentFunction);

    const listResidentsFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ListResidentsFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/resident/listResidents.ts'),
      },
    );
    auroraCluster.secret!.grantRead(listResidentsFunction);

    const listVillageResidentsFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ListVillageResidentsFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/resident/listVillageResidents.ts'),
      },
    );
    auroraCluster.secret!.grantRead(listVillageResidentsFunction);

    const migrationFunction = new lambdaNodejs.NodejsFunction(
      this,
      'migrationFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/db/migration.ts'),
        timeout: cdk.Duration.seconds(60),
        bundling: {
          ...lambdaDefaults.bundling,
          commandHooks: {
            beforeInstall: () => [],
            beforeBundling: () => [],
            afterBundling: (inputDir: string, outputDir: string) => {
              // Windows / Linux の差異吸収
              const src = inputDir.replace(/\\/g, '/');
              const dst = outputDir.replace(/\\/g, '/');
              return [
                `node -e "const {cpSync}=require('fs');const {join}=require('path');cpSync(join('${src}','apps','api','drizzle'),join('${dst}','migrations'),{recursive:true})"`,
              ];
            },
          },
        },
      },
    );
    auroraCluster.secret!.grantRead(migrationFunction);

    // -- Cognito --
    const cognitoConstruct = new CognitoConstruct(this, 'Cognito');

    // -- API Gateway --
    const api = new apigateway.RestApi(this, 'FantasyLineApi', {
      restApiName: 'Fantasy Line API',
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      { cognitoUserPools: [cognitoConstruct.userPool] },
    );

    const apiResource = api.root.addResource('api');

    const echoResource = apiResource.addResource('echo');
    echoResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(echoFunction),
    );

    const cognitoMethodOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    const itemsResource = apiResource.addResource('items');
    itemsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(itemsFunction),
      cognitoMethodOptions,
    );

    const villagesResource = apiResource.addResource('villages');
    villagesResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createVillageFunction),
      cognitoMethodOptions,
    );
    villagesResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listVillagesFunction),
      cognitoMethodOptions,
    );

    const residentsResource = apiResource.addResource('residents');
    residentsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createResidentFunction),
      cognitoMethodOptions,
    );
    residentsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listResidentsFunction),
      cognitoMethodOptions,
    );

    const villageByIdResource = villagesResource.addResource('{id}');
    const villageResidentsResource = villageByIdResource.addResource('residents');
    villageResidentsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(listVillageResidentsFunction),
      cognitoMethodOptions,
    );

    // -- Outputs

    new ec2.CfnInstanceConnectEndpoint(this, 'EiceEndpoint', {
      subnetId: vpc.selectSubnets({
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      }).subnetIds[0],
      securityGroupIds: [eiceSecurityGroup.securityGroupId],
      preserveClientIp: false,
    });

    new cdk.CfnOutput(this, 'AuroraClusterEndpoint', {
      value: auroraCluster.clusterEndpoint.hostname,
      description: 'Aurora cluster endpoint for open-tunnel --remote-host',
    });

    new cdk.CfnOutput(this, 'MigrationFunctionName', {
      value: migrationFunction.functionName,
      description: 'Migration Lambda function name',
    });
  }
}
