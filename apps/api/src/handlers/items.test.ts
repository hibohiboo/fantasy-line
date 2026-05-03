import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import * as schema from '../db/schema';

let container: StartedTestContainer;
let pool: mysql.Pool;
let testDb: MySql2Database<typeof schema>;

async function waitForMysql(pool: mysql.Pool, maxRetries = 20): Promise<void> {
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

beforeAll(async () => {
  container = await new GenericContainer('mysql:8.0')
    .withEnvironment({
      MYSQL_ROOT_PASSWORD: 'rootpass',
      MYSQL_DATABASE: 'testdb',
      MYSQL_USER: 'testuser',
      MYSQL_PASSWORD: 'testpass',
    })
    .withExposedPorts(3306)
    .withWaitStrategy(Wait.forLogMessage('ready for connections', 2))
    .start();

  pool = mysql.createPool({
    host: container.getHost(),
    port: container.getMappedPort(3306),
    user: 'testuser',
    password: 'testpass',
    database: 'testdb',
  });

  testDb = drizzle({ client: pool, schema, mode: 'default' });

  // ログ出力後もMySQLが一時的に接続を閉じることがあるためリトライ
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
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('items handler', () => {
  beforeEach(async () => {
    await testDb.delete(schema.items);
    vi.resetModules();
    vi.doMock('../db/client', () => ({ db: testDb }));
  });

  it('データが存在しない場合、空のitemsを返す', async () => {
    const { handler } = await import('./items');

    const result = await handler(
      {} as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(result.body);
    expect(body.items).toEqual([]);
  });

  it('データが存在する場合、全itemsを返す', async () => {
    await testDb.insert(schema.items).values([
      { name: '炎の剣', description: '炎を纏った魔法の剣', rarity: 'rare', price: 5000 },
      { name: '回復薬', description: 'HPを100回復する', rarity: 'common', price: 100 },
    ]);

    const { handler } = await import('./items');

    const result = await handler(
      {} as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.items).toHaveLength(2);
    expect(body.items[0].name).toBe('炎の剣');
    expect(body.items[0].rarity).toBe('rare');
    expect(body.items[0].price).toBe(5000);
    expect(body.items[1].name).toBe('回復薬');
  });
});
