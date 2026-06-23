import * as cdk from 'aws-cdk-lib/core';
import { Validations } from 'aws-cdk-lib';
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
        entry: path.join(__dirname, '../../apps/api/src/village/listVillages-lambda.ts'),
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
                // drizzle-service マイグレーションを migrations/ にコピーする（drizzle ディレクトリ名変更に伴う更新）
                `node -e "const {cpSync}=require('fs');const {join}=require('path');cpSync(join('${src}','apps','api','drizzle-service'),join('${dst}','migrations'),{recursive:true})"`,
              ];
            },
          },
        },
      },
    );
    auroraCluster.secret!.grantRead(migrationFunction);

    // -- Cognito --
    const cognitoConstruct = new CognitoConstruct(this, 'Cognito');

    const setupServiceSchemaFunction = new lambdaNodejs.NodejsFunction(this, 'SetupServiceSchemaFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/admin/setupServiceSchema-lambda.ts'),
      timeout: cdk.Duration.seconds(60),
      bundling: {
        ...lambdaDefaults.bundling,
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            const src = inputDir.replace(/\\/g, '/');
            const dst = outputDir.replace(/\\/g, '/');
            return [
              `node -e "const {cpSync}=require('fs');const {join}=require('path');cpSync(join('${src}','apps','api','drizzle-service'),join('${dst}','migrations-service'),{recursive:true})"`,
            ];
          },
        },
      },
    });
    auroraCluster.secret!.grantRead(setupServiceSchemaFunction);

    const createTenantFunction = new lambdaNodejs.NodejsFunction(this, 'CreateTenantFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/admin/createTenant-lambda.ts'),
      timeout: cdk.Duration.seconds(60),
      environment: {
        ...lambdaDefaults.environment,
        COGNITO_USER_POOL_ID: cognitoConstruct.userPool.userPoolId,
      },
      bundling: {
        ...lambdaDefaults.bundling,
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            const src = inputDir.replace(/\\/g, '/');
            const dst = outputDir.replace(/\\/g, '/');
            return [
              `node -e "const {cpSync}=require('fs');const {join}=require('path');cpSync(join('${src}','apps','api','drizzle-tenant'),join('${dst}','migrations-tenant'),{recursive:true})"`,
            ];
          },
        },
      },
    });
    auroraCluster.secret!.grantRead(createTenantFunction);
    cognitoConstruct.userPool.grant(createTenantFunction, 'cognito-idp:AdminCreateUser', 'cognito-idp:AdminDeleteUser');

    const migrateAllTenantsFunction = new lambdaNodejs.NodejsFunction(this, 'MigrateAllTenantsFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/admin/migrateAllTenants-lambda.ts'),
      timeout: cdk.Duration.seconds(60),
      bundling: {
        ...lambdaDefaults.bundling,
        commandHooks: {
          beforeInstall: () => [],
          beforeBundling: () => [],
          afterBundling: (inputDir: string, outputDir: string) => {
            const src = inputDir.replace(/\\/g, '/');
            const dst = outputDir.replace(/\\/g, '/');
            return [
              `node -e "const {cpSync}=require('fs');const {join}=require('path');cpSync(join('${src}','apps','api','drizzle-tenant'),join('${dst}','migrations-tenant'),{recursive:true})"`,
            ];
          },
        },
      },
    });
    auroraCluster.secret!.grantRead(migrateAllTenantsFunction);

    const createServicerDelegateFunction = new lambdaNodejs.NodejsFunction(this, 'CreateServicerDelegateFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/admin/createServicerDelegate-lambda.ts'),
      environment: {
        ...lambdaDefaults.environment,
        COGNITO_USER_POOL_ID: cognitoConstruct.userPool.userPoolId,
      },
    });
    auroraCluster.secret!.grantRead(createServicerDelegateFunction);
    cognitoConstruct.userPool.grant(createServicerDelegateFunction, 'cognito-idp:AdminCreateUser');

    const listUsersFunction = new lambdaNodejs.NodejsFunction(this, 'ListUsersFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/user-management/listUsers-lambda.ts'),
    });
    auroraCluster.secret!.grantRead(listUsersFunction);

    const inviteUserFunction = new lambdaNodejs.NodejsFunction(this, 'InviteUserFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/user-management/inviteUser-lambda.ts'),
      environment: {
        ...lambdaDefaults.environment,
        COGNITO_USER_POOL_ID: cognitoConstruct.userPool.userPoolId,
      },
    });
    auroraCluster.secret!.grantRead(inviteUserFunction);
    cognitoConstruct.userPool.grant(inviteUserFunction, 'cognito-idp:AdminCreateUser');

    const deleteUserFunction = new lambdaNodejs.NodejsFunction(this, 'DeleteUserFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/user-management/deleteUser-lambda.ts'),
      environment: {
        ...lambdaDefaults.environment,
        COGNITO_USER_POOL_ID: cognitoConstruct.userPool.userPoolId,
      },
    });
    auroraCluster.secret!.grantRead(deleteUserFunction);
    cognitoConstruct.userPool.grant(deleteUserFunction, 'cognito-idp:AdminDisableUser', 'cognito-idp:AdminDeleteUser');

    const changeUserRoleFunction = new lambdaNodejs.NodejsFunction(this, 'ChangeUserRoleFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/user-management/changeUserRole-lambda.ts'),
    });
    auroraCluster.secret!.grantRead(changeUserRoleFunction);

    const resendInvitationFunction = new lambdaNodejs.NodejsFunction(this, 'ResendInvitationFunction', {
      ...lambdaDefaults,
      entry: path.join(__dirname, '../../apps/api/src/user-management/resendInvitation-lambda.ts'),
      environment: {
        ...lambdaDefaults.environment,
        COGNITO_USER_POOL_ID: cognitoConstruct.userPool.userPoolId,
      },
    });
    auroraCluster.secret!.grantRead(resendInvitationFunction);
    cognitoConstruct.userPool.grant(resendInvitationFunction, 'cognito-idp:AdminCreateUser');

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
    const echoMethod = echoResource.addMethod(
      'ANY',
      new apigateway.LambdaIntegration(echoFunction),
    );
    // 疎通テスト用エンドポイントのため認証不要（cognito-cdk-design.md §JWT Authorizer の適用範囲 参照）
    // 影響: 未認証リクエストが到達可能。接続確認目的のみに使用すること
    // 見直し条件: echo エンドポイントを廃止または認証エンドポイントに変更した場合
    Validations.of(echoMethod).acknowledge({
      id: 'AwsSolutions-APIG4',
      reason: '疎通テスト用エンドポイントのため意図的に認証を除外している（cognito-cdk-design.md 参照）。',
    });
    Validations.of(echoMethod).acknowledge({
      id: 'AwsSolutions-COG4',
      reason: '疎通テスト用エンドポイントのため Cognito 認証を意図的に除外している（cognito-cdk-design.md 参照）。',
    });

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

    const usersResource = apiResource.addResource('users');
    usersResource.addMethod('GET', new apigateway.LambdaIntegration(listUsersFunction), cognitoMethodOptions);

    const inviteResource = usersResource.addResource('invite');
    inviteResource.addMethod('POST', new apigateway.LambdaIntegration(inviteUserFunction), cognitoMethodOptions);

    const userByIdResource = usersResource.addResource('{userId}');
    userByIdResource.addMethod('DELETE', new apigateway.LambdaIntegration(deleteUserFunction), cognitoMethodOptions);

    const rolesResource = userByIdResource.addResource('roles');
    rolesResource.addMethod('PUT', new apigateway.LambdaIntegration(changeUserRoleFunction), cognitoMethodOptions);

    const resendResource = userByIdResource.addResource('resend-invitation');
    resendResource.addMethod('POST', new apigateway.LambdaIntegration(resendInvitationFunction), cognitoMethodOptions);

    const adminResource = api.root.addResource('admin');

    // POST /admin/setup/service-schema
    const setupResource = adminResource.addResource('setup');
    const serviceSchemaResource = setupResource.addResource('service-schema');
    serviceSchemaResource.addMethod('POST', new apigateway.LambdaIntegration(setupServiceSchemaFunction), cognitoMethodOptions);

    // POST /admin/tenants
    const tenantsResource = adminResource.addResource('tenants');
    tenantsResource.addMethod('POST', new apigateway.LambdaIntegration(createTenantFunction), cognitoMethodOptions);

    // POST /admin/migrate/all-tenants
    const migrateResource = adminResource.addResource('migrate');
    const allTenantsResource = migrateResource.addResource('all-tenants');
    allTenantsResource.addMethod('POST', new apigateway.LambdaIntegration(migrateAllTenantsFunction), cognitoMethodOptions);

    // POST /admin/users
    const adminUsersResource = adminResource.addResource('users');
    adminUsersResource.addMethod('POST', new apigateway.LambdaIntegration(createServicerDelegateFunction), cognitoMethodOptions);

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

    // -- cdk-nag suppressions（既存リソースの未対応分 / cdk-nag 導入前から存在）--
    // 以下は PBI-SaaS-002 で cdk-nag を初めて導入した際に顕在化した既存リソースの違反。
    // 各項目は別 PBI で個別に対処する。

    // VPC Flow Log 未設定。個人プロジェクトのコスト制約で未導入。要件が高まった場合に追加する
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-VPC7',
      reason: 'VPC Flow Log は未設定。個人プロジェクトのコスト制約により見送り。ネットワーク監査要件が発生した場合に追加する。',
    });
    // Security Group の動的 CIDR 参照により cdk-nag がルール評価できなかった（エラー扱い）
    // 影響: Lambda → VPC CIDR（HTTPS）の egress ルールは意図的な設定
    // 見直し条件: cdk-nag が動的値を評価できるようになった場合
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-EC23',
      reason: 'Lambda の egress ルールで VPC CIDR を動的参照しており cdk-nag が評価不能。意図的な設定であり変更不要。',
    });
    // Secrets Manager 自動ローテーション未設定。Aurora 接続情報は CDK 管理の生成シークレット
    // 見直し条件: 本番運用開始時またはローテーション機能が必要になった場合
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason: 'Aurora 認証情報は CDK 生成シークレット。現状は手動ローテーション運用。本番化時に自動ローテーションを設定する。',
    });
    // Aurora IAM 認証未設定。Secrets Manager 経由のパスワード認証を使用中
    // 見直し条件: IAM 認証への移行コストと効果を評価した場合
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-RDS6',
      reason: 'Aurora は Secrets Manager 経由のパスワード認証を使用。IAM 認証への移行は別途検討する。',
    });
    // Aurora 削除保護無効。開発環境のため DESTROY ポリシーで管理
    // 見直し条件: 本番運用開始時
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-RDS10',
      reason: '開発環境のため削除保護を無効にしている（removalPolicy: DESTROY）。本番化時に有効にする。',
    });
    // Aurora Backtrack 未設定。MySQL Serverless v2 では Backtrack 非対応
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-RDS14',
      reason: 'Aurora MySQL Serverless v2 は Backtrack 非対応のため設定不可。',
    });
    // Lambda に AWS 管理ポリシー（BasicExecutionRole / VPCAccessExecutionRole）を使用
    // カスタムポリシーへの置き換えは別 PBI で対応する
    // IAM4 は granular ルール（finding が配列）のため suppress には「AwsSolutions-IAM4[Policy::arn:...]」形式が必要。
    // しかし CDK の Validations.acknowledge() は id を '::' で split してパースするため、
    // ARN に含まれる複数の '::' によって InvalidValidationId を投げる。
    // isAcknowledged() が直接読む metadata を node.addMetadata() で書き込むことで迂回する。
    this.node.addMetadata(Validations.ACKNOWLEDGED_RULES_METADATA_KEY, {
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]':
        'Lambda 実行ロールに AWSLambdaBasicExecutionRole を使用中。カスタムポリシーへの置き換えは別 PBI で対応する。',
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]':
        'Lambda の VPC アクセスに AWSLambdaVPCAccessExecutionRole を使用中。カスタムポリシーへの置き換えは別 PBI で対応する。',
    });
    // API Gateway リクエストバリデーション未設定。Lambda 側で Zod バリデーションを実施
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-APIG2',
      reason: 'API GW レベルのリクエストバリデーションは未設定。Lambda ハンドラー内で Zod により入力検証を実施している。',
    });
    // API Gateway アクセスログ未設定。コスト制約により見送り
    // 見直し条件: 本番運用開始時またはアクセス分析が必要になった場合
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-APIG1',
      reason: 'API GW アクセスログは未設定。個人プロジェクトのコスト制約により見送り。本番化時に設定する。',
    });
    // WAF 未設定。有料機能のためコスト制約で見送り
    // 見直し条件: 本番公開時またはセキュリティ要件が高まった場合
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-APIG3',
      reason: 'WAF は有料機能。個人プロジェクトのコスト制約により未導入。本番公開時に採用要否を検討する。',
    });
    // API Gateway CloudWatch ログ未設定。コスト制約により見送り
    // 見直し条件: 本番運用開始時
    Validations.of(this).acknowledge({
      id: 'AwsSolutions-APIG6',
      reason: 'API GW CloudWatch ログは未設定。個人プロジェクトのコスト制約により見送り。本番化時に設定する。',
    });
  }
}
