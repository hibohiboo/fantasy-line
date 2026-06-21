import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
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
import { serviceTenants, serviceRolePermissions } from '../db/service-schema';
import { tenantUsers, tenantRolePermissions } from '../db/tenant-template-schema';
import { validateSlug, slugToSchemaName } from '../shared/tenant';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  const code = (err as Record<string, unknown>)['code'];
  return code === 'ER_DUP_ENTRY';
}

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
  const migrationsFolder = path.join(__dirname, 'migrations-tenant');

  try {
    const db = await getDb();
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
          const creds = await resolveDbCredentials();
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
          const creds = await resolveDbCredentials();
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
            const tenantDb = drizzle(conn);
            await migrate(tenantDb, { migrationsFolder });
          } finally {
            await conn.end();
          }
        },
        rollback: async () => {
          const creds = await resolveDbCredentials();
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

      // Step 4: service.role_permissions → tenant_{slug}.role_permissions シード
      {
        execute: async () => {
          const servicePerms = await db
            .select()
            .from(serviceRolePermissions)
            .where(eq(serviceRolePermissions.roleId, serviceRolePermissions.roleId));

          if (servicePerms.length > 0) {
            const tenantDb = await getTenantDb(slug);
            // INSERT IGNORE 相当: 既存行があっても無視する
            for (const perm of servicePerms) {
              try {
                await tenantDb.insert(tenantRolePermissions).values({
                  roleId: perm.roleId,
                  resource: perm.resource,
                  action: perm.action,
                });
              } catch (err) {
                // ER_DUP_ENTRY は無視する（INSERT IGNORE 相当）
                if (!isDuplicateEntryError(err)) throw err;
              }
            }
          }
        },
        rollback: async () => {
          // Step 3 のロールバック（DROP DATABASE）に含まれるため何もしない
        },
      },

      // Step 5: Cognito に tenant_admin ユーザーを作成
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

      // Step 6: tenant_{slug}.users に初期管理者レコードを登録
      {
        execute: async () => {
          const username = cognitoUsername ?? adminEmail;
          const tenantDb = await getTenantDb(slug);
          await tenantDb.insert(tenantUsers).values({
            cognitoSub: username,
            email: adminEmail,
            userType: 'tenant_admin',
          });
        },
        rollback: async () => {
          // Cognito ユーザー削除は Step 5 のロールバックで行う
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
