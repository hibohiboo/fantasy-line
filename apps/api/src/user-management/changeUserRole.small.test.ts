import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// Cognito 不要。tenantDb をモックに差し替えて handler の振る舞いだけを検証する

/**
 * select が2回呼ばれる前提のモック:
 *   1回目: ユーザー確認
 *   2回目: ロール確認
 */
function makeTenantDb(userRow: unknown, roleRow: unknown): TenantDb {
  let selectCallCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve(userRow ? [userRow] : []);
          return Promise.resolve(roleRow ? [roleRow] : []);
        },
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(undefined),
    }),
    insert: () => ({
      values: () => Promise.resolve(undefined),
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

const validUser = { id: 1, email: 'user@example.com', userType: 'tenant_user', cognitoSub: 'sub-1', createdAt: new Date() };
const validRole = { id: 2, name: 'guest', isDefault: 0 };

describe('changeUserRoleHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('userId が数値でないとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(validUser, validRole);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/abc/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('body が JSON でないとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(validUser, validRole);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/1/roles', {
        method: 'PUT',
        body: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('roleId が 0 以下のとき', () => {
    test('400 と validation_error が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(validUser, validRole);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/1/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 0 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });

  describe('ユーザーが存在しないとき', () => {
    test('404 と not_found が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(null, validRole);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/99/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('ロールが存在しないとき', () => {
    test('422 と unprocessable_entity が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(validUser, null);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/1/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 999 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('unprocessable_entity');
      expect(body.error.message).toBe('Role not found');
    });
  });

  describe('正常なリクエストのとき', () => {
    test('200 と更新後のユーザー情報が返ること', async () => {
      // Arrange
      const { changeUserRoleHandler } = await import('./changeUserRole');
      const tenantDb = makeTenantDb(validUser, validRole);
      const app = makeApp(tenantDb);
      app.put('/api/users/:userId/roles', changeUserRoleHandler);

      // Act
      const response = await app.request('/api/users/1/roles', {
        method: 'PUT',
        body: JSON.stringify({ roleId: 2 }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as {
        user: { id: number; email: string; roleId: number };
      };
      expect(body.user.id).toBe(1);
      expect(body.user.email).toBe('user@example.com');
      expect(body.user.roleId).toBe(2);
    });
  });
});
