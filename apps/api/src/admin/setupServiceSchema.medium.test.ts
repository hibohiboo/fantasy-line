import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import path from 'path';
import { GenericContainer, Wait } from 'testcontainers';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import type * as SetupServiceSchemaModule from './setupServiceSchema';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----

const mockResolveDbCredentials = vi.fn();
const mockMigrate = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let setupServiceSchemaHandler: typeof SetupServiceSchemaModule.setupServiceSchemaHandler;

// ---- DB 関連の変数 ----
let servicePool: mysql.Pool;
let rootPool: mysql.Pool;
let stopContainer: (() => Promise<void>) | undefined;
let containerHost: string;
let containerPort: number;

beforeAll(async () => {
  // Testcontainer 起動
  const container = await new GenericContainer('mysql:8.0')
    .withEnvironment({ MYSQL_ROOT_PASSWORD: 'rootpass' })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
    .start();

  stopContainer = () => container.stop();
  containerHost = container.getHost();
  containerPort = container.getMappedPort(3306);

  rootPool = mysql.createPool({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
    multipleStatements: true,
  });

  // MySQL が完全に起動するまで待機
  for (let i = 0; i < 20; i++) {
    try {
      await rootPool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // service データベースを作成してマイグレーション適用
  await rootPool.query('CREATE DATABASE IF NOT EXISTS `service`');

  // migrate は Connection を必要とするため、単発 Connection で実行する
  const migrateConn = await mysql.createConnection({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
    database: 'service',
  });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const migrateDb: any = drizzle({ client: migrateConn, mode: 'default' });
    await migrate(migrateDb, {
      migrationsFolder: path.resolve(process.cwd(), 'drizzle-service'),
    });
  } finally {
    await migrateConn.end();
  }

  // クエリ用 Pool（テスト内の SQL 検証で使用）
  servicePool = mysql.createPool({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
    database: 'service',
  });

  // vi.doMock でモジュールをモック設定
  vi.doMock('../db/client', () => ({
    resolveDbCredentials: mockResolveDbCredentials,
  }));

  // ハンドラー内の migrate をモックする（service DB は既にセットアップ済みのため）
  vi.doMock('drizzle-orm/mysql2/migrator', () => ({
    migrate: mockMigrate,
  }));

  // ハンドラーを動的インポート
  ({ setupServiceSchemaHandler } = await import('./setupServiceSchema'));

  // resolveDbCredentials がテストコンテナの接続情報を返す
  mockResolveDbCredentials.mockResolvedValue({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
  });
  mockMigrate.mockResolvedValue(undefined);
}, 120000);

afterAll(async () => {
  await servicePool?.end();
  await rootPool?.end();
  await stopContainer?.();
});

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp(handler: typeof setupServiceSchemaHandler) {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/setup/service-schema', handler);
  return app;
}

async function sendRequest(app: ReturnType<typeof createTestApp>) {
  return app.request('/admin/setup/service-schema', { method: 'POST' }, {});
}

// ---- テスト ----

describe('setupServiceSchema medium テスト', () => {
  describe('Scenario A: 冪等性 — 2 回実行しても 200 OK が返ること', () => {
    test('1 回目の呼び出しで 200 OK が返ること', async () => {
      // Arrange
      const app = createTestApp(setupServiceSchemaHandler);

      // Act
      const res = await sendRequest(app);

      // Assert
      expect(res.status).toBe(200);
    });

    test('2 回目の呼び出しでも 200 OK が返ること', async () => {
      // Arrange
      const app = createTestApp(setupServiceSchemaHandler);

      // Act
      const res = await sendRequest(app);

      // Assert
      expect(res.status).toBe(200);
    });

    test('service.roles に servicer_admin と servicer_delegate が 1 件ずつ存在すること', async () => {
      // Arrange: この時点で既に 2 回呼び出し済み（前テストで実行）
      // Act: 直接 SQL で service.roles を確認する
      const [rows] = await servicePool.query<mysql.RowDataPacket[]>(
        'SELECT name FROM service.roles ORDER BY name',
      );

      // Assert: 重複なく 2 件のみ存在すること
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ name: 'servicer_admin' });
      expect(rows[1]).toMatchObject({ name: 'servicer_delegate' });
    });

    test('service.role_permissions に servicer_delegate の village:read 権限が存在すること', async () => {
      // Act: 直接 SQL で service.role_permissions を確認する
      const [rows] = await servicePool.query<mysql.RowDataPacket[]>(
        `SELECT rp.resource, rp.action
         FROM service.role_permissions rp
         INNER JOIN service.roles r ON rp.role_id = r.id
         WHERE r.name = 'servicer_delegate' AND rp.resource = 'village' AND rp.action = 'read'`,
      );

      // Assert: 1 件存在すること
      expect(rows).toHaveLength(1);
    });
  });
});
