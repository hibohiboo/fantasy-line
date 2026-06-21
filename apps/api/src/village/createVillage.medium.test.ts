// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { vi, describe, test, expect, beforeAll, beforeEach } from 'vitest';
import * as tenantSchema from '../db/tenant-template-schema';
import { getDb, getTenantDb } from '../db/client';
import { app } from '../hono/app';
import { useTenantTestContainer, makeMockEvent } from '../shared/test-helpers/mediumTestSetup';

const ctx = useTenantTestContainer([{ resource: 'village', action: 'create' }]);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(async () => {
  await ctx.tenantDb.delete(tenantSchema.tenantVillages);
});

// ---- テスト ----

describe('createVillage 統合テスト', () => {
  describe('Scenario: tenant_user が POST /api/villages にアクセスするとき', () => {
    test('201 OK で村が作成されること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/villages',
        {
          method: 'POST',
          body: JSON.stringify({ name: '勇者の村' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as { village: { id: number; name: string; ownerId: number; createdAt: string } };
      expect(body.village.id).toBeDefined();
      expect(body.village.name).toBe('勇者の村');
      expect(body.village.ownerId).toBe(1);
      expect(body.village.createdAt).toBeDefined();
    });

    test('村の ownerId が userId（number 型）と一致すること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/villages',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'テスト村' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as { village: { ownerId: number } };
      expect(typeof body.village.ownerId).toBe('number');
      expect(body.village.ownerId).toBe(1);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に village:create がないユーザー）', async () => {
      // Arrange: userId=2 には village:create 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/villages',
        {
          method: 'POST',
          body: JSON.stringify({ name: '権限なし村' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
