import { describe, test, expect, vi, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// tenantDb のモック（insert は呼ばれない前提のため空オブジェクトで代用）
function makeMockTenantDb() {
  return {} as unknown as TenantDb;
}

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

describe('createItemHandler - バリデーションエラー', () => {
   
  let app: Hono<{ Variables: HonoVariables }>;

  beforeAll(async () => {
    const { createItemHandler } = await import('./createItem');

    app = new Hono<{ Variables: HonoVariables }>();
    app.use('*', async (c, next) => {
      c.set('tenantDb', makeMockTenantDb());
      c.set('userId', 1);
      c.set('tenantSlug', 'test');
      c.set('userType', 'tenant_user');
      await next();
    });
    app.post('/api/items', createItemHandler);
  });

  describe('body が JSON でないとき', () => {
    test('400 を返し error が "Invalid JSON" であること', async () => {
      // Arrange
      const body = 'not json';

      // Act
      const response = await app.request('/api/items', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'text/plain' },
      });

      // Assert
      expect(response.status).toBe(400);
      const json = await response.json() as { error: string };
      expect(json.error).toBe('Invalid JSON');
    });
  });

  describe('name が未指定のとき', () => {
    test('400 を返し fieldErrors.name が存在すること', async () => {
      // Arrange
      const body = JSON.stringify({ price: 100 });

      // Act
      const response = await app.request('/api/items', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const json = await response.json() as { error: { fieldErrors: { name: string[] } } };
      expect(json.error.fieldErrors.name).toBeDefined();
    });
  });

  describe('name が空文字のとき', () => {
    test('400 を返し fieldErrors.name が存在すること', async () => {
      // Arrange
      const body = JSON.stringify({ name: '' });

      // Act
      const response = await app.request('/api/items', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const json = await response.json() as { error: { fieldErrors: { name: string[] } } };
      expect(json.error.fieldErrors.name).toBeDefined();
    });
  });
});
