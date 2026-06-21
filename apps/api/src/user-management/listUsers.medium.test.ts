// vi.mock は Vitest がファイル先頭にホイストするため最初に記述する
vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { vi, describe, test, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { getDb, getTenantDb } from '../db/client';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { listUsersHandler } from './listUsers';
import { useTenantTestContainer, makeMockEvent } from '../shared/test-helpers/mediumTestSetup';
import type { AppBindings, HonoVariables } from '../hono/types';

// userId=1 に user.list 権限を付与する。userId=2 には権限を持たせない
const ctx = useTenantTestContainer([{ resource: 'user', action: 'list' }]);

// mini app: app.ts にまだ /api/users ルートがないため独自に構築する
const testApp = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
testApp.use('*', tenantContext);
testApp.get('/api/users', requirePermission('user', 'list'), listUsersHandler);

beforeAll(() => {
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(ctx.serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(ctx.tenantDb);
});

// ---- テスト ----

describe('listUsers 統合テスト', () => {
  describe('Scenario: user.list 権限を持つ tenant_user が GET /api/users にアクセスするとき', () => {
    test('200 と users 配列が返ること', async () => {
      // Arrange: seeder で userId=1（user-1-sub）に user.list 権限が付与されている
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request('/api/users', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { users: unknown[] };
      // seeder が user-1-sub と user-2-sub を挿入しているため最低 2 件返る
      expect(Array.isArray(body.users)).toBe(true);
      expect((body.users as unknown[]).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Scenario: user.list 権限を持たないユーザーが GET /api/users にアクセスするとき', () => {
    test('403 Forbidden が返ること', async () => {
      // Arrange: userId=2（user-2-sub）は user.list 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request('/api/users', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('Scenario: ユーザーに roleName が含まれること', () => {
    test('userId=1 のレスポンスに roleName フィールドが存在すること', async () => {
      // Arrange
      // seeder が userId=1 に roleId=1 を紐付け、role name は 'member'
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await testApp.request('/api/users', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as {
        users: Array<{
          id: number;
          email: string;
          userType: string;
          roleName: string | null;
        }>;
      };

      // user-1 は roleId=1（name='member'）が割り当てられている
      const user1 = body.users.find((u) => u.email === 'user1@example.com');
      expect(user1).toBeDefined();
      expect(user1?.roleName).toBe('member');

      // user-2 はロール未割当なので roleName が null であること（LEFT JOIN の振る舞い）
      const user2 = body.users.find((u) => u.email === 'user2@example.com');
      expect(user2).toBeDefined();
      expect(user2?.roleName).toBeNull();
    });
  });
});
