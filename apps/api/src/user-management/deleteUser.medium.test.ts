// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
const { mockCognitoSend } = vi.hoisted(() => ({ mockCognitoSend: vi.fn() }));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class MockCognitoClient {
    send = mockCognitoSend;
  },
  AdminCreateUserCommand: vi.fn(),
  AdminDisableUserCommand: vi.fn(),
  AdminDeleteUserCommand: vi.fn(),
  UsernameExistsException: class UsernameExistsException extends Error {
    constructor() {
      super();
      this.name = 'UsernameExistsException';
    }
  },
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { vi, describe, test, expect, afterEach, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import * as tenantSchema from '../db/tenant-template-schema';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { deleteUserHandler } from './deleteUser';
import type { HonoVariables } from '../hono/types';
import type { AppBindings } from '../hono/types';
import { useTenantTestContainer, makeMockEvent, setupDbMocks } from '../shared/test-helpers/mediumTestSetup';

// mediumTestSetup シード:
//   tenantRoles: id=1 (member, isDefault=1)
//   tenantUsers: id=1 (user-1-sub), id=2 (user-2-sub)
//   tenantUserRoles: userId=1, roleId=1
//   tenantRolePermissions: roleId=1, resource='user', action='manage'
//
// つまり user-1（userId=1）だけが user.manage 権限を持つ（ラストアドミン状態）
const ctx = useTenantTestContainer([{ resource: 'user', action: 'manage' }]);
setupDbMocks(ctx);

// mini Hono app（deleteUser ルートのみ）
const testApp = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
testApp.use('*', tenantContext);
testApp.delete('/api/users/:userId', requirePermission('user', 'manage'), deleteUserHandler);

beforeEach(() => {
  mockCognitoSend.mockReset();
  mockCognitoSend.mockResolvedValue({});
});

afterEach(async () => {
  // テスト間の独立性を保つため、user-2 の user_roles エントリを削除する
  // （正常系テストで追加した userId=2 の user_roles をリセット）
  await ctx.tenantDb
    .delete(tenantSchema.tenantUserRoles)
    .where(eq(tenantSchema.tenantUserRoles.userId, 2));

  // user-2 が削除されたテストの後、再作成して次のテストで使えるようにする
  const user2Rows = await ctx.tenantDb
    .select()
    .from(tenantSchema.tenantUsers)
    .where(eq(tenantSchema.tenantUsers.id, 2));

  if (user2Rows.length === 0) {
    await ctx.tenantDb.insert(tenantSchema.tenantUsers).values({
      id: 2,
      cognitoSub: 'user-2-sub',
      email: 'user2@example.com',
      userType: 'tenant_user',
    });
  }
});

// ---- テスト ----

describe('deleteUser 統合テスト', () => {
  describe('Scenario: ラストアドミン（user-1）を削除しようとするとき', () => {
    test('409 と last_admin が返ること', async () => {
      // Arrange: user-1 だけが user.manage 権限を持つ（初期シードのまま）
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1',
        { method: 'DELETE' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(409);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('last_admin');
      expect(body.error.message).toBe('Cannot delete the last admin');

      // DB から user-1 が削除されていないことを確認
      const remaining = await ctx.tenantDb
        .select()
        .from(tenantSchema.tenantUsers)
        .where(eq(tenantSchema.tenantUsers.id, 1));
      expect(remaining).toHaveLength(1);
    });
  });

  describe('Scenario: user.manage 権限のないユーザー（user-2）を削除するとき', () => {
    test('204 が返り、DB から user-2 が削除されること', async () => {
      // Arrange: user-2 に roleId=1 の user_roles を付与しておく（ラストアドミンでない状態を作る）
      await ctx.tenantDb
        .insert(tenantSchema.tenantUserRoles)
        .values({ userId: 2, roleId: 1 });

      // user-1（userId=1）が user.manage 権限を持つユーザーとして削除操作する
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/2',
        { method: 'DELETE' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(204);

      // DB から user-2 が削除されていることを確認
      const remaining = await ctx.tenantDb
        .select()
        .from(tenantSchema.tenantUsers)
        .where(eq(tenantSchema.tenantUsers.id, 2));
      expect(remaining).toHaveLength(0);
    });
  });

  describe('Scenario: user.manage 権限のないユーザーが DELETE /api/users/:userId にアクセスするとき', () => {
    test('403 Forbidden が返ること', async () => {
      // Arrange: user-2（userId=2）には user.manage 権限がない（user_roles エントリなし）
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1',
        { method: 'DELETE' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
