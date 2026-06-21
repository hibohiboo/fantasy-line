import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import type * as CreateTenantModule from './createTenant';
import { makeMockEvent, type MockLambdaEvent } from '../shared/test-helpers/adminTestHelpers';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----

// service DB (getDb)
const mockInsert = vi.fn();
const mockInsertInto = vi.fn(() => ({ values: mockInsert }));
const mockDelete = vi.fn();
const mockDeleteFrom = vi.fn(() => ({ where: mockDelete }));
const mockSelect = vi.fn();
const mockGetDb = vi.fn();

// tenant DB (getTenantDb)
const mockTenantInsert = vi.fn();
const mockTenantInsertInto = vi.fn(() => ({ values: mockTenantInsert }));
const mockGetTenantDb = vi.fn();

// resolveDbCredentials
const mockResolveDbCredentials = vi.fn();

// mysql2 createConnection
const mockConnectionEnd = vi.fn();
const mockConnectionExecute = vi.fn();
const mockCreateConnection = vi.fn();

// drizzle-orm/mysql2
const mockDrizzle = vi.fn();

// drizzle-orm/mysql2/migrator
const mockMigrate = vi.fn();

// CognitoIdentityProviderClient.send
const mockCognitoSend = vi.fn();

class MockCognitoIdentityProviderClient {
  send = mockCognitoSend;
}

class MockAdminCreateUserCommand {
  _input: unknown;
  constructor(input: unknown) {
    this._input = input;
  }
}

class MockAdminDeleteUserCommand {
  _input: unknown;
  constructor(input: unknown) {
    this._input = input;
  }
}

// ---- テスト対象は beforeAll で動的インポートする ----
let createTenantHandler: typeof CreateTenantModule.createTenantHandler;

beforeAll(async () => {
  vi.doMock('../db/client', () => ({
    getDb: mockGetDb,
    getTenantDb: mockGetTenantDb,
    resolveDbCredentials: mockResolveDbCredentials,
  }));

  vi.doMock('mysql2/promise', () => ({
    default: { createConnection: mockCreateConnection },
    createConnection: mockCreateConnection,
  }));

  vi.doMock('drizzle-orm/mysql2', () => ({
    drizzle: mockDrizzle,
  }));

  vi.doMock('drizzle-orm/mysql2/migrator', () => ({
    migrate: mockMigrate,
  }));

  vi.doMock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: MockCognitoIdentityProviderClient,
    AdminCreateUserCommand: MockAdminCreateUserCommand,
    AdminDeleteUserCommand: MockAdminDeleteUserCommand,
  }));

  ({ createTenantHandler } = await import('./createTenant'));
});

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/tenants', (c) => createTenantHandler(c));
  return app;
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

// ---- 成功時の共通モックセットアップ ----

function setupSuccessMocks() {
  // resolveDbCredentials
  mockResolveDbCredentials.mockResolvedValue({
    host: 'localhost',
    port: 3306,
    user: 'testuser',
    password: 'testpass',
  });

  // getDb: insert → tenants レコード作成、 select → role_permissions 取得
  const insertedTenant = {
    id: 1,
    slug: 'new-tenant',
    name: 'テナント名',
    status: 'active',
  };
  mockInsert.mockResolvedValue([{ insertId: 1 }]);
  mockSelect.mockResolvedValue([
    { roleId: 1, resource: 'village', action: 'read' },
  ]);
  mockDelete.mockResolvedValue([{ affectedRows: 1 }]);
  const mockServiceDb = {
    insert: mockInsertInto,
    delete: mockDeleteFrom,
    // select().from() は Promise を返す（Step 4 で .where() なし全件取得）
    select: () => ({
      from: () => mockSelect(),
    }),
    $count: vi.fn(),
  };
  mockGetDb.mockResolvedValue(mockServiceDb);

  // getTenantDb
  mockTenantInsert.mockResolvedValue([{ insertId: 100 }]);
  const mockTenantDb = {
    insert: mockTenantInsertInto,
  };
  mockGetTenantDb.mockResolvedValue(mockTenantDb);

  // mysql2 createConnection
  const mockConn = {
    execute: mockConnectionExecute,
    end: mockConnectionEnd,
  };
  mockConnectionExecute.mockResolvedValue([[], []]);
  mockConnectionEnd.mockResolvedValue(undefined);
  mockCreateConnection.mockResolvedValue(mockConn);

  // drizzle
  mockDrizzle.mockReturnValue({});

  // migrate
  mockMigrate.mockResolvedValue(undefined);

  // Cognito
  mockCognitoSend.mockResolvedValue({ User: { Username: 'admin@example.com' } });

  return { insertedTenant };
}

const servicerAdminEvent = makeMockEvent({ 'custom:user_type': 'servicer_admin', sub: 'sub-001' });

// ---- テスト ----

describe('createTenantHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: テナント発行が正常に完了するとき', () => {
    test('201 Created とテナント情報が返ること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
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
    });

    test('service.tenants に insert が呼ばれること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(mockInsertInto).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'new-tenant', name: 'テナント名' }),
      );
    });

    test('Cognito AdminCreateUser が呼ばれること（tenant_admin 属性付き）', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'new-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      // AdminCreateUserCommand のコンストラクタに渡された引数を、
      // 生成されたインスタンスの _input プロパティで検証する
      expect(mockCognitoSend).toHaveBeenCalled();
      const sentCommand = mockCognitoSend.mock.calls[0]?.[0] as { _input: unknown } | undefined;
      expect(sentCommand?._input).toMatchObject({
        UserAttributes: expect.arrayContaining([
          { Name: 'custom:user_type', Value: 'tenant_admin' },
          { Name: 'custom:tenant_id', Value: 'new-tenant' },
          { Name: 'email', Value: 'admin@example.com' },
        ]),
      });
    });
  });

  describe('Scenario 2: 重複スラッグのとき', () => {
    test('409 Conflict が返ること', async () => {
      // Arrange
      // service DB の insert が duplicate entry エラーをスローする
      const mockServiceDb = {
        insert: vi.fn(() => ({
          values: vi.fn().mockRejectedValue(
            Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
          ),
        })),
        delete: mockDeleteFrom,
        select: () => ({ from: () => mockSelect() }),
      };
      mockGetDb.mockResolvedValue(mockServiceDb);
      mockResolveDbCredentials.mockResolvedValue({
        host: 'localhost', port: 3306, user: 'testuser', password: 'testpass',
      });

      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'existing-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(409);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('conflict');
    });

    test('データが変更されないこと（CREATE DATABASE が呼ばれないこと）', async () => {
      // Arrange
      const mockServiceDb = {
        insert: vi.fn(() => ({
          values: vi.fn().mockRejectedValue(
            Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' }),
          ),
        })),
        delete: mockDeleteFrom,
        select: () => ({ from: () => mockSelect() }),
      };
      mockGetDb.mockResolvedValue(mockServiceDb);
      mockResolveDbCredentials.mockResolvedValue({
        host: 'localhost', port: 3306, user: 'testuser', password: 'testpass',
      });

      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'existing-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(mockCreateConnection).not.toHaveBeenCalled();
    });
  });

  describe('Scenario 3: スキーマ作成失敗時のロールバック', () => {
    test('500 が返ること', async () => {
      // Arrange
      // step1 (service.tenants insert) は成功、step2 (CREATE DATABASE) は失敗
      mockInsert.mockResolvedValue([{ insertId: 1 }]);
      const mockServiceDb = {
        insert: mockInsertInto,
        delete: mockDeleteFrom,
        select: () => ({ from: () => mockSelect() }),
      };
      mockGetDb.mockResolvedValue(mockServiceDb);
      mockResolveDbCredentials.mockResolvedValue({
        host: 'localhost', port: 3306, user: 'testuser', password: 'testpass',
      });

      // createConnection はスキーマ作成用に呼ばれるが execute で失敗する
      const mockConn = {
        execute: vi.fn().mockRejectedValue(new Error('CREATE DATABASE failed')),
        end: vi.fn().mockResolvedValue(undefined),
      };
      mockCreateConnection.mockResolvedValue(mockConn);

      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'fail-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(500);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('internal_error');
    });

    test('service.tenants レコードが削除（ロールバック）されること', async () => {
      // Arrange
      mockInsert.mockResolvedValue([{ insertId: 1 }]);
      mockDelete.mockResolvedValue([{ affectedRows: 1 }]);
      const mockServiceDb = {
        insert: mockInsertInto,
        delete: mockDeleteFrom,
        select: () => ({ from: () => mockSelect() }),
      };
      mockGetDb.mockResolvedValue(mockServiceDb);
      mockResolveDbCredentials.mockResolvedValue({
        host: 'localhost', port: 3306, user: 'testuser', password: 'testpass',
      });

      const mockConn = {
        execute: vi.fn().mockRejectedValue(new Error('CREATE DATABASE failed')),
        end: vi.fn().mockResolvedValue(undefined),
      };
      mockCreateConnection.mockResolvedValue(mockConn);

      const app = createTestApp();

      // Act
      await postTenants(
        app,
        { slug: 'fail-tenant', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert - ロールバックで delete が呼ばれること
      expect(mockDeleteFrom).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('バリデーション', () => {
    test('不正な slug で 400 が返ること', async () => {
      // Arrange
      const app = createTestApp();

      // Act: ハイフンから始まる不正 slug
      const res = await postTenants(
        app,
        { slug: '-invalid', name: 'テナント名', adminEmail: 'admin@example.com' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });

    test('不正な email で 400 が返ること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      const res = await postTenants(
        app,
        { slug: 'valid-slug', name: 'テナント名', adminEmail: 'not-an-email' },
        { event: servicerAdminEvent },
      );

      // Assert
      expect(res.status).toBe(400);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('validation_error');
    });
  });
});
