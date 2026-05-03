import path from 'path';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import * as schema from '../../src/db/schema';

// vitest は apps/api/ をCWDとして実行するため drizzle/ への相対パスが確定する
const migrationsFolder = path.resolve(process.cwd(), 'drizzle');

export async function waitForMysql(pool: mysql.Pool, maxRetries = 20): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('MySQL did not become ready in time');
}

export async function setupMysqlContainer(): Promise<{
  container: StartedTestContainer;
  pool: mysql.Pool;
  testDb: MySql2Database<typeof schema>;
}> {
  const container = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'rootpass',
      MYSQL_DATABASE: 'testdb',
      MYSQL_USER: 'testuser',
      MYSQL_PASSWORD: 'testpass',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
    .start();

  const pool = mysql.createPool({
    host: container.getHost(),
    port: container.getMappedPort(3306),
    user: 'testuser',
    password: 'testpass',
    database: 'testdb',
  });

  const testDb = drizzle({ client: pool, schema, mode: 'default' });

  await waitForMysql(pool);
  await migrate(testDb, { migrationsFolder });

  return { container, pool, testDb };
}
