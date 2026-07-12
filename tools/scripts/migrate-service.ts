import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { createConnection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_HOST = process.env['DB_HOST'] ?? 'localhost';
const DB_PORT = Number(process.env['DB_PORT'] ?? '3306');
const DB_USER = process.env['DB_USER'] ?? 'testuser';
const DB_PASSWORD = process.env['DB_PASSWORD'] ?? 'testpass';
const SERVICE_DB = process.env['SERVICE_DB'] ?? 'service';

const MIGRATIONS_FOLDER = resolve(__dirname, '../../apps/api/drizzle-service');

async function main(): Promise<void> {
  // データベースを接続先指定なしで作成する（testuser に CREATE 権限が必要）
  const initConn = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
  });

  try {
    await initConn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${SERVICE_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    console.log(`データベース "${SERVICE_DB}" を確認・作成しました`);
  } finally {
    await initConn.end();
  }

  // service スキーマにマイグレーションを適用する
  const conn = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: SERVICE_DB,
  });

  try {
    const db = drizzle(conn);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log(`"${SERVICE_DB}" スキーマのマイグレーション完了`);
  } finally {
    await conn.end();
  }
}

main().catch((err: unknown) => {
  console.error('migrate-service 失敗:', err);
  process.exit(1);
});
