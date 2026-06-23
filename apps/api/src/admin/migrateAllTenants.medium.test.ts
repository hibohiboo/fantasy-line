import { describe, test, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { Hono } from 'hono';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import path from 'path';
import { startServiceContainer } from '../shared/test-helpers/adminTestSetup';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import * as serviceSchema from '../db/service-schema';
import type * as MigrateAllTenantsModule from './migrateAllTenants';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----

const mockGetDb = vi.fn();
const mockResolveDbCredentials = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let migrateAllTenantsHandler: typeof MigrateAllTenantsModule.migrateAllTenantsHandler;

// ---- DB 関連の変数 ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceDb: any;
let rootPool: mysql.Pool;
let stopContainer: (() => Promise<void>) | undefined;
let containerHost: string;
let containerPort: number;

beforeAll(async () => {
  process.env['MIGRATIONS_TENANT_FOLDER'] = path.resolve(process.cwd(), 'drizzle-tenant');

  ({ host: containerHost, port: containerPort, rootPool, stop: stopContainer } = await startServiceContainer());

  const servicePool = mysql.createPool({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
    database: 'service',
  });
  serviceDb = drizzle({ client: servicePool, schema: serviceSchema, mode: 'default' });
  await migrate(serviceDb, {
    migrationsFolder: path.resolve(process.cwd(), 'drizzle-service'),
  });

  // vi.doMock でモジュールをモック設定
  vi.doMock('../db/client', () => ({
    getDb: mockGetDb,
    resolveDbCredentials: mockResolveDbCredentials,
  }));

  // ハンドラーを動的インポート
  ({ migrateAllTenantsHandler } = await import('./migrateAllTenants'));

  // モックのデフォルト設定
  mockGetDb.mockResolvedValue(serviceDb);
  mockResolveDbCredentials.mockResolvedValue({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
  });
}, 120000);

afterAll(async () => {
  await rootPool?.end();
  await stopContainer?.();
});

beforeEach(async () => {
  // テスト間でデータを独立させる
  await serviceDb.delete(serviceSchema.serviceTenants);
  vi.clearAllMocks();

  // clearAllMocks 後に再設定
  mockGetDb.mockResolvedValue(serviceDb);
  mockResolveDbCredentials.mockResolvedValue({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
  });
});

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

describe('migrateAllTenantsHandler medium テスト', () => {
  describe('Scenario 0b: 全テナントマイグレーション', () => {
    describe('2 テナントが存在し全て成功するとき', () => {
      test('200 OK が返ること', async () => {
        // Arrange: 2 テナントを service.tenants に登録
        await serviceDb.insert(serviceSchema.serviceTenants).values([
          { slug: 'alpha', name: 'Alpha テナント' },
          { slug: 'beta', name: 'Beta テナント' },
        ]);

        // resolveDbCredentials がテストコンテナの接続情報を返すので
        // CREATE DATABASE と実際の Drizzle migrate がテストコンテナ上で成功する

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        expect(res.status).toBe(200);
        const body = await res.json() as { success: number; failed: string[] };
        expect(body.success).toBe(2);
        expect(body.failed).toEqual([]);
      });

      test('{ success: 2, failed: [] } が返ること', async () => {
        // Arrange
        await serviceDb.insert(serviceSchema.serviceTenants).values([
          { slug: 'alpha', name: 'Alpha テナント' },
          { slug: 'beta', name: 'Beta テナント' },
        ]);
        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        const body = await res.json() as { success: number; failed: string[] };
        expect(body).toEqual({ success: 2, failed: [] });
      });
    });

    describe('1 テナントのマイグレーションが失敗するとき', () => {
      test('207 Multi-Status が返ること', async () => {
        // Arrange: 2 テナントを登録し、beta のマイグレーション時に接続エラーを発生させる
        await serviceDb.insert(serviceSchema.serviceTenants).values([
          { slug: 'alpha', name: 'Alpha テナント' },
          { slug: 'beta', name: 'Beta テナント（失敗）' },
        ]);

        // beta テナントの resolveDbCredentials 呼び出し時に失敗させる
        // migrateAllTenants.ts は各テナントの migrateTenant 内で resolveDbCredentials を呼ぶ
        mockResolveDbCredentials
          .mockResolvedValueOnce({
            host: containerHost,
            port: containerPort,
            user: 'root',
            password: 'rootpass',
          })
          .mockRejectedValueOnce(new Error('beta テナントの DB 認証情報取得失敗'));

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        expect(res.status).toBe(207);
      });

      test('{ success: 1, failed: [...] } が返ること', async () => {
        // Arrange
        await serviceDb.insert(serviceSchema.serviceTenants).values([
          { slug: 'alpha', name: 'Alpha テナント' },
          { slug: 'beta', name: 'Beta テナント（失敗）' },
        ]);

        mockResolveDbCredentials
          .mockResolvedValueOnce({
            host: containerHost,
            port: containerPort,
            user: 'root',
            password: 'rootpass',
          })
          .mockRejectedValueOnce(new Error('beta テナントの DB 認証情報取得失敗'));

        const app = createTestApp();

        // Act
        const res = await sendRequest(app);

        // Assert
        const body = await res.json() as { success: number; failed: string[] };
        expect(body.success).toBe(1);
        expect(body.failed).toEqual(['beta']);
      });
    });
  });
});
