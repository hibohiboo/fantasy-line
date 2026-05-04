import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
// バリデーションエラー（400）ケースは DB 不要のため tests/handlers/createItem.small.test.ts で管理
import type { StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as CreateItemModule from '../../src/handlers/createItem';
import * as schema from '../../src/db/schema';
import { setupMysqlContainer } from '../helpers/mysql-setup';
import { mockDbClient } from '../helpers/db-mock';

let container: StartedTestContainer;
let pool: mysql.Pool;
let testDb: MySql2Database<typeof schema>;
let handler: typeof CreateItemModule.handler;

beforeAll(async () => {
  ({ container, pool, testDb } = await setupMysqlContainer());
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('createItem handler', () => {
  beforeEach(async () => {
    await testDb.delete(schema.items);
    vi.resetModules();
    vi.doMock('../../src/db/client', () => mockDbClient(testDb));
    ({ handler } = await import('../../src/handlers/createItem'));
  });

  it('正常なリクエストでアイテムを作成して201を返す', async () => {
    const result = await handler(
      { body: JSON.stringify({ name: '炎の剣', rarity: 'rare', price: 5000 }) } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { item } = JSON.parse(result.body);
    expect(item.id).toBeDefined();
    expect(item.name).toBe('炎の剣');
    expect(item.rarity).toBe('rare');
    expect(item.price).toBe(5000);
  });

  it('descriptionを省略してもデフォルト値で作成される', async () => {
    const result = await handler(
      { body: JSON.stringify({ name: '鉄の盾' }) } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { item } = JSON.parse(result.body);
    expect(item.name).toBe('鉄の盾');
    expect(item.rarity).toBe('common');
    expect(item.price).toBe(0);
  });
});
