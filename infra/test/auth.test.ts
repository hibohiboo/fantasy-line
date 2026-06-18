import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { CognitoConstruct } from '../lib/auth/CognitoConstruct.js';

describe('CognitoConstruct', () => {
  let template: Template;

  beforeEach(() => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');
    new CognitoConstruct(stack, 'Cognito');
    template = Template.fromStack(stack);
  });

  describe('User Pool', () => {
    test('User Pool が存在すること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.resourceCountIs('AWS::Cognito::UserPool', 1);
    });

    test('セルフサインアップが無効であること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });

    test('パスワードポリシーが設定されていること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
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
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        MfaConfiguration: 'OPTIONAL',
      });
    });

    test('TOTP と SMS の MFA が有効であること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        EnabledMfas: expect.arrayContaining([
          'SOFTWARE_TOKEN_MFA',
          'SMS_MFA',
        ]),
      });
    });

    test('custom:user_type が定義されていること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: expect.arrayContaining([
          expect.objectContaining({
            Name: 'user_type',
            AttributeDataType: 'String',
            StringAttributeConstraints: expect.objectContaining({
              MaxLength: '32',
            }),
          }),
        ]),
      });
    });

    test('custom:tenant_id が定義されていること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPool', {
        Schema: expect.arrayContaining([
          expect.objectContaining({
            Name: 'tenant_id',
            AttributeDataType: 'String',
            StringAttributeConstraints: expect.objectContaining({
              MaxLength: '63',
            }),
          }),
        ]),
      });
    });
  });

  describe('App Client', () => {
    test('App Client が存在すること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    });

    test('App Client が USER_SRP_AUTH を使うこと', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ExplicitAuthFlows: expect.arrayContaining(['ALLOW_USER_SRP_AUTH']),
      });
    });

    test('アクセストークンが 60 分であること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: expect.objectContaining({
          AccessToken: 'minutes',
        }),
        AccessTokenValidity: 60,
      });
    });

    test('ID トークンが 60 分であること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: expect.objectContaining({
          IdToken: 'minutes',
        }),
        IdTokenValidity: 60,
      });
    });

    test('リフレッシュトークンが 30 日であること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        TokenValidityUnits: expect.objectContaining({
          RefreshToken: 'days',
        }),
        RefreshTokenValidity: 30,
      });
    });

    test('custom:user_type が ReadAttributes に含まれること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: expect.arrayContaining(['custom:user_type']),
      });
    });

    test('custom:tenant_id が ReadAttributes に含まれること', () => {
      // Arrange / Act: beforeEach で template 生成済み

      // Assert
      template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ReadAttributes: expect.arrayContaining(['custom:tenant_id']),
      });
    });

    test('custom:user_type が WriteAttributes に含まれないこと', () => {
      // Arrange
      const resources = template.findResources('AWS::Cognito::UserPoolClient');
      const clients = Object.values(resources);

      // Act
      const writeAttributes: unknown[] = clients.flatMap(
        (client: { Properties?: { WriteAttributes?: unknown[] } }) =>
          client.Properties?.WriteAttributes ?? [],
      );

      // Assert
      expect(writeAttributes).not.toContain('custom:user_type');
    });

    test('custom:tenant_id が WriteAttributes に含まれないこと', () => {
      // Arrange
      const resources = template.findResources('AWS::Cognito::UserPoolClient');
      const clients = Object.values(resources);

      // Act
      const writeAttributes: unknown[] = clients.flatMap(
        (client: { Properties?: { WriteAttributes?: unknown[] } }) =>
          client.Properties?.WriteAttributes ?? [],
      );

      // Assert
      expect(writeAttributes).not.toContain('custom:tenant_id');
    });
  });
});
