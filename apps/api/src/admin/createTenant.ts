import path from 'path';
import { eq, sql } from 'drizzle-orm';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AdminVariables } from './adminContext';
import type { AppBindings } from '../hono/types';
import { getDb, getTenantDb, resolveDbCredentials } from '../db/client';
import { serviceTenants } from '../db/service-schema';
import { tenantUsers, tenantUserRoles } from '../db/tenant-template-schema';
import { validateSlug, slugToSchemaName } from '../shared/tenant';

// ---- サガパターン ----

type SagaStep = {
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
};

async function runSaga(steps: SagaStep[]): Promise<void> {
  const executed: SagaStep[] = [];
  for (const step of steps) {
    try {
      await step.execute();
      executed.push(step);
    } catch (err) {
      for (const done of executed.reverse()) {
        try {
          await done.rollback();
        } catch (rollbackErr) {
          // ロールバック失敗は無視してログだけ出す
          console.error('[createTenant] ロールバック失敗:', rollbackErr);
        }
      }
      throw err;
    }
  }
}

// ---- リクエストスキーマ ----

const createTenantSchema = z.object({
  slug: z.string(),
  name: z.string().min(1),
  adminEmail: z.string().email(),
});

// ---- エラー型ガード ----

function isDuplicateEntryError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  // mysql2 が直接スローする場合
  if (e['code'] === 'ER_DUP_ENTRY') return true;
  // Drizzle が DrizzleQueryError でラップしている場合（cause に元の mysql2 エラーが入る）
  const cause = e['cause'];
  if (typeof cause === 'object' && cause !== null) {
    const causeCode = (cause as Record<string, unknown>)['code'];
    if (causeCode === 'ER_DUP_ENTRY') return true;
  }
  return false;
}

// ---- テナントロール初期権限 ----

const TENANT_ROLE_PERMISSIONS: Array<{ roleName: string; resource: string; action: string }> = [
  { roleName: 'tenant_admin', resource: 'village',  action: 'read'   },
  { roleName: 'tenant_admin', resource: 'village',  action: 'create' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'read'   },
  { roleName: 'tenant_admin', resource: 'resident', action: 'create' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'update' },
  { roleName: 'tenant_admin', resource: 'resident', action: 'delete' },
  { roleName: 'tenant_admin', resource: 'item',     action: 'read'   },
  { roleName: 'tenant_admin', resource: 'item',     action: 'create' },
  { roleName: 'tenant_admin', resource: 'user',     action: 'list'   },
  { roleName: 'tenant_admin', resource: 'user',     action: 'manage' },
  { roleName: 'tenant_user',  resource: 'village',  action: 'read'   },
  { roleName: 'tenant_user',  resource: 'resident', action: 'read'   },
  { roleName: 'tenant_user',  resource: 'item',     action: 'read'   },
  { roleName: 'tenant_user',  resource: 'user',     action: 'list'   },
];

// ---- ハンドラー ----

/**
 * テナントを発行するハンドラー（POST /admin/tenants）。
 *
 * サガパターン（6 ステップ）でテナントをプロビジョニングし、
 * 失敗時は実行済みステップをロールバックする。
 */
export async function createTenantHandler(
  c: Context<{ Variables: AdminVariables; Bindings: AppBindings }>,
): Promise<Response> {
  // 1. リクエストボディのパース・バリデーション
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const parsed = createTenantSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const { slug, name, adminEmail } = parsed.data;

  // slug の追加バリデーション
  const slugValidation = validateSlug(slug);
  if (!slugValidation.valid) {
    return c.json(
      { error: { code: 'validation_error', message: 'Invalid slug' } },
      400,
    );
  }

  const schemaName = slugToSchemaName(slug);
  const migrationsFolder = process.env['MIGRATIONS_TENANT_FOLDER'] ?? path.join(__dirname, 'migrations-tenant');

  try {
    const db = await getDb();
    // DB 認証情報はハンドラー開始時に一度だけ解決して各ステップで共有する
    const creds = await resolveDbCredentials();
    let tenantId: number | undefined;
    let cognitoUsername: string | undefined;

    const cognitoUserPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';
    const cognitoClient = new CognitoIdentityProviderClient({});

    const steps: SagaStep[] = [
      // Step 1: service.tenants にレコード登録
      {
        execute: async () => {
          const result = await db.insert(serviceTenants).values({ slug, name });
          // drizzle の insert は ResultSetHeader[] を返す
          const resultSetHeader = (result as unknown as [{ insertId: number }])[0];
          tenantId = resultSetHeader?.insertId;
        },
        rollback: async () => {
          await db.delete(serviceTenants).where(eq(serviceTenants.slug, slug));
        },
      },

      // Step 2: Aurora に tenant_{slug} データベースを作成
      {
        execute: async () => {
          const { createConnection } = await import('mysql2/promise');
          const conn = await createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
          });
          try {
            await conn.execute(
              `CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
            );
          } finally {
            await conn.end();
          }
        },
        rollback: async () => {
          // Step 3 のロールバックで DROP DATABASE も行うのでここでは何もしない
        },
      },

      // Step 3: drizzle-tenant マイグレーション実行
      {
        execute: async () => {
          const { createConnection } = await import('mysql2/promise');
          const { drizzle } = await import('drizzle-orm/mysql2');
          const { migrate } = await import('drizzle-orm/mysql2/migrator');
          const conn = await createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
            database: schemaName,
          });
          try {
            const tenantMigrateDb = drizzle(conn);
            await migrate(tenantMigrateDb, { migrationsFolder });
          } finally {
            await conn.end();
          }
        },
        rollback: async () => {
          const { createConnection } = await import('mysql2/promise');
          const conn = await createConnection({
            host: creds.host,
            port: creds.port,
            user: creds.user,
            password: creds.password,
          });
          try {
            await conn.execute(`DROP DATABASE IF EXISTS \`${schemaName}\``);
          } finally {
            await conn.end();
          }
        },
      },

      // Step 4: tenant.roles にテナントロールを挿入
      {
        execute: async () => {
          const tenantDb = await getTenantDb(slug);
          await tenantDb.execute(sql`
            INSERT IGNORE INTO roles (name, is_default) VALUES
            ('tenant_admin', 0),
            ('tenant_user', 1)
          `);
        },
        rollback: async () => {
          // Step 3 のロールバック（DROP DATABASE）に含まれるため何もしない
        },
      },

      // Step 5: tenant.role_permissions に初期権限を挿入
      {
        execute: async () => {
          const tenantDb = await getTenantDb(slug);
          for (const { roleName, resource, action } of TENANT_ROLE_PERMISSIONS) {
            await tenantDb.execute(sql`
              INSERT IGNORE INTO role_permissions (role_id, resource, action)
              SELECT id, ${resource}, ${action} FROM roles WHERE name = ${roleName}
            `);
          }
        },
        rollback: async () => {
          // Step 3 のロールバック（DROP DATABASE）に含まれるため何もしない
        },
      },

      // Step 6: Cognito に tenant_admin ユーザーを作成
      {
        execute: async () => {
          const command = new AdminCreateUserCommand({
            UserPoolId: cognitoUserPoolId,
            Username: adminEmail,
            UserAttributes: [
              { Name: 'email', Value: adminEmail },
              { Name: 'email_verified', Value: 'true' },
              { Name: 'custom:user_type', Value: 'tenant_admin' },
              { Name: 'custom:tenant_id', Value: slug },
            ],
          });
          const response = await cognitoClient.send(command);
          cognitoUsername = response.User?.Username ?? adminEmail;
        },
        rollback: async () => {
          const username = cognitoUsername ?? adminEmail;
          const command = new AdminDeleteUserCommand({
            UserPoolId: cognitoUserPoolId,
            Username: username,
          });
          try {
            await cognitoClient.send(command);
          } catch (err) {
            console.error('[createTenant] Cognito ユーザー削除失敗:', err);
          }
        },
      },

      // Step 7: tenant_{slug}.users に初期管理者レコードを登録し user_roles を設定
      {
        execute: async () => {
          const username = cognitoUsername ?? adminEmail;
          const tenantDb = await getTenantDb(slug);
          const [insertResult] = await tenantDb
            .insert(tenantUsers)
            .values({
              cognitoSub: username,
              email: adminEmail,
              userType: 'tenant_admin',
            })
            .$returningId();
          if (!insertResult) throw new Error('tenant users 挿入結果が空');

          // tenant_admin ロール（id=1）をセット
          await tenantDb
            .insert(tenantUserRoles)
            .values({ userId: insertResult.id, roleId: 1 });
        },
        rollback: async () => {
          // Cognito ユーザー削除は Step 6 のロールバックで行う
          // DB ロールバックは Step 3 の DROP DATABASE に含まれる
        },
      },
    ];

    await runSaga(steps);

    // 成功レスポンス
    return c.json(
      {
        tenant: {
          id: tenantId,
          slug,
          name,
          status: 'active' as const,
        },
      },
      201,
    );
  } catch (err) {
    // 重複スラッグエラーのハンドリング
    if (isDuplicateEntryError(err)) {
      return c.json(
        { error: { code: 'conflict', message: 'Tenant already exists' } },
        409,
      );
    }

    console.error('[createTenant] プロビジョニング失敗:', err);
    return c.json(
      { error: { code: 'internal_error', message: 'Provisioning failed' } },
      500,
    );
  }
}
