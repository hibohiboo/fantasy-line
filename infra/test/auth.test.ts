import * as cdk from 'aws-cdk-lib/core';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { CognitoConstruct } from '../lib/auth/CognitoConstruct.js';

describe('CognitoConstruct', () => {
  let template: Template;

  beforeEach(() => {
    // Arrange
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    new CognitoConstruct(stack, 'Cognito');
    template = Template.fromStack(stack);
  });

  describe('User Pool', () => {
    test('User Pool が存在すること', () => {
      // Act / Assert
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
    });

    test('セルフサインアップが無効であること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    test('パスワードポリシーが設定されていること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Policies: {
          PasswordPolicy: {
            MinimumLength: 8,
            RequireUppercase: true,
            RequireLowercase: true,
            RequireNumbers: true,
            RequireSymbols: true,
          },
        },
      });
    });

    test('MFA が OPTIONAL であること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        MfaConfiguration: 'OPTIONAL',
      });
    });

    test('TOTP と SMS の MFA が有効であること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        EnabledMfas: Match.arrayWith(['SOFTWARE_TOKEN_MFA']),
      });
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        EnabledMfas: Match.arrayWith(['SMS_MFA']),
      });
    });

    test('custom:user_type が immutable で定義されていること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'user_type',
            AttributeDataType: 'String',
            Mutable: false,
            StringAttributeConstraints: Match.objectLike({
              MaxLength: '32',
            }),
          }),
        ]),
      });
    });

    test('custom:tenant_id が immutable で定義されていること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: Match.arrayWith([
          Match.objectLike({
            Name: 'tenant_id',
            AttributeDataType: 'String',
            Mutable: false,
            StringAttributeConstraints: Match.objectLike({
              MaxLength: '63',
            }),
          }),
        ]),
      });
    });
  });

  describe('App Client', () => {
    test('App Client が存在すること', () => {
      // Act / Assert
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });

    test('App Client が USER_SRP_AUTH を使うこと', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH']),
      });
    });

    test('アクセストークンが 60 分であること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: Match.objectLike({
          AccessToken: 'minutes',
        }),
        AccessTokenValidity: 60,
      });
    });

    test('ID トークンが 60 分であること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: Match.objectLike({
          IdToken: 'minutes',
        }),
        IdTokenValidity: 60,
      });
    });

    test('リフレッシュトークンが 30 日であること', () => {
      // Arrange
      // CDK は Duration.days(30) を 43200 分（minutes 単位）に変換して出力する
      const thirtyDaysInMinutes = 30 * 24 * 60;

      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: Match.objectLike({
          RefreshToken: 'minutes',
        }),
        RefreshTokenValidity: thirtyDaysInMinutes,
      });
    });

    test('custom:user_type が ReadAttributes に含まれること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: Match.arrayWith(['custom:user_type']),
      });
    });

    test('custom:tenant_id が ReadAttributes に含まれること', () => {
      // Act / Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: Match.arrayWith(['custom:tenant_id']),
      });
    });

    test('custom:user_type が WriteAttributes に含まれないこと', () => {
      // Arrange
      const resources = template.findResources('AWS::Cognito::UserPoolClient');
      const clients = Object.values(resources) as Array<{
        Properties?: { WriteAttributes?: string[] };
      }>;

      // Act
      const writeAttributes = clients.flatMap(
        (client) => client.Properties?.WriteAttributes ?? [],
      );

      // Assert
      expect(writeAttributes).not.toContain('custom:user_type');
    });

    test('custom:tenant_id が WriteAttributes に含まれないこと', () => {
      // Arrange
      const resources = template.findResources('AWS::Cognito::UserPoolClient');
      const clients = Object.values(resources) as Array<{
        Properties?: { WriteAttributes?: string[] };
      }>;

      // Act
      const writeAttributes = clients.flatMap(
        (client) => client.Properties?.WriteAttributes ?? [],
      );

      // Assert
      expect(writeAttributes).not.toContain('custom:tenant_id');
    });
  });
});
