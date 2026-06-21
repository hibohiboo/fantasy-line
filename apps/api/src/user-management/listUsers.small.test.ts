import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// Cognito 認証不要。tenantDb をモックに差し替えて handler の振る舞いだけを検証する

type UserRow = {
  id: number;
  email: string;
  userType: 'tenant_admin' | 'tenant_user';
  roleName: string | null;
  createdAt: Date;
};

// Drizzle の select().from().leftJoin().leftJoin() チェーンをモックする
// 内側の関数を変数に切り出してネスト深さを抑える
function makeQueryChain(userRows: UserRow[]) {
  const secondLeftJoin = () => Promise.resolve(userRows);
  const firstLeftJoin = () => ({ leftJoin: secondLeftJoin });
  const from = () => ({ leftJoin: firstLeftJoin });
  return { from };
}

function makeTenantDb(userRows: UserRow[]): TenantDb {
  return {
    select: () => makeQueryChain(userRows),
  } as unknown as TenantDb;
}

function makeApp(tenantDb: TenantDb) {
  const app = new Hono<{ Variables: HonoVariables }>();
  app.use('*', async (c, next) => {
    c.set('tenantDb', tenantDb);
    c.set('userId', 1);
    c.set('tenantSlug', 'test');
    c.set('userType', 'tenant_admin');
    await next();
  });
  return app;
}

describe('listUsersHandler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('ユーザーが 0 件のとき', () => {
    test('空配列を返すこと', async () => {
      // Arrange
      const { listUsersHandler } = await import('./listUsers');
      const tenantDb = makeTenantDb([]);
      const app = makeApp(tenantDb);
      app.get('/api/users', listUsersHandler);

      // Act
      const response = await app.request('/api/users');

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { users: unknown[] };
      expect(body.users).toEqual([]);
    });
  });

  describe('ユーザーが存在するとき', () => {
    test('ロール名を含むユーザー一覧が返ること', async () => {
      // Arrange
      const { listUsersHandler } = await import('./listUsers');
      const createdAt = new Date('2024-01-01T00:00:00.000Z');
      const userRows: UserRow[] = [
        {
          id: 1,
          email: 'admin@example.com',
          userType: 'tenant_admin',
          roleName: 'tenant_admin',
          createdAt,
        },
        {
          id: 2,
          email: 'user@example.com',
          userType: 'tenant_user',
          roleName: null,
          createdAt,
        },
      ];
      const tenantDb = makeTenantDb(userRows);
      const app = makeApp(tenantDb);
      app.get('/api/users', listUsersHandler);

      // Act
      const response = await app.request('/api/users');

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as {
        users: Array<{
          id: number;
          email: string;
          userType: string;
          roleName: string | null;
        }>;
      };
      expect(body.users).toHaveLength(2);
      expect(body.users[0]?.id).toBe(1);
      expect(body.users[0]?.email).toBe('admin@example.com');
      expect(body.users[0]?.userType).toBe('tenant_admin');
      expect(body.users[0]?.roleName).toBe('tenant_admin');
      // ロール未割当ユーザーも含まれること（LEFT JOIN の振る舞い）
      expect(body.users[1]?.roleName).toBeNull();
    });
  });
});
