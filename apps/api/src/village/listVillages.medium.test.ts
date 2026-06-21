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

const ctx = useTenantTestContainer([{ resource: 'village', action: 'read' }]);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(async () => {
  await ctx.tenantDb.delete(tenantSchema.tenantVillages);
});

// ---- テスト ----

describe('listVillages 統合テスト', () => {
  describe('Scenario 7: tenant_user が GET /api/villages にアクセスするとき', () => {
    test('200 OK で自分が作成した村のみが降順で返ること', async () => {
      // Arrange
      await ctx.tenantDb.insert(tenantSchema.tenantVillages).values([
        { name: '新しい村', ownerId: 1 },
      ]);
      // 少し待機して createdAt の差を確実にする
      await new Promise((r) => setTimeout(r, 1100));
      await ctx.tenantDb.insert(tenantSchema.tenantVillages).values([
        { name: '古い村', ownerId: 1 },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/villages', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { villages: Array<{ name: string; ownerId: number }> };
      expect(body.villages).toHaveLength(2);
      // 降順（最新が先頭）であること
      expect(body.villages[0]?.name).toBe('古い村');
      expect(body.villages[1]?.name).toBe('新しい村');
    });

    test('他のユーザーの村が含まれないこと', async () => {
      // Arrange
      await ctx.tenantDb.insert(tenantSchema.tenantVillages).values([
        { name: '自分の村', ownerId: 1 },
        { name: '他のユーザーの村', ownerId: 2 },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/villages', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { villages: Array<{ name: string; ownerId: number }> };
      expect(body.villages).toHaveLength(1);
      expect(body.villages[0]?.name).toBe('自分の村');
      expect(body.villages[0]?.ownerId).toBe(1);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に village:read がないユーザー）', async () => {
      // Arrange: userId=2 には village:read 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/villages', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
