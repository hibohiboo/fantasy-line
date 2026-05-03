import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import * as schema from '../../../src/db/schema';

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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      description VARCHAR(1000),
      rarity VARCHAR(50) NOT NULL DEFAULT 'common',
      price INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);

  return { container, pool, testDb };
}
