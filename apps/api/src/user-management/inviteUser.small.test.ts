// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
// vi.hoisted を使って mockCognitoSend を vi.mock のスコープ外で参照できるようにする
const { mockCognitoSend } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class MockCognitoClient {
    send = mockCognitoSend;
  },
  AdminCreateUserCommand: vi.fn(),
  UsernameExistsException: class UsernameExistsException extends Error {
    constructor() {
      super('UsernameExistsException');
      this.name = 'UsernameExistsException';
    }
  },
}));

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// early-return ケース（400 / 409 / 422）専用の最小モック
// 正常系（201）の DB 確認は inviteUser.medium.test.ts で担保する

/**
 * @param roleRow - ロール存在確認で返すロール行（null で 422）
 * @param insertResult - users INSERT の $returningId 結果（null でエラー）
 */
function makeTenantDb(
  roleRow: unknown,
  insertResult: { id: number } | null = { id: 3 },
): TenantDb {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(roleRow ? [roleRow] : []),
      }),
    }),
    insert: () => ({
      values: () => ({
        $returningId: () => Promise.resolve(insertResult ? [insertResult] : []),
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

describe('inviteUser ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCognitoSend.mockReset();
  });

  describe('body が JSON でないとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { inviteUserHandler } = await import('./inviteUser');
      const tenantDb = makeTenantDb({ id: 1, name: 'tenant_user', isDefault: 1 });
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('email が不正なとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { inviteUserHandler } = await import('./inviteUser');
      const tenantDb = makeTenantDb({ id: 1, name: 'tenant_user', isDefault: 1 });
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'not-an-email', roleId: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('roleId が存在しないとき', () => {
    test('422 と unprocessable_entity が返ること', async () => {
      // Arrange
      const { inviteUserHandler } = await import('./inviteUser');
      // ロールが存在しない（空配列を返す）
      const tenantDb = makeTenantDb(null);
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'newuser@example.com', roleId: 99 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('unprocessable_entity');
      expect(body.error.message).toBe('Role not found');
    });
  });

  describe('正常なリクエストで Cognito が成功するとき', () => {
    test('201 と招待したユーザー情報が返ること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({
        User: { Username: 'cognito-sub-new-user' },
      });

      const { inviteUserHandler } = await import('./inviteUser');
      const tenantDb = makeTenantDb(
        { id: 1, name: 'tenant_user', isDefault: 1 },
        { id: 3 },
      );
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'newuser@example.com', roleId: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as {
        user: { id: number; email: string; userType: string };
      };
      expect(body.user.id).toBe(3);
      expect(body.user.email).toBe('newuser@example.com');
      expect(body.user.userType).toBe('tenant_user');
    });

    test('ロール名が tenant_admin のとき userType が tenant_admin になること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({
        User: { Username: 'cognito-sub-admin-user' },
      });

      const { inviteUserHandler } = await import('./inviteUser');
      const tenantDb = makeTenantDb(
        { id: 2, name: 'tenant_admin', isDefault: 0 },
        { id: 4 },
      );
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'admin@example.com', roleId: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as {
        user: { id: number; email: string; userType: string };
      };
      expect(body.user.userType).toBe('tenant_admin');
    });
  });

  describe('Cognito が UsernameExistsException を返すとき', () => {
    test('409 と conflict が返ること', async () => {
      // Arrange
      const { UsernameExistsException } = await import('@aws-sdk/client-cognito-identity-provider');
      mockCognitoSend.mockRejectedValue(new UsernameExistsException());

      const { inviteUserHandler } = await import('./inviteUser');
      const tenantDb = makeTenantDb({ id: 1, name: 'tenant_user', isDefault: 1 });
      const app = makeApp(tenantDb);
      app.post('/api/users/invite', inviteUserHandler);

      // Act
      const response = await app.request('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({ email: 'existing@example.com', roleId: 1 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(409);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('conflict');
      expect(body.error.message).toBe('User already exists');
    });
  });
});
