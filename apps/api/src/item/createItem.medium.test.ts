import { vi, describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import path from 'path';
import * as serviceSchema from '../db/service-schema';
import * as tenantSchema from '../db/tenant-template-schema';

// vi.mock を使って getDb と getTenantDb を差し替える
vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { getDb, getTenantDb } from '../db/client';
import { app } from '../hono/app';

// ---- testcontainer セットアップ ----

let container: StartedTestContainer;
let rootPool: mysql.Pool;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let serviceDb: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let tenantDb: any;

const serviceMigrationsFolder = path.resolve(process.cwd(), 'drizzle-service');
const tenantMigrationsFolder = path.resolve(process.cwd(), 'drizzle-tenant');

beforeAll(async () => {
  // MySQL testcontainer を root で起動
  container = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'rootpass',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(3306);

  // root 接続でスキーマを作成する
  rootPool = mysql.createPool({
    host,
    port,
    user: 'root',
    password: 'rootpass',
    multipleStatements: true,
  });

  // MySQL が起動するまで待機
  for (let i = 0; i < 20; i++) {
    try {
      await rootPool.query('SELECT 1');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // service スキーマと tenant_test スキーマを作成
  await rootPool.query('CREATE DATABASE IF NOT EXISTS `service`');
  await rootPool.query('CREATE DATABASE IF NOT EXISTS `tenant_test`');

  // service DB に接続してマイグレーション適用
  const servicePool = mysql.createPool({
    host,
    port,
    user: 'root',
    password: 'rootpass',
    database: 'service',
  });
  serviceDb = drizzle({ client: servicePool, schema: serviceSchema, mode: 'default' });
  await migrate(serviceDb, { migrationsFolder: serviceMigrationsFolder });

  // tenant_test DB に接続してマイグレーション適用
  const tenantPool = mysql.createPool({
    host,
    port,
    user: 'root',
    password: 'rootpass',
    database: 'tenant_test',
  });
  tenantDb = drizzle({ client: tenantPool, schema: tenantSchema, mode: 'default' });
  await migrate(tenantDb, { migrationsFolder: tenantMigrationsFolder });

  // vi.fn の実装を DB インスタンスで差し替える
  (getDb as ReturnType<typeof vi.fn>).mockResolvedValue(serviceDb);
  (getTenantDb as ReturnType<typeof vi.fn>).mockReturnValue(tenantDb);

  // テストデータのシード
  await serviceDb.insert(serviceSchema.serviceTenants).values({
    slug: 'test',
    name: 'テストテナント',
    status: 'active',
  });

  await tenantDb.insert(tenantSchema.tenantUsers).values([
    { cognitoSub: 'user-1-sub', email: 'user1@example.com', userType: 'tenant_user' },
    { cognitoSub: 'user-2-sub', email: 'user2@example.com', userType: 'tenant_user' },
  ]);

  await tenantDb.insert(tenantSchema.tenantRoles).values({
    name: 'member',
    isDefault: 1,
  });

  // userId=1, roleId=1 の user_roles を登録
  await tenantDb.insert(tenantSchema.tenantUserRoles).values({
    userId: 1,
    roleId: 1,
  });

  // roleId=1 に item:create 権限を付与
  await tenantDb.insert(tenantSchema.tenantRolePermissions).values({
    roleId: 1,
    resource: 'item',
    action: 'create',
  });
}, 120000);

afterAll(async () => {
  await rootPool?.end();
  await container?.stop();
});

beforeEach(async () => {
  // 各テスト前に items をリセット
  await tenantDb.delete(tenantSchema.tenantItems);
});

// ---- JWT claims を event に注入するヘルパー ----

function makeMockEvent(claims: Record<string, string>, headers?: Record<string, string>) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
    headers: headers ?? {},
  };
}

// ---- テスト ----

describe('createItem 統合テスト', () => {
  describe('Scenario: tenant_user が POST /api/items にアクセスするとき', () => {
    test('201 OK でアイテムが作成されること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        {
          method: 'POST',
          body: JSON.stringify({ name: '炎の剣' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as { item: { id: number; name: string; ownerId: number; createdAt: string } };
      expect(body.item.id).toBeDefined();
      expect(body.item.name).toBe('炎の剣');
      expect(body.item.ownerId).toBe(1);
      expect(body.item.createdAt).toBeDefined();
    });

    test('アイテムの ownerId が userId（number 型）と一致すること', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        {
          method: 'POST',
          body: JSON.stringify({ name: 'テストアイテム' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as { item: { ownerId: number } };
      expect(typeof body.item.ownerId).toBe('number');
      expect(body.item.ownerId).toBe(1);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に item:create がないユーザー）', async () => {
      // Arrange: userId=2 には item:create 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/items',
        {
          method: 'POST',
          body: JSON.stringify({ name: '権限なしアイテム' }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
