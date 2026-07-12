import path from 'path';
import { createConnection } from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { sql } from 'drizzle-orm';
import type { Context } from 'hono';
import type { AdminVariables } from './adminContext';
import type { AppBindings } from '../hono/types';
import { resolveDbCredentials } from '../db/client';

type RoleName = 'servicer_admin' | 'servicer_delegate';

const ROLE_PERMISSIONS: Array<{ role: RoleName; resource: string; action: string }> = [
  { role: 'servicer_admin', resource: 'tenant', action: 'read' },
  { role: 'servicer_admin', resource: 'tenant', action: 'write' },
  { role: 'servicer_admin', resource: 'tenant', action: 'delete' },
  { role: 'servicer_admin', resource: 'user', action: 'read' },
  { role: 'servicer_admin', resource: 'user', action: 'write' },
  { role: 'servicer_admin', resource: 'user', action: 'delete' },
  { role: 'servicer_delegate', resource: 'tenant',   action: 'read'   },
  { role: 'servicer_delegate', resource: 'user',     action: 'read'   },
  { role: 'servicer_delegate', resource: 'village',  action: 'read'   },
  { role: 'servicer_delegate', resource: 'resident', action: 'read'   },
  { role: 'servicer_delegate', resource: 'resident', action: 'create' },
  { role: 'servicer_delegate', resource: 'resident', action: 'update' },
];

/**
 * service スキーマを初期構築するハンドラー（冪等）。
 *
 * 1. DB 接続情報を取得する
 * 2. `service` データベースを CREATE DATABASE IF NOT EXISTS で作成する
 * 3. `service` DB に接続して Drizzle migrate を実行する
 * 4. roles に servicer_admin / servicer_delegate を INSERT IGNORE でシードする
 * 5. role_permissions に初期権限データを INSERT IGNORE でシードする
 */
export async function setupServiceSchemaHandler(
  c: Context<{ Variables: AdminVariables; Bindings: AppBindings }>,
): Promise<Response> {
  try {
    const creds = await resolveDbCredentials();

    // Step 1: database なし接続で CREATE DATABASE IF NOT EXISTS を実行する
    const rootConn = await createConnection({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
    });
    try {
      await rootConn.execute(
        'CREATE DATABASE IF NOT EXISTS `service` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
    } finally {
      await rootConn.end();
    }

    // Step 2: service DB に接続して migrate を実行する
    const serviceConn = await createConnection({
      host: creds.host,
      port: creds.port,
      user: creds.user,
      password: creds.password,
      database: 'service',
    });
    try {
      const db = drizzle(serviceConn);
      await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations-service') });

      // Step 3: roles に servicer_admin / servicer_delegate を INSERT IGNORE でシードする
      await db.execute(sql`INSERT IGNORE INTO roles (name) VALUES ('servicer_admin'), ('servicer_delegate')`);

      // Step 4: role_permissions に初期権限データを INSERT IGNORE でシードする
      // role_permissions は roleId が必要なため、INSERT IGNORE の raw SQL で実行する
      for (const { role, resource, action } of ROLE_PERMISSIONS) {
        await db.execute(sql`
          INSERT IGNORE INTO role_permissions (role_id, resource, action)
          SELECT id, ${resource}, ${action} FROM roles WHERE name = ${role}
        `);
      }
    } finally {
      await serviceConn.end();
    }

    return c.json({ message: 'service schema initialized' }, 200);
  } catch (err: unknown) {
    console.error('[setupServiceSchemaHandler] 失敗:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
}
