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

const ctx = useTenantTestContainer([{ resource: 'resident', action: 'read' }]);

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

describe('listResidents 統合テスト', () => {
  describe('Scenario: tenant_user が GET /api/residents にアクセスするとき', () => {
    test('住人がいない場合は空配列を返すこと', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: unknown[] };
      expect(body.residents).toEqual([]);
    });

    test('自分の村の住人のみ返すこと（他ユーザーの住人を含まない）', async () => {
      // Arrange: user-1 の村と user-2 の村を作成
      const [myVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const [otherVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '魔王の村', ownerId: 2 })
        .$returningId();

      await ctx.tenantDb.insert(tenantSchema.tenantResidents).values([
        {
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: myVillage.id,
        },
        {
          name: '鈴木一郎',
          nameKana: 'スズキイチロウ',
          birthDate: '1995-05-20',
          villageId: otherVillage.id,
        },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ name: string; villageName: string }> };
      expect(body.residents).toHaveLength(1);
      expect(body.residents[0]?.name).toBe('山田太郎');
      expect(body.residents[0]?.villageName).toBe('勇者の村');
    });

    test('nameKana 昇順でソートされること', async () => {
      // Arrange
      const [myVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();

      await ctx.tenantDb.insert(tenantSchema.tenantResidents).values([
        {
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: myVillage.id,
        },
        {
          name: '佐藤花子',
          nameKana: 'サトウハナコ',
          birthDate: '1998-03-10',
          villageId: myVillage.id,
        },
        {
          name: '安部一郎',
          nameKana: 'アベイチロウ',
          birthDate: '1990-07-22',
          villageId: myVillage.id,
        },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ nameKana: string }> };
      expect(body.residents).toHaveLength(3);
      expect(body.residents[0]?.nameKana).toBe('アベイチロウ');
      expect(body.residents[1]?.nameKana).toBe('サトウハナコ');
      expect(body.residents[2]?.nameKana).toBe('ヤマダタロウ');
    });

    test('villageName がレスポンスに含まれること', async () => {
      // Arrange
      const [myVillage] = await ctx.tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();

      await ctx.tenantDb.insert(tenantSchema.tenantResidents).values({
        name: '山田太郎',
        nameKana: 'ヤマダタロウ',
        birthDate: '2000-01-15',
        villageId: myVillage.id,
      });

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ villageName: string }> };
      expect(body.residents[0]?.villageName).toBe('勇者の村');
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に resident:read がないユーザー）', async () => {
      // Arrange: userId=2 には resident:read 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
