// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
const { mockCognitoSend } = vi.hoisted(() => ({
  mockCognitoSend: vi.fn(),
}));

vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: class MockCognitoClient {
    send = mockCognitoSend;
  },
  AdminCreateUserCommand: vi.fn(),
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { vi, describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { getDb, getTenantDb } from '../db/client';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { resendInvitationHandler } from './resendInvitation';
import { useTenantTestContainer, makeMockEvent } from '../shared/test-helpers/mediumTestSetup';
import type { AppBindings, HonoVariables } from '../hono/types';

// userId=1 に user.manage 権限を付与する。userId=2 には権限を持たせない
// mediumTestSetup シード:
//   tenantRoles: id=1 (member)
//   tenantUsers: id=1 (user-1, user-1-sub), id=2 (user-2, user-2-sub)
//   tenantUserRoles: userId=1, roleId=1
//   tenantRolePermissions: roleId=1, resource='user', action='manage'
const ctx = useTenantTestContainer([{ resource: 'user', action: 'manage' }]);

// app.ts にはまだルートがないため、独自の mini Hono app を作成する
const testApp = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
testApp.use('*', tenantContext);
testApp.post(
  '/api/users/:userId/resend-invitation',
  requirePermission('user', 'manage'),
  resendInvitationHandler,
);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

beforeEach(() => {
  mockCognitoSend.mockReset();
});

// ---- テスト ----

describe('resendInvitation 統合テスト', () => {
  describe('Scenario: user.manage 権限を持つユーザーが存在するユーザーへ再送するとき', () => {
    test('200 が返り、Cognito が 1 回呼ばれること', async () => {
      // Arrange: user-1（userId=1）が user.manage 権限を持つ
      mockCognitoSend.mockResolvedValue({});

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1/resend-invitation',
        { method: 'POST' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { message: string };
      expect(body.message).toBe('invitation resent');

      // Cognito が 1 回呼ばれること
      expect(mockCognitoSend).toHaveBeenCalledOnce();
    });
  });

  describe('Scenario: 存在しない userId を指定したとき', () => {
    test('404 と not_found が返ること', async () => {
      // Arrange: userId=999 は存在しない
      mockCognitoSend.mockResolvedValue({});

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/999/resend-invitation',
        { method: 'POST' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(404);
      const body = await response.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('not_found');
    });
  });

  describe('Scenario: user.manage 権限を持たないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること', async () => {
      // Arrange: user-2（userId=2）は user.manage 権限がない
      //   tenantUserRoles に userId=2 のエントリがないため、requirePermission で 403 になる
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request(
        '/api/users/1/resend-invitation',
        { method: 'POST' },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
