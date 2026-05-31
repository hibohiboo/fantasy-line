import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { CreateResidentResponseSchema } from '@repo/schema';
import type * as CreateResidentModule from './createResident';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

const ctx = useMysqlContainer();
let handler: typeof CreateResidentModule.handler;

const validBody = {
  name: '山田太郎',
  nameKana: 'ヤマダタロウ',
  birthDate: '2000-01-15',
  villageId: 0, // beforeEach で差し替える
};

describe('createResident handler - 統合テスト', () => {
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
    vi.doMock('../db/client', () => mockDbClient(ctx.db));
    ({ handler } = await import('./createResident') as typeof CreateResidentModule);
  });

  it('正常なリクエストで住人を作成して201を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ ...validBody, villageId: ownedVillageId }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(201);
    const { resident } = CreateResidentResponseSchema.parse(JSON.parse(result.body));
    expect(resident.id).toBeDefined();
    expect(resident.name).toBe('山田太郎');
    expect(resident.nameKana).toBe('ヤマダタロウ');
    expect(resident.birthDate).toBe('2000-01-15');
    expect(resident.villageId).toBe(ownedVillageId);
    expect(resident.createdAt).toBeDefined();

    // DB に1件登録されていることを確認
    const rows = await ctx.db.select().from(schema.residents);
    expect(rows).toHaveLength(1);
  });

  it('バリデーションエラーのリクエストで400を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ ...validBody, villageId: ownedVillageId, name: '' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
  });

  it('他ユーザーの村へ登録しようとした場合は403を返し、DBに保存されない', async () => {
    // user-2 所有の村を作成
    const [otherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '他者の村', ownerId: 'user-2' })
      .$returningId();

    const result = await handler(
      {
        body: JSON.stringify({ ...validBody, villageId: otherVillage!.id }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');

    // DB に登録されていないことを確認
    const rows = await ctx.db.select().from(schema.residents);
    expect(rows).toHaveLength(0);
  });

  it('villageIdがない場合（バリデーション失敗）は400を返す', async () => {
    const { name, nameKana, birthDate } = validBody;
    const result = await handler(
      {
        body: JSON.stringify({ name, nameKana, birthDate }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
  });
});
