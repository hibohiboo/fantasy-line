import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import type { StartedTestContainer } from 'testcontainers';
import mysql from 'mysql2/promise';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import * as schema from '../../src/db/schema';
import { setupMysqlContainer } from '../test/mysql-setup';

let container: StartedTestContainer;
let pool: mysql.Pool;
let testDb: MySql2Database<typeof schema>;

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
    vi.doMock('../../src/db/client', () => ({ db: testDb }));
  });

  it('正常なリクエストでアイテムを作成して201を返す', async () => {
    const { handler } = await import('../../src/handlers/createItem');

    const result = await handler(
      {
        body: JSON.stringify({ name: '炎の剣', rarity: 'rare', price: 5000 }),
      } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    expect(result.headers?.['Content-Type']).toBe('application/json');
    const body = JSON.parse(result.body);
    expect(body.item.id).toBeDefined();
    expect(body.item.name).toBe('炎の剣');
    expect(body.item.rarity).toBe('rare');
    expect(body.item.price).toBe(5000);
  });

  it('descriptionを省略してもデフォルト値で作成される', async () => {
    const { handler } = await import('../../src/handlers/createItem');

    const result = await handler(
      { body: JSON.stringify({ name: '鉄の盾' }) } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.item.name).toBe('鉄の盾');
    expect(body.item.rarity).toBe('common');
    expect(body.item.price).toBe(0);
  });

  it('nameが未指定の場合400を返す', async () => {
    const { handler } = await import('../../src/handlers/createItem');

    const result = await handler(
      { body: JSON.stringify({ price: 100 }) } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBeDefined();
  });

  it('bodyがJSONでない場合400を返す', async () => {
    const { handler } = await import('../../src/handlers/createItem');

    const result = await handler(
      { body: 'not json' } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toBe('Invalid JSON');
  });
});
