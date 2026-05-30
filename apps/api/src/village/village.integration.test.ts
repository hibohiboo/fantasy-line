import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { CreateVillageResponseSchema, ListVillagesResponseSchema } from '@repo/schema';
import type * as CreateVillageModule from './createVillage';
import type * as ListVillagesModule from './listVillages';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

const ctx = useMysqlContainer();
let createVillage: typeof CreateVillageModule.handler;
let listVillages: typeof ListVillagesModule.handler;

describe('village API 統合テスト', () => {
  beforeEach(async () => {
    await ctx.db.delete(schema.villages);
    vi.resetModules();
    vi.doMock('../db/client', () => mockDbClient(ctx.db));
    ({ handler: createVillage } = await import('./createVillage'));
    ({ handler: listVillages } = await import('./listVillages'));
  });

  it('POST /villages → 201・DB に owner_id 付きで保存・レスポンスに必要フィールドが含まれる', async () => {
    const result = await createVillage(
      {
        body: JSON.stringify({ name: 'エルムの村' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { village } = CreateVillageResponseSchema.parse(JSON.parse(result.body));
    expect(village.id).toBeDefined();
    expect(village.name).toBe('エルムの村');
    expect(village.ownerId).toBe('user-1');
    expect(village.createdAt).toBeDefined();

    const rows = await ctx.db.select().from(schema.villages);
    expect(rows).toHaveLength(1);
    expect(rows.at(0)?.ownerId).toBe('user-1');
  });

  it('同じ村名で2回 POST → 両方 201・DB に2件存在する', async () => {
    const post = () =>
      createVillage(
        {
          body: JSON.stringify({ name: 'エルムの村' }),
          headers: { 'X-User-Id': 'user-1' },
        } as unknown as APIGatewayProxyEvent,
        {} as Context,
      );

    const [r1, r2] = await Promise.all([post(), post()]);
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);

    const rows = await ctx.db.select().from(schema.villages);
    expect(rows).toHaveLength(2);
  });

  it('リクエストボディに owner_id を含めても X-User-Id ヘッダーの値で上書きされる', async () => {
    const result = await createVillage(
      {
        body: JSON.stringify({ name: 'エルムの村', ownerId: 'attacker' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { village } = CreateVillageResponseSchema.parse(JSON.parse(result.body));
    expect(village.ownerId).toBe('user-1');

    const rows = await ctx.db.select().from(schema.villages);
    expect(rows.at(0)?.ownerId).toBe('user-1');
  });

  it('ユーザーA・B それぞれ村を作成後、GET /villages で各ユーザーは自分の村のみ取得できる', async () => {
    await createVillage(
      {
        body: JSON.stringify({ name: 'Aの村' }),
        headers: { 'X-User-Id': 'user-A' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );
    await createVillage(
      {
        body: JSON.stringify({ name: 'Bの村' }),
        headers: { 'X-User-Id': 'user-B' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    const resultA = await listVillages(
      { headers: { 'X-User-Id': 'user-A' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );
    const resultB = await listVillages(
      { headers: { 'X-User-Id': 'user-B' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    const { villages: villagesA } = ListVillagesResponseSchema.parse(JSON.parse(resultA.body));
    const { villages: villagesB } = ListVillagesResponseSchema.parse(JSON.parse(resultB.body));

    expect(villagesA).toHaveLength(1);
    expect(villagesA.at(0)?.name).toBe('Aの村');
    expect(villagesA.at(0)?.ownerId).toBe('user-A');

    expect(villagesB).toHaveLength(1);
    expect(villagesB.at(0)?.name).toBe('Bの村');
    expect(villagesB.at(0)?.ownerId).toBe('user-B');
  });
});
