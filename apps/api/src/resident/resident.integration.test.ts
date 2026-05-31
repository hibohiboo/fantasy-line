import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  CreateResidentResponseSchema,
  ListResidentsResponseSchema,
  ListVillageResidentsResponseSchema,
} from '@repo/schema';
import type * as CreateResidentModule from './createResident';
import type * as ListResidentsModule from './listResidents';
import type * as ListVillageResidentsModule from './listVillageResidents';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

const ctx = useMysqlContainer();
let createResident: typeof CreateResidentModule.handler;
let listResidents: typeof ListResidentsModule.handler;
let listVillageResidents: typeof ListVillageResidentsModule.handler;

const mockContext = { awsRequestId: 'test-request-id' } as Context;

describe('resident API 統合テスト', () => {
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
    ({ handler: createResident } = await import('./createResident') as typeof CreateResidentModule);
    ({ handler: listResidents } = await import('./listResidents') as typeof ListResidentsModule);
    ({ handler: listVillageResidents } = await import('./listVillageResidents') as typeof ListVillageResidentsModule);
  });

  it('POST /residents → 201・DB に正しく保存・レスポンスに必要フィールドが含まれる', async () => {
    const result = await createResident(
      {
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: ownedVillageId,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
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
    expect(rows.at(0)?.name).toBe('山田太郎');
    expect(rows.at(0)?.nameKana).toBe('ヤマダタロウ');
    expect(rows.at(0)?.birthDate).toBe('2000-01-15');
    expect(rows.at(0)?.villageId).toBe(ownedVillageId);
  });

  it('同じ村に同名の住人を2回 POST → 両方 201・DB に2件存在する（一意制約なし）', async () => {
    const post = () =>
      createResident(
        {
          body: JSON.stringify({
            name: '山田太郎',
            nameKana: 'ヤマダタロウ',
            birthDate: '2000-01-15',
            villageId: ownedVillageId,
          }),
          headers: { 'X-User-Id': 'user-1' },
        } as unknown as APIGatewayProxyEvent,
        mockContext,
      );

    const r1 = await post();
    const r2 = await post();

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);

    const rows = await ctx.db.select().from(schema.residents);
    expect(rows).toHaveLength(2);
  });

  it('GET /residents → 自分の村の住人のみ返す・他ユーザーの住人は含まない・nameKana 昇順', async () => {
    // user-2 所有の村と住人を作成
    const [otherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '魔王の村', ownerId: 'user-2' })
      .$returningId();

    // user-1 の村に住人を2名登録（createResident ハンドラーで登録）
    await createResident(
      {
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: ownedVillageId,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );
    await createResident(
      {
        body: JSON.stringify({
          name: '安部一郎',
          nameKana: 'アベイチロウ',
          birthDate: '1990-07-22',
          villageId: ownedVillageId,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    // user-2 の村に住人を直接挿入
    await ctx.db.insert(schema.residents).values({
      name: '鈴木一郎',
      nameKana: 'スズキイチロウ',
      birthDate: '1995-05-20',
      villageId: otherVillage!.id,
    });

    const result = await listResidents(
      { headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListResidentsResponseSchema.parse(JSON.parse(result.body));

    // 自分の村の住人のみ返す（他ユーザーの住人を含まない）
    expect(residents).toHaveLength(2);
    expect(residents.every((r) => r.villageId === ownedVillageId)).toBe(true);

    // nameKana 昇順
    expect(residents.at(0)?.nameKana).toBe('アベイチロウ');
    expect(residents.at(1)?.nameKana).toBe('ヤマダタロウ');
  });

  it('GET /villages/:id/residents → 指定村の住人のみ返す・nameKana 昇順・villageName なし', async () => {
    // user-1 所有の別村を作成
    const [anotherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '戦士の村', ownerId: 'user-1' })
      .$returningId();

    // 対象村に住人を2名登録
    await createResident(
      {
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: ownedVillageId,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );
    await createResident(
      {
        body: JSON.stringify({
          name: '安部一郎',
          nameKana: 'アベイチロウ',
          birthDate: '1990-07-22',
          villageId: ownedVillageId,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    // 別村に住人を1名登録
    await createResident(
      {
        body: JSON.stringify({
          name: '佐藤花子',
          nameKana: 'サトウハナコ',
          birthDate: '1998-03-10',
          villageId: anotherVillage!.id,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    const result = await listVillageResidents(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: String(ownedVillageId) },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    expect(result.statusCode).toBe(200);
    const { residents } = ListVillageResidentsResponseSchema.parse(JSON.parse(result.body));

    // 指定した村の住人のみ返す
    expect(residents).toHaveLength(2);
    expect(residents.every((r) => r.villageId === ownedVillageId)).toBe(true);

    // nameKana 昇順
    expect(residents.at(0)?.nameKana).toBe('アベイチロウ');
    expect(residents.at(1)?.nameKana).toBe('ヤマダタロウ');
  });

  it('POST /residents で他ユーザーの villageId → 403・DB に保存されない', async () => {
    // user-2 所有の村を作成
    const [otherVillage] = await ctx.db
      .insert(schema.villages)
      .values({ name: '魔王の村', ownerId: 'user-2' })
      .$returningId();

    const result = await createResident(
      {
        body: JSON.stringify({
          name: '山田太郎',
          nameKana: 'ヤマダタロウ',
          birthDate: '2000-01-15',
          villageId: otherVillage!.id,
        }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      mockContext,
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');

    // DB に登録されていないことを確認
    const rows = await ctx.db.select().from(schema.residents);
    expect(rows).toHaveLength(0);
  });
});
