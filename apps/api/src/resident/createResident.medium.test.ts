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
// drizzle() の戻り値型は後から代入するため型注釈なしで宣言する
// mysql2/promise.Pool と mysql2/typings/mysql.Pool の型定義が重複しているため
// ReturnType<typeof drizzle> 形式では型エラーが生じる
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

  // roleId=1 に resident:create 権限を付与
  await tenantDb.insert(tenantSchema.tenantRolePermissions).values({
    roleId: 1,
    resource: 'resident',
    action: 'create',
  });
}, 120000);

afterAll(async () => {
  await rootPool?.end();
  await container?.stop();
});

beforeEach(async () => {
  // 各テスト前に residents → villages の順でリセット（参照整合性）
  await tenantDb.delete(tenantSchema.tenantResidents);
  await tenantDb.delete(tenantSchema.tenantVillages);
});

// ---- JWT claims を event に注入するヘルパー ----

function makeMockEvent(claims: Record<string, string>) {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
    headers: {},
  };
}

// ---- テスト ----

describe('createResident 統合テスト', () => {
  describe('Scenario: tenant_user が POST /api/residents にアクセスするとき', () => {
    test('正常なリクエストで 201 が返り、DB に住人が作成されること', async () => {
      // Arrange: user-1 が所有する村を作成
      const [insertedVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const villageId = insertedVillage.id;

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(201);
      const body = await response.json() as {
        resident: { id: number; name: string; nameKana: string; birthDate: string; villageId: number; createdAt: string }
      };
      expect(body.resident.id).toBeDefined();
      expect(body.resident.name).toBe('山田太郎');
      expect(body.resident.nameKana).toBe('ヤマダタロウ');
      expect(body.resident.birthDate).toBe('2000-01-15');
      expect(body.resident.villageId).toBe(villageId);
      expect(body.resident.createdAt).toBeDefined();

      // DB に1件登録されていることを確認
      const rows = await tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(1);
    });

    test('同名住人を 2 回 POST すると両方 201 が返ること（一意制約なし）', async () => {
      // Arrange: user-1 が所有する村を作成
      const [insertedVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const villageId = insertedVillage.id;

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      const requestBody = {
        method: 'POST',
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId,
        }),
        headers: { 'Content-Type': 'application/json' },
      };

      // Act
      const response1 = await app.request('/api/residents', requestBody, { event: mockEvent });
      const response2 = await app.request('/api/residents', requestBody, { event: mockEvent });

      // Assert
      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);

      const rows = await tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(2);
    });

    test('他ユーザーの村への villageId を指定すると 403 が返ること', async () => {
      // Arrange: user-2 が所有する村を作成
      const [otherVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '他者の村', ownerId: 2 })
        .$returningId();

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId: otherVillage.id,
          }),
          headers: { 'Content-Type': 'application/json' },
        },
        { event: mockEvent },
      );

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');

      // DB に登録されていないことを確認
      const rows = await tenantDb.select().from(tenantSchema.tenantResidents);
      expect(rows).toHaveLength(0);
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に resident:create がないユーザー）', async () => {
      // Arrange: userId=2 には resident:create 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request(
        '/api/residents',
        {
          method: 'POST',
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId: 1,
          }),
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
