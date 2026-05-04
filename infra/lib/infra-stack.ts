import * as cdk from 'aws-cdk-lib/core';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as path from 'path';

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

    // -- DB認証情報 --
    const dbSecret = new secretsmanager.Secret(this, 'AuroraSecret', {
      description: 'Aurora MySQL credentials',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'admin' }),
        generateStringKey: 'password',
        excludePunctuation: true,
        passwordLength: 32,
      },
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
        DB_SECRET_ARN: dbSecret.secretArn,
      },
      projectRoot: path.join(__dirname, '../..'),
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node24',
        externalModules: ['@aws-sdk/*'],
      },
    };

    const echoFunction = new lambdaNodejs.NodejsFunction(this, 'EchoFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: isLocal ? undefined : lambda.Architecture.ARM_64,
      entry: path.join(__dirname, '../../apps/api/src/handlers/echo.ts'),
      projectRoot: path.join(__dirname, '../..'),
      handler: 'handler',
    });

    const itemsFunction = new lambdaNodejs.NodejsFunction(
      this,
      'ItemsFunction',
      {
        ...lambdaDefaults,
        entry: path.join(__dirname, '../../apps/api/src/handlers/items.ts'),
      },
    );
    dbSecret.grantRead(itemsFunction);

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
    dbSecret.grantRead(migrationFunction);

    // -- API Gateway --
    const api = new apigateway.RestApi(this, 'FantasyLineApi', {
      restApiName: 'Fantasy Line API',
    });

    const echoResource = api.root.addResource('echo');
    echoResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(echoFunction),
    );

    const itemsResource = api.root.addResource('items');
    itemsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(itemsFunction),
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
  }
}
