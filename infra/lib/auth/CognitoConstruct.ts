import * as cdk from 'aws-cdk-lib/core';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { NagSuppressions } from 'cdk-nag';

export class CognitoConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        otp: true,
        sms: true,
      },
      customAttributes: {
        user_type: new cognito.StringAttribute({ maxLen: 32 }),
        tenant_id: new cognito.StringAttribute({ maxLen: 63 }),
      },
      userInvitation: {
        emailSubject: '【Fantasy Line】アカウント登録のご案内',
        emailBody:
          '{username} 様\n\n' +
          'Fantasy Line へご招待いたします。\n' +
          '以下の初期パスワードにてログインしてください。\n\n' +
          '初期パスワード: {####}\n\n' +
          '初回ログイン時にパスワードの変更が求められます。\n' +
          'ご不明な点がございましたら管理者にお問い合わせください。',
      },
    });

    const readAttributes = new cognito.ClientAttributes().withCustomAttributes(
      'user_type',
      'tenant_id',
    );

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      authFlows: {
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(30),
      readAttributes,
    });

    NagSuppressions.addResourceSuppressions(this.userPool, [
      {
        id: 'AwsSolutions-COG2',
        reason:
          'MFA は OPTIONAL 設定（auth-cognito.md §MFA 参照）。' +
          'ユーザーが任意に TOTP/SMS を設定できる方針のため Pool 全体での強制はしない。',
      },
      {
        id: 'AwsSolutions-COG3',
        reason:
          'Advanced Security Mode は有料機能。個人プロジェクトのコスト制約により採用しない。' +
          '不正アクセス事案が発生した場合または有料プランへ移行する場合に再評価する。',
      },
    ]);
  }
}
