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

const ctx = useTenantTestContainer([{ resource: 'item', action: 'read' }]);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(async () => {
  await ctx.tenantDb.delete(tenantSchema.tenantItems);
});

// ---- テスト ----

describe('listItems 統合テスト', () => {
  describe('Scenario: tenant_user が GET /api/items にアクセスするとき', () => {
    test('アイテムがない場合は空配列を返すこと', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        { method: 'GET' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { items: unknown[] };
      expect(body.items).toEqual([]);
    });

    test('自分が作成したアイテムのみ返すこと（他ユーザーのアイテムを含まない）', async () => {
      // Arrange: user1 と user2 それぞれのアイテムをシード
      await ctx.tenantDb.insert(tenantSchema.tenantItems).values([
        { name: 'ユーザー1のアイテム', ownerId: 1 },
        { name: 'ユーザー2のアイテム', ownerId: 2 },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        { method: 'GET' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { items: { id: number; name: string; ownerId: number }[] };
      expect(body.items).toHaveLength(1);
      expect(body.items[0].name).toBe('ユーザー1のアイテム');
      expect(body.items[0].ownerId).toBe(1);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に item:read がないユーザー）', async () => {
      // Arrange: userId=2 には item:read 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        { method: 'GET' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
