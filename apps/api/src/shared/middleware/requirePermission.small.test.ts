import { Hono } from 'hono';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { requirePermission } from './requirePermission';
import type { HonoVariables } from '../../hono/types';

// ---- モック tenantDb 構築ヘルパー ----

/**
 * select().from().innerJoin().where() チェーンを模倣する mock tenantDb を返す。
 * hasPermission が true のとき権限レコードを返し、false のとき空配列を返す。
 */
function createMockTenantDb(hasPermission: boolean) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(
            hasPermission
              ? [{ userId: 1, roleId: 1, resource: 'village', action: 'read' }]
              : [],
          ),
        }),
      }),
    }),
  };
}

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp(
  resource: string,
  action: string,
  variables: Partial<HonoVariables>,
) {
  const app = new Hono<{ Variables: HonoVariables }>();

  // 事前にコンテキスト変数をセット
  app.use('*', (c, next) => {
    for (const [key, value] of Object.entries(variables)) {
      c.set(key as keyof HonoVariables, value as HonoVariables[keyof HonoVariables]);
    }
    return next();
  });

  app.use('*', requirePermission(resource, action));
  app.get('/test', (c) => c.json({ ok: true }));
  return app;
}

// ---- テスト ----

describe('requirePermission ミドルウェア', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('servicer_admin のとき', () => {
    test('DB を参照せず next が呼ばれること', async () => {
      // Arrange
      const mockTenantDb = createMockTenantDb(false);
      const app = createTestApp('village', 'read', {
        userType: 'servicer_admin',
        userId: 10,
        tenantDb: mockTenantDb as unknown as HonoVariables['tenantDb'],
        tenantSlug: 'acme',
      });

      // Act
      const res = await app.request('/test');

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
      // DB を参照しないこと
      expect(mockTenantDb.select).not.toHaveBeenCalled();
    });
  });

  describe('tenant_user が対象リソース・アクションの権限を持つとき', () => {
    test('next が呼ばれること', async () => {
      // Arrange
      const mockTenantDb = createMockTenantDb(true);
      const app = createTestApp('village', 'read', {
        userType: 'tenant_user',
        userId: 1,
        tenantDb: mockTenantDb as unknown as HonoVariables['tenantDb'],
        tenantSlug: 'acme',
      });

      // Act
      const res = await app.request('/test');

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe('tenant_user が対象リソース・アクションの権限を持たないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const mockTenantDb = createMockTenantDb(false);
      const app = createTestApp('village', 'read', {
        userType: 'tenant_user',
        userId: 1,
        tenantDb: mockTenantDb as unknown as HonoVariables['tenantDb'],
        tenantSlug: 'acme',
      });

      // Act
      const res = await app.request('/test');

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('tenant_admin が対象リソース・アクションの権限を持つとき', () => {
    test('next が呼ばれること', async () => {
      // Arrange
      const mockTenantDb = createMockTenantDb(true);
      const app = createTestApp('village', 'write', {
        userType: 'tenant_admin',
        userId: 2,
        tenantDb: mockTenantDb as unknown as HonoVariables['tenantDb'],
        tenantSlug: 'acme',
      });

      // Act
      const res = await app.request('/test');

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe('servicer_delegate が対象リソース・アクションの権限を持つとき', () => {
    test('next が呼ばれること', async () => {
      // Arrange
      const mockTenantDb = createMockTenantDb(true);
      const app = createTestApp('village', 'read', {
        userType: 'servicer_delegate',
        userId: 20,
        tenantDb: mockTenantDb as unknown as HonoVariables['tenantDb'],
        tenantSlug: 'beta',
      });

      // Act
      const res = await app.request('/test');

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });
});
