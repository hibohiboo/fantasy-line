import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { ListVillagesResponseSchema } from '@repo/schema';
import type * as ListVillagesModule from '../../src/handlers/listVillages';
import * as schema from '../../src/db/schema';
import { useMysqlContainer } from '../helpers/use-mysql-container';
import { mockDbClient } from '../helpers/db-mock';

const ctx = useMysqlContainer();
let handler: typeof ListVillagesModule.handler;

describe('listVillages handler - 統合テスト', () => {
  beforeEach(async () => {
    await ctx.db.delete(schema.villages);
    vi.resetModules();
    vi.doMock('../../src/db/client', () => mockDbClient(ctx.db));
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
    await ctx.db.insert(schema.villages).values([
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
    expect(villages.at(0)?.name).toBe('勇者の村');
    expect(villages.at(0)?.ownerId).toBe('user-1');
  });

  it('他ユーザーの村を含まない', async () => {
    await ctx.db.insert(schema.villages).values([
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

  it('村は作成日時の降順（最新順）で返す', async () => {
    await ctx.db.insert(schema.villages).values({ name: '古い村', ownerId: 'user-1' });
    await new Promise((r) => setTimeout(r, 1100));
    await ctx.db.insert(schema.villages).values({ name: '新しい村', ownerId: 'user-1' });

    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { villages } = ListVillagesResponseSchema.parse(JSON.parse(result.body));
    expect(villages).toHaveLength(2);
    expect(villages.at(0)?.name).toBe('新しい村');
    expect(villages.at(1)?.name).toBe('古い村');
  });

  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    const result = await handler(
      { headers: {} } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
  });
});
