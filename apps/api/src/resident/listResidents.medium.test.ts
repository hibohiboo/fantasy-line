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

  // roleId=1 に resident:read 権限を付与
  await tenantDb.insert(tenantSchema.tenantRolePermissions).values({
    roleId: 1,
    resource: 'resident',
    action: 'read',
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

describe('listResidents 統合テスト', () => {
  describe('Scenario: tenant_user が GET /api/residents にアクセスするとき', () => {
    test('住人がいない場合は空配列を返すこと', async () => {
      // Arrange
      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: unknown[] };
      expect(body.residents).toEqual([]);
    });

    test('自分の村の住人のみ返すこと（他ユーザーの住人を含まない）', async () => {
      // Arrange: user-1 の村と user-2 の村を作成
      const [myVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();
      const [otherVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '魔王の村', ownerId: 2 })
        .$returningId();

      await tenantDb.insert(tenantSchema.tenantResidents).values([
        {
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: myVillage.id,
        },
        {
          name: '鈴木一郎',
          nameKana: 'スズキイチロウ',
          birthDate: '1995-05-20',
          villageId: otherVillage.id,
        },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ name: string; villageName: string }> };
      expect(body.residents).toHaveLength(1);
      expect(body.residents[0]?.name).toBe('山田太郎');
      expect(body.residents[0]?.villageName).toBe('勇者の村');
    });

    test('nameKana 昇順でソートされること', async () => {
      // Arrange
      const [myVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();

      await tenantDb.insert(tenantSchema.tenantResidents).values([
        {
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: myVillage.id,
        },
        {
          name: '佐藤花子',
          nameKana: 'サトウハナコ',
          birthDate: '1998-03-10',
          villageId: myVillage.id,
        },
        {
          name: '安部一郎',
          nameKana: 'アベイチロウ',
          birthDate: '1990-07-22',
          villageId: myVillage.id,
        },
      ]);

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ nameKana: string }> };
      expect(body.residents).toHaveLength(3);
      expect(body.residents[0]?.nameKana).toBe('アベイチロウ');
      expect(body.residents[1]?.nameKana).toBe('サトウハナコ');
      expect(body.residents[2]?.nameKana).toBe('ヤマダタロウ');
    });

    test('villageName がレスポンスに含まれること', async () => {
      // Arrange
      const [myVillage] = await tenantDb
        .insert(tenantSchema.tenantVillages)
        .values({ name: '勇者の村', ownerId: 1 })
        .$returningId();

      await tenantDb.insert(tenantSchema.tenantResidents).values({
        name: '山田太郎',
        nameKana: 'ヤマダタロウ',
        birthDate: '2000-01-15',
        villageId: myVillage.id,
      });

      const mockEvent = makeMockEvent({
        sub: 'user-1-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(200);
      const body = await response.json() as { residents: Array<{ villageName: string }> };
      expect(body.residents[0]?.villageName).toBe('勇者の村');
    });
  });

  describe('権限のないユーザーがアクセスするとき', () => {
    test('403 Forbidden が返ること（role_permissions に resident:read がないユーザー）', async () => {
      // Arrange: userId=2 には resident:read 権限がない
      const mockEvent = makeMockEvent({
        sub: 'user-2-sub',
        'custom:user_type': 'tenant_user',
        'custom:tenant_id': 'test',
      });

      // Act
      const response = await app.request('/api/residents', {}, { event: mockEvent });

      // Assert
      expect(response.status).toBe(403);
      const body = await response.json() as { error: string };
      expect(body.error).toBe('Forbidden');
    });
  });
});
