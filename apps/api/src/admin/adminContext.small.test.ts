import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import type * as AdminContextModule from './adminContext';
import { makeMockEvent, type MockLambdaEvent } from '../shared/test-helpers/adminTestHelpers';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----
const mockGetDb = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let adminContext: typeof AdminContextModule.adminContext;

beforeAll(async () => {
  vi.doMock('../db/client', () => ({ getDb: mockGetDb }));
  ({ adminContext } = await import('./adminContext'));
});

// ---- ヘルパー型 ----

/** テスト用 Drizzle-like mock の最小型 */
type DrizzleMock = {
  select: () => { from: () => { where: () => Promise<unknown[]> } };
};

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use('*', adminContext as any);
  app.get('/test', (c) =>
    c.json({
      userId: c.get('userId'),
      cognitoSub: c.get('cognitoSub'),
    }),
  );
  return app;
}

/** Hono の env として event を渡してリクエストを送る */
async function sendRequest(
  app: ReturnType<typeof createTestApp>,
  path: string,
  env: { event: MockLambdaEvent },
) {
  return app.request(path, {}, env);
}

// ---- Drizzle モック構築ヘルパー ----

/**
 * service DB モック。
 * select().from().where() の呼び出し順に対応する rows 配列を返す。
 * - queriesResults[0]: 1回目のクエリ（serviceUsers）の結果
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

// ---- テスト ----

describe('adminContext ミドルウェア', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('servicer_admin の有効な JWT でリクエストするとき', () => {
    test('userId と cognitoSub が context にセットされ next が呼ばれること', async () => {
      // Arrange
      const cognitoSub = 'sub-admin-001';
      const userId = 10;
      const mockServiceDb = makeServiceDbMock(
        [{ id: userId, cognitoSub, email: 'admin@example.com', userType: 'servicer_admin' }],
      );
      mockGetDb.mockResolvedValue(mockServiceDb);

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'servicer_admin',
        sub: cognitoSub,
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { userId: number; cognitoSub: string };
      expect(body.userId).toBe(userId);
      expect(body.cognitoSub).toBe(cognitoSub);
    });
  });

  describe('servicer_admin 以外の user_type でリクエストするとき', () => {
    test('tenant_admin は 403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_admin',
        sub: 'sub-tenant-admin-001',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });

    test('tenant_user は 403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'tenant_user',
        sub: 'sub-tenant-user-001',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });

    test('servicer_delegate は 403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'servicer_delegate',
        sub: 'sub-delegate-001',
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('JWT に sub がないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'servicer_admin',
        // sub を意図的に省略
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('service.users にユーザーが存在しないとき', () => {
    test('403 が返ること', async () => {
      // Arrange
      const cognitoSub = 'sub-unknown';
      const mockServiceDb = makeServiceDbMock(
        [], // serviceUsers が空 = ユーザー不在
      );
      mockGetDb.mockResolvedValue(mockServiceDb);

      const app = createTestApp();
      const event = makeMockEvent({
        'custom:user_type': 'servicer_admin',
        sub: cognitoSub,
      });

      // Act
      const res = await sendRequest(app, '/test', { event });

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });

  describe('user_type が不正な値のとき', () => {
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
