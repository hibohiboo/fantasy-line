import { createConnection } from 'mysql2/promise';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const DB_HOST = process.env['DB_HOST'] ?? 'localhost';
const DB_PORT = Number(process.env['DB_PORT'] ?? '3306');
const DB_USER = process.env['DB_USER'] ?? 'testuser';
const DB_PASSWORD = process.env['DB_PASSWORD'] ?? 'testpass';

const ROLES = ['servicer_admin', 'servicer_delegate'] as const;
type RoleName = (typeof ROLES)[number];

interface RoleRow extends RowDataPacket {
  id: number;
  name: string;
}

const ROLE_PERMISSIONS: Array<{ role: RoleName; resource: string; action: string }> = [
  { role: 'servicer_admin', resource: 'tenant', action: 'read' },
  { role: 'servicer_admin', resource: 'tenant', action: 'write' },
  { role: 'servicer_admin', resource: 'tenant', action: 'delete' },
  { role: 'servicer_admin', resource: 'user', action: 'read' },
  { role: 'servicer_admin', resource: 'user', action: 'write' },
  { role: 'servicer_admin', resource: 'user', action: 'delete' },
  { role: 'servicer_delegate', resource: 'tenant', action: 'read' },
  { role: 'servicer_delegate', resource: 'user', action: 'read' },
];

async function main(): Promise<void> {
  const connection = await createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'service',
  });

  try {
    // ロールを冪等挿入する
    for (const name of ROLES) {
      await connection.execute('INSERT IGNORE INTO roles (name) VALUES (?)', [name]);
    }
    console.log(`roles 挿入完了: ${ROLES.join(', ')}`);

    // 挿入後にロール ID を取得する
    const [rows] = await connection.execute<RoleRow[]>(
      'SELECT id, name FROM roles WHERE name IN (?, ?)',
      [ROLES[0], ROLES[1]],
    );

    const roleMap = new Map<RoleName, number>();
    for (const row of rows) {
      const roleName = row.name;
      if (roleName === 'servicer_admin' || roleName === 'servicer_delegate') {
        roleMap.set(roleName, row.id);
      }
    }

    // ロール権限を冪等挿入する
    let insertedCount = 0;
    for (const { role, resource, action } of ROLE_PERMISSIONS) {
      const roleId = roleMap.get(role);
      if (roleId === undefined) {
        console.warn(`ロール "${role}" の ID が取得できませんでした。スキップします。`);
        continue;
      }
      const [result] = await connection.execute<ResultSetHeader>(
        'INSERT IGNORE INTO role_permissions (role_id, resource, action) VALUES (?, ?, ?)',
        [roleId, resource, action],
      );
      insertedCount += result.affectedRows;
    }

    console.log(
      `role_permissions 挿入完了: ${insertedCount} 件挿入（合計 ${ROLE_PERMISSIONS.length} 件対象）`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((err: unknown) => {
  console.error('seed-service-permissions 失敗:', err);
  process.exit(1);
});
