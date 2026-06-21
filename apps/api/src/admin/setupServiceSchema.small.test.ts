import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { AdminVariables } from './adminContext';
import type { AppBindings } from '../hono/types';
import type * as SetupServiceSchemaModule from './setupServiceSchema';
import { makeMockEvent, type MockLambdaEvent } from '../shared/test-helpers/adminTestHelpers';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----
const mockCreateConnection = vi.fn();
const mockMigrate = vi.fn();
const mockDrizzle = vi.fn();

// mysql2/promise の execute は connection インスタンスのメソッドとしてモックする
const mockRootExecute = vi.fn();
const mockRootEnd = vi.fn();

// drizzle インスタンスの execute モック（raw SQL 用）
const mockDbExecute = vi.fn();

// ---- テスト対象は beforeAll で動的インポートする ----
let setupServiceSchemaHandler: typeof SetupServiceSchemaModule.setupServiceSchemaHandler;

beforeAll(async () => {
  vi.doMock('../db/client', () => ({
    resolveDbCredentials: vi.fn().mockResolvedValue({
      host: 'localhost',
      port: 3306,
      user: 'testuser',
      password: 'testpass',
    }),
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

  ({ setupServiceSchemaHandler } = await import('./setupServiceSchema'));
});

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp(handler: typeof setupServiceSchemaHandler) {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/setup/service-schema', handler);
  return app;
}

/** テスト用リクエストを送る */
async function sendRequest(
  app: ReturnType<typeof createTestApp>,
  env: { event: MockLambdaEvent },
) {
  return app.request(
    '/admin/setup/service-schema',
    { method: 'POST' },
    env,
  );
}

/** 正常系のモック設定をセットアップする */
function setupSuccessMocks() {
  // root 接続モック（CREATE DATABASE 用）
  mockRootEnd.mockResolvedValue(undefined);
  mockRootExecute.mockResolvedValue([[], []]);

  // service 接続モック（migrate / seed 用）
  const mockServiceEnd = vi.fn().mockResolvedValue(undefined);

  mockCreateConnection.mockImplementation(
    (config: { database?: string }) => {
      if (!config.database) {
        // root 接続（CREATE DATABASE 用）
        return Promise.resolve({
          execute: mockRootExecute,
          end: mockRootEnd,
        });
      }
      // service DB 接続
      return Promise.resolve({
        execute: vi.fn(),
        end: mockServiceEnd,
      });
    },
  );

  // migrate モック
  mockMigrate.mockResolvedValue(undefined);

  mockDbExecute.mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockDrizzle.mockReturnValue({ execute: mockDbExecute } as any);
}

// ---- テスト ----

describe('setupServiceSchemaHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('正常系: service スキーマが存在しない（または既存）とき', () => {
    test('200 OK と { message: "service schema initialized" } が返ること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      const res = await sendRequest(app, env);

      // Assert
      expect(res.status).toBe(200);
      const body = await res.json() as { message: string };
      expect(body.message).toBe('service schema initialized');
    });

    test('CREATE DATABASE IF NOT EXISTS が実行されること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      await sendRequest(app, env);

      // Assert
      expect(mockRootExecute).toHaveBeenCalledWith(
        expect.stringContaining('CREATE DATABASE IF NOT EXISTS'),
      );
    });

    test('migrate が呼ばれること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      await sendRequest(app, env);

      // Assert
      expect(mockMigrate).toHaveBeenCalledTimes(1);
    });

    test('roles が INSERT IGNORE raw SQL でシードされること', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      await sendRequest(app, env);

      // Assert
      // db.insert は呼ばれないこと（INSERT IGNORE の raw SQL に変更済み）
      // db.execute が roles (1 回) + role_permissions (8 回) = 計 9 回呼ばれること
      expect(mockDbExecute).toHaveBeenCalledTimes(9);
    });

    test('2 回実行しても同じ 200 OK が返ること（冪等）', async () => {
      // Arrange
      setupSuccessMocks();
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      const res1 = await sendRequest(app, env);
      const res2 = await sendRequest(app, env);

      // Assert
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      const body1 = await res1.json() as { message: string };
      const body2 = await res2.json() as { message: string };
      expect(body1.message).toBe('service schema initialized');
      expect(body2.message).toBe('service schema initialized');
    });
  });

  describe('異常系: DB 接続エラーのとき', () => {
    test('500 Internal Server Error が返ること', async () => {
      // Arrange
      mockCreateConnection.mockRejectedValue(new Error('Connection refused'));
      const app = createTestApp(setupServiceSchemaHandler);
      const env = { event: makeMockEvent() };

      // Act
      const res = await sendRequest(app, env);

      // Assert
      expect(res.status).toBe(500);
    });
  });
});
