import { describe, test, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { Hono } from 'hono';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import path from 'path';
import { eq } from 'drizzle-orm';
import { GenericContainer, Wait } from 'testcontainers';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import { adminContext } from './adminContext';
import * as serviceSchema from '../db/service-schema';
import type * as CreateTenantModule from './createTenant';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----

const mockGetDb = vi.fn();
const mockGetTenantDb = vi.fn();
const mockResolveDbCredentials = vi.fn();
const mockCognitoSend = vi.fn();
const mockMigrate = vi.fn();
const mockDrizzle = vi.fn();

// mysql2/promise の createConnection はハンドラー内で動的 import されるが
// Step 2 の CREATE DATABASE と Step 3 のマイグレーション接続に使われる
// テストコンテナへの実接続を使うため、ここでは上書きしない
// （migrate と drizzle のみをモックして実マイグレーションをスキップする）

// ---- テスト対象は beforeAll で動的インポートする ----
let createTenantHandler: typeof CreateTenantModule.createTenantHandler;

// ---- DB 関連の変数 ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceDb: any;
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

  // service.users にテスト用 servicer_admin を登録（adminContext テスト用）
  await serviceDb.insert(serviceSchema.serviceUsers).values({
    cognitoSub: 'admin-sub-001',
    email: 'admin@example.com',
    userType: 'servicer_admin',
  });

  // vi.doMock でモジュールをモック設定
  vi.doMock('../db/client', () => ({
    getDb: mockGetDb,
    getTenantDb: mockGetTenantDb,
    resolveDbCredentials: mockResolveDbCredentials,
  }));

  vi.doMock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: vi.fn(function () {
      return { send: mockCognitoSend };
    }),
    // new で呼ばれるため class 構文を使う（アロー関数は constructor として使用不可）
    AdminCreateUserCommand: class {
      _input: unknown;
      constructor(args: unknown) { this._input = args; }
    },
    AdminDeleteUserCommand: class {
      _input: unknown;
      constructor(args: unknown) { this._input = args; }
    },
  }));

  // migrate と drizzle のみモック（実マイグレーションは CI 環境でのパス問題を回避するため）
  vi.doMock('drizzle-orm/mysql2/migrator', () => ({
    migrate: mockMigrate,
  }));
  vi.doMock('drizzle-orm/mysql2', () => ({
    drizzle: mockDrizzle,
  }));

  // ハンドラーを動的インポート
  ({ createTenantHandler } = await import('./createTenant'));

  // Step 4・6 で使われる getTenantDb のスタブ
  // テナント DB は migrate をモックしているため実際には存在しない
  // INSERT 操作をスタブで受け流す
  const tenantDbStub = {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) })),
  };

  // モックのデフォルト設定
  mockGetDb.mockResolvedValue(serviceDb);
  mockGetTenantDb.mockResolvedValue(tenantDbStub);
  mockResolveDbCredentials.mockResolvedValue({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
  });
  mockCognitoSend.mockResolvedValue({ User: { Username: 'test-admin' } });
  mockMigrate.mockResolvedValue(undefined);
  mockDrizzle.mockReturnValue({});
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
  const tenantDbStub = {
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([{ insertId: 1 }]) })),
  };
  mockGetDb.mockResolvedValue(serviceDb);
  mockGetTenantDb.mockResolvedValue(tenantDbStub);
  mockResolveDbCredentials.mockResolvedValue({
    host: containerHost,
    port: containerPort,
    user: 'root',
    password: 'rootpass',
  });
  mockCognitoSend.mockResolvedValue({ User: { Username: 'test-admin' } });
  mockMigrate.mockResolvedValue(undefined);
  mockDrizzle.mockReturnValue({});
});

// ---- ヘルパー型 ----

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

// ---- テスト用 Hono アプリファクトリ ----

/** adminContext をバイパスしてハンドラーを直接テストするアプリ */
function createTestApp() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/tenants', (c) => createTenantHandler(c));
  return app;
}

/** adminContext を含むアプリ（403 テスト用） */
function createAppWithAdminContext() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.use('/admin/*', adminContext);
  app.post('/admin/tenants', (c) => createTenantHandler(c));
  return app;
}

function makeMockEvent(claims: Record<string, string>): MockLambdaEvent {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
  };
}

async function postTenants(
  app: ReturnType<typeof createTestApp>,
  body: Record<string, string>,
  env: { event: MockLambdaEvent },
) {
  return app.request(
    '/admin/tenants',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

const servicerAdminEvent = makeMockEvent({
  'custom:user_type': 'servicer_admin',
  sub: 'admin-sub-001',
});

// ---- テスト ----

describe('createTenantHandler medium テスト', () => {
  describe('Scenario 1: テナント発行が正常に完了するとき', () => {
    test('201 Created が返ること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(201);
      const body = await res.json() as { tenant: { id: number; slug: string; name: string; status: string } };
      expect(body.tenant).toMatchObject({
        slug: 'new-tenant',
        name: 'テナント名',
        status: 'active',
      });
      expect(body.tenant.id).toBeDefined();
    });

    test('service.tenants にレコードが登録されること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert: 実際の DB にレコードが挿入されていること
      const rows = await serviceDb
        .select()
        .from(serviceSchema.serviceTenants)
        .where(eq(serviceSchema.serviceTenants.slug, 'new-tenant'));

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        slug: 'new-tenant',
        name: 'テナント名',
        status: 'active',
      });
    });

    test('Cognito AdminCreateUser が tenant_admin 属性で呼ばれること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(mockCognitoSend).toHaveBeenCalled();
      const sentCommand = mockCognitoSend.mock.calls[0]?.[0] as { _input: unknown } | undefined;
      expect(sentCommand?._input).toMatchObject({
        UserAttributes: expect.arrayContaining([
          { Name: 'custom:user_type', Value: 'tenant_admin' },
          { Name: 'custom:tenant_id', Value: 'new-tenant' },
          { Name: 'email', Value: 'tenant-admin@example.com' },
        ]),
      });
    });
  });

  describe('Scenario 2: 重複スラッグのとき', () => {
    test('409 Conflict が返ること', async () => {
      // Arrange: 同じスラッグをあらかじめ登録しておく
      await serviceDb.insert(serviceSchema.serviceTenants).values({
        slug: 'existing-tenant',
        name: '既存テナント',
      });
      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'existing-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(409);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('conflict');
    });

    test('service.tenants レコードが重複登録されないこと', async () => {
      // Arrange
      await serviceDb.insert(serviceSchema.serviceTenants).values({
        slug: 'existing-tenant',
        name: '既存テナント',
      });
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'existing-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert: レコードが 1 件のまま（重複していない）
      const rows = await serviceDb
        .select()
        .from(serviceSchema.serviceTenants)
        .where(eq(serviceSchema.serviceTenants.slug, 'existing-tenant'));

      expect(rows).toHaveLength(1);
    });
  });

  describe('Scenario 3: スキーマ作成失敗時のロールバック', () => {
    test('500 が返ること', async () => {
      // Arrange: createConnection の execute でエラーを発生させる
      // mysql2/promise はモックせず実接続を使うが、Step 2 の CREATE DATABASE 時に
      // resolveDbCredentials が不正な接続情報を返すことで接続失敗させる
      mockResolveDbCredentials.mockResolvedValue({
        host: 'invalid-host-that-does-not-exist',
        port: 3306,
        user: 'root',
        password: 'wrongpass',
      });
      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'fail-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(500);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('internal_error');
    }, 30000);

    test('service.tenants レコードがロールバックされること', async () => {
      // Arrange
      mockResolveDbCredentials.mockResolvedValue({
        host: 'invalid-host-that-does-not-exist',
        port: 3306,
        user: 'root',
        password: 'wrongpass',
      });
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'fail-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert: ロールバックにより service.tenants レコードが削除されていること
      const rows = await serviceDb
        .select()
        .from(serviceSchema.serviceTenants)
        .where(eq(serviceSchema.serviceTenants.slug, 'fail-tenant'));

      expect(rows).toHaveLength(0);
    }, 30000);
  });

  describe('Scenario 4: servicer_admin 以外からのリクエスト', () => {
    test('403 が返ること', async () => {
      // Arrange: adminContext を含むアプリを使用
      const app = createAppWithAdminContext();
      const nonAdminEvent = makeMockEvent({
        'custom:user_type': 'tenant_user',
        sub: 'tenant-user-sub',
      });

      // Act
      const res = await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'tenant-admin@example.com' },
        { event: nonAdminEvent },
      );

      // Assert
      expect(res.status).toBe(403);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
