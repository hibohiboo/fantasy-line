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
import type * as CreateVillageModule from '../../src/handlers/createVillage';
import * as schema from '../../src/db/schema';
import { setupMysqlContainer } from '../helpers/mysql-setup';
import { mockDbClient } from '../helpers/db-mock';

let container: StartedTestContainer;
let pool: mysql.Pool;
let testDb: MySql2Database<typeof schema>;
let handler: typeof CreateVillageModule.handler;

beforeAll(async () => {
  ({ container, pool, testDb } = await setupMysqlContainer());
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('createVillage handler - 統合テスト', () => {
  beforeEach(async () => {
    await testDb.delete(schema.villages);
    vi.resetModules();
    vi.doMock('../../src/db/client', () => mockDbClient(testDb));
    ({ handler } = await import('../../src/handlers/createVillage'));
  });

  it('正常なリクエストで村を作成して201を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ name: '勇者の村' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { village } = JSON.parse(result.body);
    expect(village.id).toBeDefined();
    expect(village.name).toBe('勇者の村');
    expect(village.ownerId).toBe('user-1');
    expect(village.createdAt).toBeDefined();
  });

  it('バリデーションエラーのリクエストで400を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ name: '' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
  });

  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ name: '勇者の村' }),
        headers: {},
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
  });
});
