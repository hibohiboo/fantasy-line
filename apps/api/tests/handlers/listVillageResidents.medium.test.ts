import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { ListVillageResidentsResponseSchema } from '@repo/schema';
import type * as ListVillageResidentsModule from '../../src/handlers/listVillageResidents';
import * as schema from '../../src/db/schema';
import { useMysqlContainer } from '../helpers/use-mysql-container';
import { mockDbClient } from '../helpers/db-mock';

const ctx = useMysqlContainer();
let handler: typeof ListVillageResidentsModule.handler;

describe('listVillageResidents handler - 統合テスト', () => {
  let ownedVillageId: number;

  beforeEach(async () => {
    // residents → villages の順で削除（参照整合性）
    await ctx.db.delete(schema.residents);
    await ctx.db.delete(schema.villages);

    // テスト用村を作成（user-1 所有）
    const [inserted] = await ctx.db
      .insert(schema.villages)
      .values({ name: '勇者の村', ownerId: 'user-1' })
      .$returningId();
    ownedVillageId = inserted!.id;

    vi.resetModules();
    vi.doMock('../../src/db/client', () => mockDbClient(ctx.db));
    ({ handler } = await import('../../src/handlers/listVillageResidents') as typeof ListVillageResidentsModule);
  });

  it('住人がいない場合は空配列を返す', async () => {
    const result = await handler(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: String(ownedVillageId) },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListVillageResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toEqual([]);
  });

  it('指定した村の住人のみ返す（他の村の住人を含まない）', async () => {
    // user-1 所有の別村を作成
    const [anotherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '戦士の村', ownerId: 'user-1' })
      .$returningId();

    await ctx.db.insert(schema.residents).values([
      {
        name: '山田太郎',
        nameKana: 'ヤマダタロウ',
        birthDate: '2000-01-15',
        villageId: ownedVillageId,
      },
      {
        name: '鈴木一郎',
        nameKana: 'スズキイチロウ',
        birthDate: '1995-05-20',
        villageId: anotherVillage!.id,
      },
    ]);

    const result = await handler(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: String(ownedVillageId) },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListVillageResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toHaveLength(1);
    expect(residents.at(0)?.name).toBe('山田太郎');
  });

  it('nameKana の昇順でソートされて返す', async () => {
    await ctx.db.insert(schema.residents).values([
      {
        name: '山田太郎',
        nameKana: 'ヤマダタロウ',
        birthDate: '2000-01-15',
        villageId: ownedVillageId,
      },
      {
        name: '佐藤花子',
        nameKana: 'サトウハナコ',
        birthDate: '1998-03-10',
        villageId: ownedVillageId,
      },
      {
        name: '安部一郎',
        nameKana: 'アベイチロウ',
        birthDate: '1990-07-22',
        villageId: ownedVillageId,
      },
    ]);

    const result = await handler(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: String(ownedVillageId) },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListVillageResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toHaveLength(3);
    expect(residents.at(0)?.nameKana).toBe('アベイチロウ');
    expect(residents.at(1)?.nameKana).toBe('サトウハナコ');
    expect(residents.at(2)?.nameKana).toBe('ヤマダタロウ');
  });

  it('他ユーザーの村へのアクセスは403を返す', async () => {
    // user-2 所有の村を作成
    const [otherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '魔王の村', ownerId: 'user-2' })
      .$returningId();

    const result = await handler(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: String(otherVillage!.id) },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');
  });
});
