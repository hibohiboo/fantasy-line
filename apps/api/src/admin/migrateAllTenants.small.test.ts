import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import type * as MigrateAllTenantsModule from './migrateAllTenants';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----

const mockGetDb = vi.fn();
const mockResolveDbCredentials = vi.fn();
const mockCreateConnection = vi.fn();
const mockMigrate = vi.fn();
const mockDrizzle = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let migrateAllTenantsHandler: typeof MigrateAllTenantsModule.migrateAllTenantsHandler;

beforeAll(async () => {
  vi.doMock('../db/client', () => ({
    getDb: mockGetDb,
    resolveDbCredentials: mockResolveDbCredentials,
  }));
  vi.doMock('mysql2/promise', () => ({
    createConnection: mockCreateConnection,
  }));
  vi.doMock('drizzle-orm/mysql2/migrator', () => ({
    migrate: mockMigrate,
  }));
  vi.doMock('drizzle-orm/mysql2', () => ({
    drizzle: mockDrizzle,
  }));

  ({ migrateAllTenantsHandler } = await import('./migrateAllTenants'));
});

// ---- ヘルパー型 ----

/** Drizzle select チェーンのモック型 */
type DrizzleSelectMock = {
  select: () => { from: () => { where: () => Promise<{ slug: string }[]> } };
};

// ---- テスト用 Drizzle モック構築ヘルパー ----

/**
 * service DB モック。
 * select().from().where() の呼び出し順に対応する rows 配列を返す。
 */
function makeServiceDbMock(slugRows: { slug: string }[]): DrizzleSelectMock {
  return {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(slugRows),
      }),
    }),
  };
}

/** 接続モックを作成する */
function makeConnectionMock() {
  return {
    execute: vi.fn().mockResolvedValue([[]]),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/migrate/all-tenants', (c) => migrateAllTenantsHandler(c));
  return app;
}

async function sendRequest(app: ReturnType<typeof createTestApp>) {
  return app.request('/admin/migrate/all-tenants', { method: 'POST' }, {});
}

// ---- テスト ----

describe('migrateAllTenantsHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // デフォルトの DB 接続情報モック
    mockResolveDbCredentials.mockResolvedValue({
      host: 'localhost',
      port: 3306,
      user: 'testuser',
      password: 'testpass',
    });

    // デフォルトの drizzle モック
    mockDrizzle.mockReturnValue({});
  });

  describe('Scenario 0b: 全テナントマイグレーション', () => {
    describe('3 テナント全て成功するとき', () => {
      test('200 OK と { success: 3, failed: [] } が返ること', async () => {
        // Arrange
        const slugRows = [{ slug: 'tenant-a' }, { slug: 'tenant-b' }, { slug: 'tenant-c' }];
        mockGetDb.mockResolvedValue(makeServiceDbMock(slugRows));

        // 各テナントに対して initConn と tenantConn の 2 つの接続を返す
        const connA1 = makeConnectionMock();
        const connA2 = makeConnectionMock();
        const connB1 = makeConnectionMock();
        const connB2 = makeConnectionMock();
        const connC1 = makeConnectionMock();
        const connC2 = makeConnectionMock();
        mockCreateConnection
          .mockResolvedValueOnce(connA1)
          .mockResolvedValueOnce(connA2)
          .mockResolvedValueOnce(connB1)
          .mockResolvedValueOnce(connB2)
          .mockResolvedValueOnce(connC1)
          .mockResolvedValueOnce(connC2);
        mockMigrate.mockResolvedValue(undefined);

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        expect(res.status).toBe(200);
        const body = await res.json() as { success: number; failed: string[] };
        expect(body.success).toBe(3);
        expect(body.failed).toEqual([]);
      });

      test('各テナントの migrate が呼ばれること', async () => {
        // Arrange
        const slugRows = [{ slug: 'tenant-a' }, { slug: 'tenant-b' }, { slug: 'tenant-c' }];
        mockGetDb.mockResolvedValue(makeServiceDbMock(slugRows));

        // 各テナントに対して initConn と tenantConn の 2 つの接続を返す
        const connections = Array.from({ length: 6 }, () => makeConnectionMock());
        for (const conn of connections) {
          mockCreateConnection.mockResolvedValueOnce(conn);
        }
        mockMigrate.mockResolvedValue(undefined);

        const app = createTestApp();

        // Act
        await sendRequest(app);

        // Assert
        expect(mockMigrate).toHaveBeenCalledTimes(3);
      });
    });

    describe('1 テナントが失敗するとき', () => {
      test('207 Multi-Status と { success: 2, failed: ["failed-tenant"] } が返ること', async () => {
        // Arrange
        const slugRows = [
          { slug: 'tenant-a' },
          { slug: 'failed-tenant' },
          { slug: 'tenant-c' },
        ];
        mockGetDb.mockResolvedValue(makeServiceDbMock(slugRows));

        const connA1 = makeConnectionMock();
        const connA2 = makeConnectionMock();
        const connFail = makeConnectionMock();
        const connC1 = makeConnectionMock();
        const connC2 = makeConnectionMock();
        mockCreateConnection
          .mockResolvedValueOnce(connA1)
          .mockResolvedValueOnce(connA2)
          .mockResolvedValueOnce(connFail) // failed-tenant の initConn
          .mockResolvedValueOnce(connC1)
          .mockResolvedValueOnce(connC2);

        // failed-tenant の initConn.execute でエラーを発生させる
        connFail.execute.mockRejectedValueOnce(new Error('DB error'));

        mockMigrate.mockResolvedValue(undefined);

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        expect(res.status).toBe(207);
        const body = await res.json() as { success: number; failed: string[] };
        expect(body.success).toBe(2);
        expect(body.failed).toEqual(['failed-tenant']);
      });

      test('失敗テナントの後も他のテナントの処理が続くこと', async () => {
        // Arrange
        const slugRows = [
          { slug: 'tenant-a' },
          { slug: 'failed-tenant' },
          { slug: 'tenant-c' },
        ];
        mockGetDb.mockResolvedValue(makeServiceDbMock(slugRows));

        const connA1 = makeConnectionMock();
        const connA2 = makeConnectionMock();
        const connFail = makeConnectionMock();
        const connC1 = makeConnectionMock();
        const connC2 = makeConnectionMock();
        mockCreateConnection
          .mockResolvedValueOnce(connA1)
          .mockResolvedValueOnce(connA2)
          .mockResolvedValueOnce(connFail)
          .mockResolvedValueOnce(connC1)
          .mockResolvedValueOnce(connC2);

        connFail.execute.mockRejectedValueOnce(new Error('DB error'));
        mockMigrate.mockResolvedValue(undefined);

        const app = createTestApp();

        // Act
        await sendRequest(app);

        // Assert: tenant-a と tenant-c の migrate が呼ばれること（failed-tenant は除く）
        expect(mockMigrate).toHaveBeenCalledTimes(2);
      });
    });

    describe('テナントが 0 件のとき', () => {
      test('200 OK と { success: 0, failed: [] } が返ること', async () => {
        // Arrange
        mockGetDb.mockResolvedValue(makeServiceDbMock([]));

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        expect(res.status).toBe(200);
        const body = await res.json() as { success: number; failed: string[] };
        expect(body.success).toBe(0);
        expect(body.failed).toEqual([]);
      });
    });
  });
});
