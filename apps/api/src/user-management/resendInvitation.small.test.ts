// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
// vi.hoisted を使って mockCognitoSend を vi.mock のスコープ外で参照できるようにする
const { mockCognitoSend, MockAdminCreateUserCommand } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(),
  MockAdminCreateUserCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class MockCognitoClient {
    send = mockCognitoSend;
  },
  AdminCreateUserCommand: MockAdminCreateUserCommand,
}));

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// early-return ケース（400 / 404）および Cognito 呼び出し検証の最小モック
// 正常系の DB 確認は resendInvitation.medium.test.ts で担保する

/**
 * @param userRow - ユーザー存在確認で返す行（null で 404）
 */
function makeTenantDb(userRow: unknown): TenantDb {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(userRow ? [userRow] : []),
      }),
    }),
  } as unknown as TenantDb;
}

function makeApp(tenantDb: TenantDb, userId = 1) {
  const app = new Hono<{ Variables: HonoVariables }>();
  app.use('*', async (c, next) => {
    c.set('tenantDb', tenantDb);
    c.set('userId', userId);
    c.set('tenantSlug', 'test');
    c.set('userType', 'tenant_admin');
    await next();
  });
  return app;
}

describe('resendInvitation ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCognitoSend.mockReset();
    MockAdminCreateUserCommand.mockReset();
  });

  describe('userId が数値でないとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { resendInvitationHandler } = await import('./resendInvitation');
      const tenantDb = makeTenantDb(null);
      const app = makeApp(tenantDb);
      app.post('/api/users/:userId/resend-invitation', resendInvitationHandler);

      // Act
      const response = await app.request('/api/users/abc/resend-invitation', {
        method: 'POST',
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('対象ユーザーが存在しないとき', () => {
    test('404 と not_found が返ること', async () => {
      // Arrange
      const { resendInvitationHandler } = await import('./resendInvitation');
      // ユーザーが存在しない（空配列を返す）
      const tenantDb = makeTenantDb(null);
      const app = makeApp(tenantDb);
      app.post('/api/users/:userId/resend-invitation', resendInvitationHandler);

      // Act
      const response = await app.request('/api/users/999/resend-invitation', {
        method: 'POST',
      });

      // Assert
      expect(response.status).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('正常なリクエストで Cognito が成功するとき', () => {
    test('200 と invitation resent メッセージが返ること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({});

      const { resendInvitationHandler } = await import('./resendInvitation');
      const userRow = {
        id: 1,
        cognitoSub: 'user-1-sub',
        email: 'user1@example.com',
        userType: 'tenant_admin',
        createdAt: new Date(),
      };
      const tenantDb = makeTenantDb(userRow);
      const app = makeApp(tenantDb);
      app.post('/api/users/:userId/resend-invitation', resendInvitationHandler);

      // Act
      const response = await app.request('/api/users/1/resend-invitation', {
        method: 'POST',
      });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { message: string };
      expect(body.message).toBe('invitation resent');
    });

    test('Cognito が MessageAction: RESEND で呼ばれること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({});

      const { resendInvitationHandler } = await import('./resendInvitation');
      const userRow = {
        id: 1,
        cognitoSub: 'user-1-sub',
        email: 'user1@example.com',
        userType: 'tenant_admin',
        createdAt: new Date(),
      };
      const tenantDb = makeTenantDb(userRow);
      const app = makeApp(tenantDb);
      app.post('/api/users/:userId/resend-invitation', resendInvitationHandler);

      // Act
      await app.request('/api/users/1/resend-invitation', {
        method: 'POST',
      });

      // Assert: AdminCreateUserCommand が MessageAction: 'RESEND' と正しい Username で呼ばれること
      expect(MockAdminCreateUserCommand).toHaveBeenCalledOnce();
      expect(MockAdminCreateUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Username: 'user-1-sub',
          MessageAction: 'RESEND',
        }),
      );
    });
  });
});
