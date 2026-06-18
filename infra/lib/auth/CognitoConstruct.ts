import * as cdk from 'aws-cdk-lib/core';
import { Validations } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

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

    // MFA OPTIONAL 設定のため強制ルールを抑制（auth-cognito.md §MFA 参照）
    // 影響: 一部ユーザーが MFA なしでログイン可能
    // 見直し条件: MFA 強制要件がビジネス要件として定まった場合
    Validations.of(this.userPool).acknowledge({
      id: 'AwsSolutions-COG2',
      reason:
        'MFA は OPTIONAL 設定（auth-cognito.md §MFA 参照）。' +
        'ユーザーが任意に TOTP/SMS を設定できる方針のため Pool 全体での強制はしない。',
    });
    // Advanced Security Mode は有料機能のためコスト制約で採用しない
    // 影響: 高度な異常ログイン検知が動作しない
    // 見直し条件: 有料プランへ移行する場合または不正アクセス事案発生時
    Validations.of(this.userPool).acknowledge({
      id: 'AwsSolutions-COG3',
      reason:
        'Advanced Security Mode は有料機能。個人プロジェクトのコスト制約により採用しない。' +
        '不正アクセス事案が発生した場合または有料プランへ移行する場合に再評価する。',
    });
  }
}
