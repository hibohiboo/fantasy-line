// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
// vi.hoisted を使って mockCognitoSend を vi.mock のスコープ外で参照できるようにする
const { mockCognitoSend } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class MockCognitoClient {
    send = mockCognitoSend;
  },
  AdminDisableUserCommand: vi.fn(),
  AdminDeleteUserCommand: vi.fn(),
}));

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// early-return ケース（400 / 404 / 409）と Cognito 呼び出し確認の最小モック
// 正常系の DB 確認は deleteUser.medium.test.ts で担保する

/**
 * tenantDb モックを生成する。
 * select が 2 回呼ばれる:
 *   1 回目: ユーザー取得（where チェーン）
 *   2 回目: adminUsers 取得（innerJoin チェーン）
 */
function makeTenantDb(
  userRow: unknown,
  adminUsers: { userId: number }[],
): TenantDb {
  let selectCallCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) {
            return Promise.resolve(userRow ? [userRow] : []);
          }
          return Promise.resolve([]);
        },
        innerJoin: () => ({
          where: () => Promise.resolve(adminUsers),
        }),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(undefined),
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

const dummyUser = {
  id: 2,
  cognitoSub: 'user-2-sub',
  email: 'user2@example.com',
  userType: 'tenant_user',
  createdAt: new Date(),
};

describe('deleteUser ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
    mockCognitoSend.mockReset();
  });

  describe('userId が数値でないとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { deleteUserHandler } = await import('./deleteUser');
      const tenantDb = makeTenantDb(null, []);
      const app = makeApp(tenantDb);
      app.delete('/api/users/:userId', deleteUserHandler);

      // Act
      const response = await app.request('/api/users/abc', { method: 'DELETE' });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('対象ユーザーが存在しないとき', () => {
    test('404 と not_found が返ること', async () => {
      // Arrange
      const { deleteUserHandler } = await import('./deleteUser');
      // ユーザーが存在しない（空配列を返す）
      const tenantDb = makeTenantDb(null, []);
      const app = makeApp(tenantDb);
      app.delete('/api/users/:userId', deleteUserHandler);

      // Act
      const response = await app.request('/api/users/99', { method: 'DELETE' });

      // Assert
      expect(response.status).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('ラストアドミンを削除しようとしたとき', () => {
    test('409 と last_admin が返ること', async () => {
      // Arrange
      const { deleteUserHandler } = await import('./deleteUser');
      // userId=1 がラストアドミン（adminUsers が 1 件で、削除対象 userId=1 と一致）
      const tenantDb = makeTenantDb(
        { id: 1, cognitoSub: 'user-1-sub', email: 'user1@example.com', userType: 'tenant_admin', createdAt: new Date() },
        [{ userId: 1 }],
      );
      const app = makeApp(tenantDb);
      app.delete('/api/users/:userId', deleteUserHandler);

      // Act
      const response = await app.request('/api/users/1', { method: 'DELETE' });

      // Assert
      expect(response.status).toBe(409);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('last_admin');
      expect(body.error.message).toBe('Cannot delete the last admin');
    });
  });

  describe('正常系: ラストアドミンでないユーザーを削除するとき', () => {
    test('204 が返ること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({});
      const { deleteUserHandler } = await import('./deleteUser');
      // adminUsers が 2 件あるためラストアドミンではない
      const tenantDb = makeTenantDb(dummyUser, [{ userId: 1 }, { userId: 2 }]);
      const app = makeApp(tenantDb);
      app.delete('/api/users/:userId', deleteUserHandler);

      // Act
      const response = await app.request('/api/users/2', { method: 'DELETE' });

      // Assert
      expect(response.status).toBe(204);
    });

    test('Cognito AdminDisableUserCommand と AdminDeleteUserCommand が呼ばれること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue({});
      const { deleteUserHandler } = await import('./deleteUser');
      const { AdminDisableUserCommand, AdminDeleteUserCommand } = await import(
        '@aws-sdk/client-cognito-identity-provider'
      );
      const tenantDb = makeTenantDb(dummyUser, [{ userId: 1 }, { userId: 2 }]);
      const app = makeApp(tenantDb);
      app.delete('/api/users/:userId', deleteUserHandler);

      // Act
      await app.request('/api/users/2', { method: 'DELETE' });

      // Assert
      expect(AdminDisableUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'user-2-sub' }),
      );
      expect(AdminDeleteUserCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Username: 'user-2-sub' }),
      );
      expect(mockCognitoSend).toHaveBeenCalledTimes(2);
    });
  });
});
