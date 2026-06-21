import path from 'path';
import { fileURLToPath } from 'url';
import type { Context } from 'hono';
import { createConnection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { eq } from 'drizzle-orm';
import type { AdminVariables } from './adminContext';
import type { AppBindings } from '../hono/types';
import { getDb, resolveDbCredentials } from '../db/client';
import { serviceTenants } from '../db/service-schema';
import { validateSlug, slugToSchemaName } from '../shared/tenant';

// ESM 環境では __dirname が使えないため fileURLToPath で求める
// CDK afterBundling でこのファイルと同階層に migrations-tenant/ がコピーされる
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations-tenant');

/**
 * 単一テナントに対してデータベース作成とマイグレーションを実行する。
 *
 * @param slug - バリデーション済みのテナントスラッグ
 */
async function migrateTenant(slug: string): Promise<void> {
  const validation = validateSlug(slug);
  if (!validation.valid) {
    throw new Error(`無効なスラッグ "${slug}": ${validation.reason}`);
  }

  const schemaName = slugToSchemaName(slug);
  const creds = await resolveDbCredentials();

  // database なし接続で CREATE DATABASE IF NOT EXISTS を実行する
  const initConn = await createConnection({ ...creds });
  try {
    await initConn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await initConn.end();
  }

  // database あり接続で drizzle migrate を実行する
  const tenantConn = await createConnection({ ...creds, database: schemaName });
  try {
    const db = drizzle(tenantConn);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(JSON.stringify({ level: 'info', message: `[${slug}] マイグレーション成功` }));
  } finally {
    await tenantConn.end();
  }
}

/**
 * 全テナントマイグレーションハンドラー。
 *
 * 1. service.tenants から status = 'active' のスラッグを全件取得する
 * 2. 各スラッグに対してマイグレーションを実行する
 * 3. 1 テナントが失敗しても残りを続行する
 * 4. 全件処理後:
 *    - 失敗なし → 200 OK `{ success: N, failed: [] }`
 *    - 一部失敗 → 207 Multi-Status `{ success: N, failed: ['slug1', ...] }`
 */
export async function migrateAllTenantsHandler(
  c: Context<{ Variables: AdminVariables; Bindings: AppBindings }>,
): Promise<Response> {
  const db = await getDb();
  const rows = await db
    .select({ slug: serviceTenants.slug })
    .from(serviceTenants)
    .where(eq(serviceTenants.status, 'active'));

  const failedSlugs: string[] = [];
  let successCount = 0;

  for (const { slug } of rows) {
    try {
      await migrateTenant(slug);
      successCount++;
    } catch (err: unknown) {
      console.error(
        JSON.stringify({ level: 'error', message: `[${slug}] マイグレーション失敗`, error: String(err) }),
      );
      failedSlugs.push(slug);
    }
  }

  const result = { success: successCount, failed: failedSlugs };
  console.log(JSON.stringify({ level: 'info', message: '全テナントマイグレーション完了', ...result }));

  if (failedSlugs.length > 0) {
    return c.json(result, 207);
  }
  return c.json(result, 200);
}
