import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createConnection } from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { slugToSchemaName, validateSlug } from '../../apps/api/src/shared/tenant';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_HOST = process.env['DB_HOST'] ?? 'localhost';
const DB_PORT = Number(process.env['DB_PORT'] ?? '3306');
const DB_USER = process.env['DB_USER'] ?? 'testuser';
const DB_PASSWORD = process.env['DB_PASSWORD'] ?? 'testpass';

const MIGRATIONS_FOLDER = resolve(__dirname, '../../apps/api/drizzle-tenant');

interface TenantRow extends RowDataPacket {
  slug: string;
}

async function fetchActiveSlugs(): Promise<string[]> {
  const connection = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'service',
  });

  try {
    const [rows] = await connection.execute<TenantRow[]>(
      "SELECT slug FROM tenants WHERE status = 'active' ORDER BY slug ASC",
    );
    return rows.map((row) => row.slug);
  } finally {
    await connection.end();
  }
}

async function migrateTenant(slug: string): Promise<void> {
  const validation = validateSlug(slug);
  if (!validation.valid) {
    throw new Error(`無効なスラッグ "${slug}": ${validation.reason}`);
  }
  const schemaName = slugToSchemaName(slug);

  // データベースが存在しない場合は作成する（testuser に CREATE 権限が必要）
  const initConn = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  try {
    await initConn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${schemaName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await initConn.end();
  }

  const connection = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: schemaName,
  });

  try {
    const db = drizzle(connection);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`[${slug}] マイグレーション成功`);
  } finally {
    await connection.end();
  }
}

async function main(): Promise<void> {
  const slugs = await fetchActiveSlugs();
  console.log(`アクティブテナント数: ${slugs.length}`);

  const failedSlugs: string[] = [];
  let successCount = 0;

  for (const slug of slugs) {
    try {
      await migrateTenant(slug);
      successCount++;
    } catch (err: unknown) {
      console.error(`[${slug}] マイグレーション失敗:`, err);
      failedSlugs.push(slug);
    }
  }

  console.log(
    JSON.stringify({
      success: successCount,
      failed: failedSlugs.length,
      failedSlugs,
    }),
  );

  if (failedSlugs.length > 0) {
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error('migrate-all-tenants 失敗:', err);
  process.exit(1);
});
