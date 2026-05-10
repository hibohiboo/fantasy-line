import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { ListResidentsResponseSchema } from '@repo/schema';
import type * as ListResidentsModule from '../../src/handlers/listResidents';
import * as schema from '../../src/db/schema';
import { useMysqlContainer } from '../helpers/use-mysql-container';
import { mockDbClient } from '../helpers/db-mock';

const ctx = useMysqlContainer();
let handler: typeof ListResidentsModule.handler;

describe('listResidents handler - 統合テスト', () => {
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
    ({ handler } = await import('../../src/handlers/listResidents') as typeof ListResidentsModule);
  });

  it('住人がいない場合は空配列を返す', async () => {
    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toEqual([]);
  });

  it('自分の村の住人のみ返す（他ユーザーの住人を含まない）', async () => {
    // user-2 所有の村と住人を作成
    const [otherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '魔王の村', ownerId: 'user-2' })
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
        villageId: otherVillage!.id,
      },
    ]);

    const result = await handler(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toHaveLength(1);
    expect(residents.at(0)?.name).toBe('山田太郎');
    expect(residents.at(0)?.villageName).toBe('勇者の村');
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
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListResidentsResponseSchema.parse(JSON.parse(result.body));
    expect(residents).toHaveLength(3);
    expect(residents.at(0)?.nameKana).toBe('アベイチロウ');
    expect(residents.at(1)?.nameKana).toBe('サトウハナコ');
    expect(residents.at(2)?.nameKana).toBe('ヤマダタロウ');
  });

  it('未認証（X-User-Idなし）の場合は401を返す', async () => {
    const result = await handler(
      { headers: {} } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('Unauthorized');
  });
});
