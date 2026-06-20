import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { HonoVariables } from '../../hono/types';
import type * as TenantContextModule from './tenantContext';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----
const mockGetDb = vi.fn();
const mockGetTenantDb = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let tenantContext: typeof TenantContextModule.tenantContext;

beforeAll(async () => {
  vi.doMock('../../db/client', () => ({
    getDb: mockGetDb,
    getTenantDb: mockGetTenantDb,
  }));
  ({ tenantContext } = await import('./tenantContext'));
});

// ---- ヘルパー型 ----

/** テスト用 Lambda event の最小型 */
type MockLambdaEvent = {
  requestContext: {
    authorizer: {
      jwt: {
        claims: Record<string, string>;
      };
    };
  };
  headers?: Record<string, string>;
};

/** テスト用 Drizzle-like mock の最小型 */
type DrizzleMock = {
  select: () => { from: () => { where: () => Promise<unknown[]> } };
};

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp() {
  const app = new Hono<{ Variables: HonoVariables; Bindings: { event: MockLambdaEvent } }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use('*', tenantContext as any);
  app.get('/test', (c) =>
    c.json({
      tenantSlug: c.get('tenantSlug'),
      userId: c.get('userId'),
      userType: c.get('userType'),
    }),
  );
  return app;
}

/** JWT claims と任意ヘッダーを持つ mock event を生成する */
function makeMockEvent(
  claims: Record<string, string>,
  headers?: Record<string, string>,
): MockLambdaEvent {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
    headers,
  };
}

/** Hono の env として event を渡してリクエストを送る */
async function sendRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  env: { event: MockLambdaEvent },
  headers?: Record<string, string>,
) {
  return app.request(path, { headers }, env);
}

// ---- Drizzle モック構築ヘルパー ----

/**
 * service DB モック。
 * select().from().where() の呼び出し順に対応する rows 配列を返す。
 * - queriesResults[0]: 1回目のクエリ（serviceTenants）の結果
 * - queriesResults[1]: 2回目のクエリ（serviceUsers）の結果
 * - queriesResults[2]: 3回目のクエリ（serviceUserTenantRoles）の結果
 */
function makeServiceDbMock(...queriesResults: unknown[][]): DrizzleMock {
  let callCount = 0;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const rows = queriesResults[callCount] ?? [];
          callCount++;
          return Promise.resolve(rows);
        },
      }),
    }),
  };
}

/** tenant DB モック: ユーザー検索結果を返す */
function makeTenantDbMock(userRows: unknown[]): DrizzleMock {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(userRows),
      }),
    }),
  };
}

// ---- テスト ----

describe('tenantContext ミドルウェア', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tenant_user が有効なテナントにアクセスするとき', () => {
    test('tenantDb / tenantSlug / userId / userType が context にセットされ next が呼ばれること', async () => {
      // Arrange
      const slug = 'acme-corp';
      const cognitoSub = 'sub-001';
      const userId = 42;
      const mockTenantDb = makeTenantDbMock([{ id: userId, cognitoSub }]);
      const mockServiceDb = makeServiceDbMock(
        [{ id: 1, slug, status: 'active' }], // serviceTenants クエリ
      );

      mockGetDb.mockResolvedValue(mockServiceDb);
      mockGetTenantDb.mockReturnValue(mockTenantDb);

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': slug,
        sub: cognitoSub,
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { tenantSlug: string; userId: number; userType: string };
      expect(body.tenantSlug).toBe(slug);
      expect(body.userId).toBe(userId);
      expect(body.userType).toBe('tenant_user');
    });
  });

  describe('servicer_admin が X-Tenant-Id ヘッダー付きでアクセスするとき', () => {
    test('service.user_tenant_roles を確認し context がセットされ next が呼ばれること', async () => {
      // Arrange
      const slug = 'beta';
      const cognitoSub = 'sub-admin-001';
      const serviceUserId = 10;
      const mockTenantDb = makeTenantDbMock([]);
      // 3クエリ分の結果を順番に指定する:
      // 1. serviceTenants（テナント確認）
      // 2. serviceUsers（cognitoSub からユーザー取得）
      // 3. serviceUserTenantRoles（アクセス権確認）
      const mockServiceDb = makeServiceDbMock(
        [{ id: 1, slug, status: 'active' }],
        [{ id: serviceUserId, cognitoSub, email: 'admin@example.com', userType: 'servicer_admin' }],
        [{ userId: serviceUserId, tenantId: 1, roleId: 1 }],
      );

      mockGetDb.mockResolvedValue(mockServiceDb);
      mockGetTenantDb.mockReturnValue(mockTenantDb);

      const app = createTestApp();
      const event = makeMockEvent(
        {
          'custom:user_type': 'servicer_admin',
          sub: cognitoSub,
        },
        { 'X-Tenant-Id': slug },
      );

      // Act
      const res = await sendRequest(app, '/test', { event }, { 'X-Tenant-Id': slug });

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { tenantSlug: string; userId: number; userType: string };
      expect(body.tenantSlug).toBe(slug);
      expect(body.userId).toBe(serviceUserId);
      expect(body.userType).toBe('servicer_admin');
    });
  });

  describe('servicer_delegate が X-Tenant-Id ヘッダーなしでアクセスするとき', () => {
    test('400 が返ること', async () => {
      // Arrange
      const cognitoSub = 'sub-delegate-001';
      mockGetDb.mockResolvedValue(makeServiceDbMock());

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'servicer_delegate',
        sub: cognitoSub,
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(400);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Bad Request');
    });
  });

  describe('servicer_delegate のテナントアクセス権がないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const slug = 'acme-corp';
      const cognitoSub = 'sub-delegate-002';
      const serviceUserId = 20;
      // テナントは存在し service user も存在するが、user_tenant_roles が空（アクセス権なし）
      const mockServiceDb = makeServiceDbMock(
        [{ id: 1, slug, status: 'active' }],
        [{ id: serviceUserId, cognitoSub, email: 'delegate@example.com', userType: 'servicer_delegate' }],
        [], // roleRows が空 → 403
      );
      mockGetDb.mockResolvedValue(mockServiceDb);
      mockGetTenantDb.mockReturnValue(makeTenantDbMock([]));

      const app = createTestApp();
      const event = makeMockEvent(
        {
          'custom:user_type': 'servicer_delegate',
          sub: cognitoSub,
        },
        { 'X-Tenant-Id': slug },
      );

      // Act
      const res = await sendRequest(app, '/test', { event }, { 'X-Tenant-Id': slug });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('tenant_user で custom:tenant_id がないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_user',
        sub: 'sub-no-tenant',
        // custom:tenant_id を意図的に省略
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('テナントが inactive のとき', () => {
    test('503 が返ること', async () => {
      // Arrange
      const slug = 'suspended-tenant';
      const mockServiceDb = makeServiceDbMock(
        [{ id: 2, slug, status: 'suspended' }], // status が 'active' でない
      );
      mockGetDb.mockResolvedValue(mockServiceDb);

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': slug,
        sub: 'sub-003',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(503);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Service Unavailable');
    });
  });

  describe('テナントスキーマにユーザーが存在しないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const slug = 'acme-corp';
      const mockServiceDb = makeServiceDbMock(
        [{ id: 1, slug, status: 'active' }], // テナントは active
      );
      const mockTenantDb = makeTenantDbMock([]); // テナント DB にユーザーなし

      mockGetDb.mockResolvedValue(mockServiceDb);
      mockGetTenantDb.mockReturnValue(mockTenantDb);

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': slug,
        sub: 'sub-unknown',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('不正な user_type のとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'unknown_role',
        sub: 'sub-invalid',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
