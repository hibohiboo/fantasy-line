import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../hono/types';
import type { TenantDb } from '../db/client';

// early-return ケース（400 / 403）専用の最小モック
// 正常系（201）は createResident.medium.test.ts で担保する

function makeTenantDb(villageRows: unknown[]): TenantDb {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(villageRows),
      }),
    }),
    insert: () => ({
      values: () => ({
        $returningId: () => Promise.resolve([{ id: 1 }]),
      }),
    }),
  } as unknown as TenantDb;
}

function makeApp(tenantDb: TenantDb, userId = 1) {
  // createResidentHandler のみをテストするために最小 Hono アプリを構築する
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

describe('createResident ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('body が JSON でないとき', () => {
    test('400 と error: Invalid JSON が返ること', async () => {
      // Arrange
      const { createResidentHandler } = await import('./createResident');
      const tenantDb = makeTenantDb([]);
      const app = makeApp(tenantDb);
      app.post('/api/residents', createResidentHandler);

      // Act
      const response = await app.request('/api/residents', {
        method: 'POST',
        body: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Invalid JSON');
    });
  });

  describe('name が空文字のとき', () => {
    test('400 と fieldErrors.name が返ること', async () => {
      // Arrange
      const { createResidentHandler } = await import('./createResident');
      const tenantDb = makeTenantDb([]);
      const app = makeApp(tenantDb);
      app.post('/api/residents', createResidentHandler);

      // Act
      const response = await app.request('/api/residents', {
        method: 'POST',
        body: JSON.stringify({
          name: '',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(400);
      const body = await response.json() as { error: { fieldErrors: { name: string[] } } };
      expect(body.error.fieldErrors.name).toBeDefined();
    });
  });

  describe('他ユーザーの村へ登録しようとしたとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const { createResidentHandler } = await import('./createResident');
      // ownerId=2（別ユーザー）の村を返す
      const otherUserVillage = [{ id: 1, name: '他者の村', ownerId: 2, createdAt: new Date() }];
      const tenantDb = makeTenantDb(otherUserVillage);
      // userId=1 としてリクエスト
      const app = makeApp(tenantDb, 1);
      app.post('/api/residents', createResidentHandler);

      // Act
      const response = await app.request('/api/residents', {
        method: 'POST',
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: 1,
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
