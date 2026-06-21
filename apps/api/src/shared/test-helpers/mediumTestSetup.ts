import { beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { GenericContainer, Wait } from 'testcontainers';
import path from 'path';
import * as serviceSchema from '../../db/service-schema';
import * as tenantSchema from '../../db/tenant-template-schema';

export type TenantTestContext = {
  // drizzle() の戻り値型は mysql2/promise.Pool と mysql2/typings/mysql.Pool の型定義が
  // 重複しているため ReturnType<typeof drizzle> では型エラーになる
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceDb: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tenantDb: any;
};

/**
 * medium テスト用の MySQL testcontainer を起動し、マイグレーションと共通シードを適用する。
 * beforeAll / afterAll を内部で登録するため、テストファイルのトップレベルで呼び出すこと。
 *
 * vi.fn のモック差し替えは Vitest の hoisting 制約により呼び出し元の beforeAll で行うこと。
 * このヘルパーの beforeAll が先に実行されるため、続く beforeAll では ctx に値が入っている。
 *
 * @param permissions - userId=1 の role（roleId=1）に付与する権限リスト
 * @returns serviceDb / tenantDb を持つコンテキストオブジェクト（beforeAll 完了後に値が入る）
 */
export function useTenantTestContainer(
  permissions: Array<{ resource: string; action: string }>,
): TenantTestContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx: TenantTestContext = { serviceDb: null as any, tenantDb: null as any };

  let rootPool: mysql.Pool;
  let stopContainer: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    const container = await new GenericContainer('mysql:8.0')
      .withEnvironment({ MYSQL_ROOT_PASSWORD: 'rootpass' })
      .withExposedPorts(3306)
      .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
      .start();

    stopContainer = () => container.stop();

    const host = container.getHost();
    const port = container.getMappedPort(3306);

    rootPool = mysql.createPool({
      host,
      port,
      user: 'root',
      password: 'rootpass',
      multipleStatements: true,
    });

    for (let i = 0; i < 20; i++) {
      try {
        await rootPool.query('SELECT 1');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    await rootPool.query('CREATE DATABASE IF NOT EXISTS `service`');
    await rootPool.query('CREATE DATABASE IF NOT EXISTS `tenant_test`');

    const servicePool = mysql.createPool({
      host,
      port,
      user: 'root',
      password: 'rootpass',
      database: 'service',
    });
    ctx.serviceDb = drizzle({ client: servicePool, schema: serviceSchema, mode: 'default' });
    await migrate(ctx.serviceDb, { migrationsFolder: path.resolve(process.cwd(), 'drizzle-service') });

    const tenantPool = mysql.createPool({
      host,
      port,
      user: 'root',
      password: 'rootpass',
      database: 'tenant_test',
    });
    ctx.tenantDb = drizzle({ client: tenantPool, schema: tenantSchema, mode: 'default' });
    await migrate(ctx.tenantDb, { migrationsFolder: path.resolve(process.cwd(), 'drizzle-tenant') });

    await ctx.serviceDb.insert(serviceSchema.serviceTenants).values({
      slug: 'test',
      name: 'テストテナント',
      status: 'active',
    });
    await ctx.tenantDb.insert(tenantSchema.tenantUsers).values([
      { cognitoSub: 'user-1-sub', email: 'user1@example.com', userType: 'tenant_user' },
      { cognitoSub: 'user-2-sub', email: 'user2@example.com', userType: 'tenant_user' },
    ]);
    await ctx.tenantDb.insert(tenantSchema.tenantRoles).values({ name: 'member', isDefault: 1 });
    await ctx.tenantDb.insert(tenantSchema.tenantUserRoles).values({ userId: 1, roleId: 1 });

    for (const perm of permissions) {
      await ctx.tenantDb.insert(tenantSchema.tenantRolePermissions).values({ roleId: 1, ...perm });
    }
  }, 120000);

  afterAll(async () => {
    await rootPool?.end();
    await stopContainer?.();
  });

  return ctx;
}

/**
 * JWT claims と任意の headers を Hono medium テスト用のモックイベントに変換する。
 */
export function makeMockEvent(
  claims: Record<string, string>,
  headers?: Record<string, string>,
) {
  return {
    requestContext: { authorizer: { jwt: { claims } } },
    headers: headers ?? {},
  };
}
