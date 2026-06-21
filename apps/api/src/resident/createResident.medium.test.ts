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

const ctx = useTenantTestContainer([{ resource: 'resident', action: 'create' }]);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(async () => {
  // 参照整合性のため residents → villages の順でリセット
  await ctx.tenantDb.delete(tenantSchema.tenantResidents);
  await ctx.tenantDb.delete(tenantSchema.tenantVillages);
});

// ---- テスト ----

describe('createResident 統合テスト', () => {
  describe('Scenario: tenant_user が POST /api/residents にアクセスするとき', () => {
    test('正常なリクエストで 201 が返り、DB に住人が作成されること', async () => {
      // Arrange: user-1 が所有する村を作成
      const [insertedVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const villageId = insertedVillage.id;

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as {
        resident: { id: number; name: string; nameKana: string; birthDate: string; villageId: number; createdAt: string }
      };
      expect(body.resident.id).toBeDefined();
      expect(body.resident.name).toBe('山田太郎');
      expect(body.resident.nameKana).toBe('ヤマダタロウ');
      expect(body.resident.birthDate).toBe('2000-01-15');
      expect(body.resident.villageId).toBe(villageId);
      expect(body.resident.createdAt).toBeDefined();

      // DB に1件登録されていることを確認
      const rows = await ctx.tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(1);
    });

    test('同名住人を 2 回 POST すると両方 201 が返ること（一意制約なし）', async () => {
      // Arrange: user-1 が所有する村を作成
      const [insertedVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const villageId = insertedVillage.id;

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      const requestBody = {
        method: 'POST',
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId,
        }),
        headers: { 'Content-Type': 'application/json' },
      };

      // Act
      const response1 = await app.request('/api/residents', requestBody, { event: mockEvent });
      const response2 = await app.request('/api/residents', requestBody, { event: mockEvent });

      // Assert
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);

      const rows = await ctx.tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(2);
    });

    test('他ユーザーの村への villageId を指定すると 403 が返ること', async () => {
      // Arrange: user-2 が所有する村を作成
      const [otherVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '他者の村', ownerId: 2 })
        .$returningId();

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId: otherVillage.id,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');

      // DB に登録されていないことを確認
      const rows = await ctx.tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(0);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に resident:create がないユーザー）', async () => {
      // Arrange: userId=2 には resident:create 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId: 1,
          }),
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
