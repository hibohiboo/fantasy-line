import { describe, test, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

const mockInsert = vi.fn();
const mockSelect = vi.fn();

// tenantDb のモック
function makeMockTenantDb() {
  return {
    insert: () => ({ values: () => ({ $returningId: mockInsert }) }),
    select: () => ({ from: () => ({ where: mockSelect }) }),
  } as unknown as TenantDb;
}

// createVillageHandler をテストするための最小 Hono app
// tenantContext / requirePermission は呼ばず、context を直接セットする
function createTestApp(tenantDb: TenantDb, userId: number) {
  const app = new Hono<{ Variables: HonoVariables }>();
  // テスト用: ミドルウェアをスキップして Variables を直接セット
  app.use('*', async (c, next) => {
    c.set('tenantDb', tenantDb);
    c.set('userId', userId);
    c.set('tenantSlug', 'test');
    c.set('userType', 'tenant_user');
    await next();
  });
  return app;
}

describe('createVillageHandler', () => {
  beforeAll(async () => {
    vi.doMock('../db/client', () => ({ getDb: vi.fn(), getTenantDb: vi.fn() }));
  });

  describe('body が JSON でないとき', () => {
    test('400 が返ること', async () => {
      // Arrange
      const { createVillageHandler } = await import('./createVillage');
      const app = createTestApp(makeMockTenantDb(), 1);
      app.post('/api/villages', createVillageHandler);

      // Act
      const res = await app.request('/api/villages', {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Invalid JSON');
    });
  });

  describe('name が空文字のとき', () => {
    test('400 が返ること', async () => {
      // Arrange
      const { createVillageHandler } = await import('./createVillage');
      const app = createTestApp(makeMockTenantDb(), 1);
      app.post('/api/villages', createVillageHandler);

      // Act
      const res = await app.request('/api/villages', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(res.status).toBe(400);
      const body = await res.json() as { error: { fieldErrors: Record<string, string[]> } };
      expect(body.error.fieldErrors.name).toBeDefined();
    });
  });
});
