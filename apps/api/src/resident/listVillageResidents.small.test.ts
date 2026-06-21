import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// early-return ケース（403）専用の最小モック
// 正常系は listVillageResidents.medium.test.ts で担保する

function makeTenantDb(villageRows: unknown[]): TenantDb {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(villageRows),
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
    c.set('userType', 'tenant_user');
    await next();
  });
  return app;
}

describe('listVillageResidents ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('他ユーザーの村への参照のとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const { listVillageResidentsHandler } = await import('./listVillageResidents');
      // ownerId=2（別ユーザー）の村を返す
      const otherUserVillage = [{ id: 1, name: '他者の村', ownerId: 2, createdAt: new Date() }];
      const tenantDb = makeTenantDb(otherUserVillage);
      // userId=1 としてリクエスト
      const app = makeApp(tenantDb, 1);
      app.get('/api/villages/:id/residents', listVillageResidentsHandler);

      // Act
      const response = await app.request('/api/villages/1/residents');

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
