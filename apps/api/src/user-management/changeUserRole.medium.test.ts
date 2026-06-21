// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { vi, describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getDb, getTenantDb } from '../db/client';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { changeUserRoleHandler } from './changeUserRole';
import { useTenantTestContainer, makeMockEvent } from '../shared/test-helpers/mediumTestSetup';
import type { AppBindings, HonoVariables } from '../hono/types';
import * as tenantSchema from '../db/tenant-template-schema';

// userId=1 に user.manage 権限を付与する。userId=2 には権限を持たせない
const ctx = useTenantTestContainer([{ resource: 'user', action: 'manage' }]);

// mini app: app.ts にまだ /api/users/:userId/roles ルートがないため独自に構築する
const testApp = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
testApp.use('*', tenantContext);
testApp.put('/api/users/:userId/roles', requirePermission('user', 'manage'), changeUserRoleHandler);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(async () => {
  // role_permissions をリセットして user.manage 権限を付与し直す
  await ctx.tenantDb.delete(tenantSchema.tenantRolePermissions);
  await ctx.tenantDb
    .insert(tenantSchema.tenantRolePermissions)
    .values({ roleId: 1, resource: 'user', action: 'manage' });

  // user_roles をリセットして user-1 の初期ロール（roleId=1）を復元する
  await ctx.tenantDb.delete(tenantSchema.tenantUserRoles);
  await ctx.tenantDb.insert(tenantSchema.tenantUserRoles).values({ userId: 1, roleId: 1 });

  // isDefault=0 のロール（テスト用に追加したもの）を削除して初期状態に戻す
  await ctx.tenantDb
    .delete(tenantSchema.tenantRoles)
    .where(eq(tenantSchema.tenantRoles.isDefault, 0));
});

// ---- テスト ----

describe('changeUserRole 統合テスト', () => {
  describe('Scenario: user.manage 権限を持つユーザーが PUT /api/users/:userId/roles にアクセスするとき', () => {
    test('200 が返り tenantUserRoles が更新されること', async () => {
      // Arrange: テスト用ロールを追加
      const [insertedRole] = await ctx.tenantDb
        .insert(tenantSchema.tenantRoles)
        .values({ name: 'guest', isDefault: 0 })
        .$returningId();
      const newRoleId = insertedRole.id;

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1/roles',
        {
          method: 'PUT',
          body: JSON.stringify({ roleId: newRoleId }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { user: { id: number; email: string; roleId: number } };
      expect(body.user.id).toBe(1);
      expect(body.user.email).toBe('user1@example.com');
      expect(body.user.roleId).toBe(newRoleId);

      // tenantUserRoles が更新されていること
      const rows = await ctx.tenantDb
        .select()
        .from(tenantSchema.tenantUserRoles)
        .where(eq(tenantSchema.tenantUserRoles.userId, 1));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.roleId).toBe(newRoleId);
    });
  });

  describe('Scenario: 存在しない userId を指定したとき', () => {
    test('404 not_found が返ること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/99999/roles',
        {
          method: 'PUT',
          body: JSON.stringify({ roleId: 1 }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toBe('User not found');
    });
  });

  describe('Scenario: 存在しない roleId を指定したとき', () => {
    test('422 unprocessable_entity が返ること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1/roles',
        {
          method: 'PUT',
          body: JSON.stringify({ roleId: 99999 }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(422);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('unprocessable_entity');
      expect(body.error.message).toBe('Role not found');
    });
  });

  describe('Scenario: user.manage 権限を持たないユーザーが PUT /api/users/:userId/roles にアクセスするとき', () => {
    test('403 Forbidden が返ること', async () => {
      // Arrange: userId=2（user-2-sub）は user.manage 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1/roles',
        {
          method: 'PUT',
          body: JSON.stringify({ roleId: 1 }),
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
