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
import { gt } from 'drizzle-orm';
import * as tenantSchema from '../db/tenant-template-schema';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { inviteUserHandler } from './inviteUser';
import type { HonoVariables } from '../hono/types';
import type { AppBindings } from '../hono/types';
import { useTenantTestContainer, makeMockEvent, setupDbMocks } from '../shared/test-helpers/mediumTestSetup';

// tenant_admin ロールに user.manage 権限を付与して DB をセットアップする
// mediumTestSetup シード:
//   tenantRoles: id=1 (member)
//   tenantUsers: id=1 (user-1, user-1-sub), id=2 (user-2, user-2-sub)
//   tenantUserRoles: userId=1, roleId=1
//   tenantRolePermissions: roleId=1, resource='user', action='manage'
const ctx = useTenantTestContainer([{ resource: 'user', action: 'manage' }]);
setupDbMocks(ctx);

// mini Hono app（inviteUser ルートのみ）
const testApp = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
testApp.use('*', tenantContext);
testApp.post('/api/users/invite', requirePermission('user', 'manage'), inviteUserHandler);

beforeEach(() => {
  mockCognitoSend.mockReset();
  mockCognitoSend.mockResolvedValue({ User: { Username: 'mock-cognito-sub' } });
});

afterEach(async () => {
  // テスト間の独立性を保つため、初期シード（id=1, id=2）以外のユーザーを削除する
  // user_roles は先に削除してから users を削除する（FK 制約）
  await ctx.tenantDb
    .delete(tenantSchema.tenantUserRoles)
    .where(gt(tenantSchema.tenantUserRoles.userId, 2));
  await ctx.tenantDb
    .delete(tenantSchema.tenantUsers)
    .where(gt(tenantSchema.tenantUsers.id, 2));
  // テストで追加したロール（id > 1）を削除する
  await ctx.tenantDb
    .delete(tenantSchema.tenantRoles)
    .where(gt(tenantSchema.tenantRoles.id, 1));
});

// ---- テスト ----

describe('inviteUser 統合テスト', () => {
  describe('Scenario: tenant_admin（user.manage 権限あり）が POST /api/users/invite にアクセスするとき', () => {
    test('正常なリクエストで 201 が返り、tenantUsers に 1 件追加されること', async () => {
      // Arrange: 招待先として tenant_user ロールを追加する
      const [insertedRole] = await ctx.tenantDb
        .insert(tenantSchema.tenantRoles)
        .values({ name: 'tenant_user', isDefault: 1 })
        .$returningId();

      // user-1（userId=1）が user.manage 権限を持つ tenant_user として招待操作する
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/invite',
        {
          method: 'POST',
          body: JSON.stringify({
            email: 'newuser@example.com',
            roleId: insertedRole.id,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as {
        user: { id: number; email: string; userType: string };
      };
      expect(body.user.id).toBeDefined();
      expect(body.user.email).toBe('newuser@example.com');
      expect(body.user.userType).toBe('tenant_user');

      // DB に 1 件追加されていることを確認（初期 2 件 + 新規 1 件 = 3 件）
      const rows = await ctx.tenantDb.select().from(tenantSchema.tenantUsers);
      expect(rows).toHaveLength(3);
    });
  });

  describe('Scenario: user.manage 権限のないユーザーが POST /api/users/invite にアクセスするとき', () => {
    test('403 Forbidden が返ること', async () => {
      // Arrange: user-2（userId=2）には user.manage 権限がない
      //   tenantUserRoles に userId=2 のエントリがないため、requirePermission で 403 になる
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/invite',
        {
          method: 'POST',
          body: JSON.stringify({
            email: 'another@example.com',
            roleId: 1,
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
