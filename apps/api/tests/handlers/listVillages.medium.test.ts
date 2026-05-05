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
import { ListVillagesResponseSchema } from '@repo/schema';
import type * as ListVillagesModule from '../../src/handlers/listVillages';
import * as schema from '../../src/db/schema';
import { setupMysqlContainer } from '../helpers/mysql-setup';
import { mockDbClient } from '../helpers/db-mock';

let container: StartedTestContainer;
let pool: mysql.Pool;
let testDb: MySql2Database<typeof schema>;
let handler: typeof ListVillagesModule.handler;

beforeAll(async () => {
  ({ container, pool, testDb } = await setupMysqlContainer());
});

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

describe('listVillages handler - 統合テスト', () => {
  beforeEach(async () => {
    await testDb.delete(schema.villages);
    vi.resetModules();
    vi.doMock('../../src/db/client', () => mockDbClient(testDb));
    ({ handler } = await import('../../src/handlers/listVillages'));
  });

  it('村がない場合は空配列を返す', async () => {
    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { villages } = ListVillagesResponseSchema.parse(JSON.parse(result.body));
    expect(villages).toEqual([]);
  });

  it('自分の村のみ返す', async () => {
    await testDb.insert(schema.villages).values([
      { name: '勇者の村', ownerId: 'user-1' },
      { name: '魔王の村', ownerId: 'user-2' },
    ]);

    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { villages } = ListVillagesResponseSchema.parse(JSON.parse(result.body));
    expect(villages).toHaveLength(1);
    expect(villages[0].name).toBe('勇者の村');
    expect(villages[0].ownerId).toBe('user-1');
  });

  it('他ユーザーの村を含まない', async () => {
    await testDb.insert(schema.villages).values([
      { name: '魔王の村', ownerId: 'user-2' },
    ]);

    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { villages } = ListVillagesResponseSchema.parse(JSON.parse(result.body));
    expect(villages).toEqual([]);
  });

  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    const result = await handler(
      { headers: {} } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
  });
});
