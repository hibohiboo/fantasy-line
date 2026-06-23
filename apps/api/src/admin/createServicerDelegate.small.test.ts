import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import type { AppBindings } from '../hono/types';
import type { AdminVariables } from './adminContext';
import type * as CreateServicerDelegateModule from './createServicerDelegate';
import { type MockLambdaEvent } from '../shared/test-helpers/adminTestHelpers';

// ---- モック変数（vi.doMock のファクトリ内で参照するため先に宣言） ----
const mockGetDb = vi.fn();
const mockCognitoSend = vi.fn();
// vi.fn で class 相当のコンストラクタをモックするには function キーワードが必要

const MockCognitoIdentityProviderClient = vi.fn(function () {
  return { send: mockCognitoSend };
});

const MockAdminCreateUserCommand = vi.fn(function (input: unknown) {
  return { _input: input };
});

// ---- テスト対象は beforeAll で動的インポートする ----
let createServicerDelegateHandler: typeof CreateServicerDelegateModule.createServicerDelegateHandler;

beforeAll(async () => {
  vi.doMock('../db/client', () => ({ getDb: mockGetDb }));
  vi.doMock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: MockCognitoIdentityProviderClient,
    AdminCreateUserCommand: MockAdminCreateUserCommand,
  }));
  ({ createServicerDelegateHandler } =
    await import('./createServicerDelegate'));
});

// ---- テスト用 Hono アプリファクトリ ----

function createTestApp() {
  const app = new Hono<{ Variables: AdminVariables; Bindings: AppBindings }>();
  app.post('/admin/users', (c) => createServicerDelegateHandler(c));
  return app;
}

/** Hono の env として event を渡してリクエストを送る */
async function sendRequest(
  app: ReturnType<typeof createTestApp>,
  body: unknown,
  env: { event: MockLambdaEvent } = {
    event: {
      requestContext: { authorizer: { jwt: { claims: { sub: 'admin-sub' } } } },
    },
  },
) {
  return app.request(
    '/admin/users',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  );
}

// ---- Drizzle モック構築ヘルパー ----

/**
 * service DB モック。
 * insert().values() と select().from().where() の両方に対応する。
 */
function makeServiceDbMock(roleRows: unknown[]) {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([{ insertId: 1 }]),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(roleRows),
      }),
    }),
  };
}

// ---- テスト ----

describe('createServicerDelegateHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 5: servicer_delegate 作成が正常に完了するとき', () => {
    const validBody = {
      email: 'delegate@example.com',
      tenantIds: [1, 2],
    };

    const cognitoUser = {
      User: {
        Username: 'cognito-uuid-001',
        Attributes: [{ Name: 'sub', Value: 'cognito-uuid-001' }],
      },
    };

    const roleRow = [{ id: 2, name: 'servicer_delegate' }];

    test('201 Created とユーザー情報が返ること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue(cognitoUser);
      mockGetDb.mockResolvedValue(makeServiceDbMock(roleRow));
      const app = createTestApp();

      // Act
      const res = await sendRequest(app, validBody);

      // Assert
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        user: { id: number; email: string; userType: string };
      };
      expect(body.user.email).toBe('delegate@example.com');
      expect(body.user.userType).toBe('servicer_delegate');
      expect(typeof body.user.id).toBe('number');
    });

    test('Cognito AdminCreateUser が呼ばれること', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue(cognitoUser);
      mockGetDb.mockResolvedValue(makeServiceDbMock(roleRow));
      const app = createTestApp();

      // Act
      await sendRequest(app, validBody);

      // Assert
      expect(mockCognitoSend).toHaveBeenCalledTimes(1);
      expect(MockAdminCreateUserCommand).toHaveBeenCalledTimes(1);
    });

    test('Cognito のユーザー属性に custom:tenant_id が含まれないこと', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValue(cognitoUser);
      mockGetDb.mockResolvedValue(makeServiceDbMock(roleRow));
      const app = createTestApp();

      // Act
      await sendRequest(app, validBody);

      // Assert
      const commandArgs = MockAdminCreateUserCommand.mock.calls[0]?.[0] as {
        UserAttributes: Array<{ Name: string; Value: string }>;
      };
      const attrNames = commandArgs.UserAttributes.map((a) => a.Name);
      expect(attrNames).not.toContain('custom:tenant_id');
    });

    test('service.users にレコードが登録されること', async () => {
      // Arrange
      const mockDb = makeServiceDbMock(roleRow);
      mockCognitoSend.mockResolvedValue(cognitoUser);
      mockGetDb.mockResolvedValue(mockDb);
      const app = createTestApp();

      // Act
      await sendRequest(app, validBody);

      // Assert
      expect(mockDb.insert).toHaveBeenCalled();
      const insertValues = (mockDb.insert().values as ReturnType<typeof vi.fn>)
        .mock.calls;
      const userInsertCall = insertValues.find(
        (args: unknown[]) =>
          Array.isArray(args) &&
          args[0] !== null &&
          typeof args[0] === 'object' &&
          'email' in (args[0] as Record<string, unknown>) &&
          (args[0] as Record<string, unknown>)['email'] ===
            'delegate@example.com',
      );
      expect(userInsertCall).toBeDefined();
    });

    test('service.user_tenant_roles に対象テナントのアクセス設定が登録されること', async () => {
      // Arrange
      const mockDb = makeServiceDbMock(roleRow);
      mockCognitoSend.mockResolvedValue(cognitoUser);
      mockGetDb.mockResolvedValue(mockDb);
      const app = createTestApp();

      // Act
      await sendRequest(app, validBody);

      // Assert
      // tenantIds が [1, 2] なので insert が複数回呼ばれる（users + user_tenant_roles x 2）
      const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
      expect(insertMock).toHaveBeenCalledTimes(1 + validBody.tenantIds.length);
    });
  });

  describe('バリデーション', () => {
    test('不正な email で 400 が返ること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      const res = await sendRequest(app, {
        email: 'not-an-email',
        tenantIds: [1],
      });

      // Assert
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('validation_error');
    });

    test('tenantIds が空配列で 400 が返ること', async () => {
      // Arrange
      const app = createTestApp();

      // Act
      const res = await sendRequest(app, {
        email: 'delegate@example.com',
        tenantIds: [],
      });

      // Assert
      expect(res.status).toBe(400);
      const body = (await res.json()) as {
        error: { code: string; message: string };
      };
      expect(body.error.code).toBe('validation_error');
    });
  });
});
