import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
} from 'vitest';
// バリデーションエラー（400）ケースは DB 不要のため createItem.small.test.ts で管理
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as CreateItemModule from './createItem';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

const ctx = useMysqlContainer();
let handler: typeof CreateItemModule.handler;

describe('createItem handler', () => {
  beforeEach(async () => {
    await ctx.db.delete(schema.items);
    vi.resetModules();
    vi.doMock('../db/client', () => mockDbClient(ctx.db));
    ({ handler } = await import('./createItem'));
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
