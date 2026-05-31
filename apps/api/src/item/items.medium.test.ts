import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as ItemsModule from './items';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

const ctx = useMysqlContainer();
let handler: typeof ItemsModule.handler;

describe('items handler', () => {
  beforeEach(async () => {
    await ctx.db.delete(schema.items);
    vi.resetModules();
    vi.doMock('../db/client', () => mockDbClient(ctx.db));
    ({ handler } = await import('./items'));
  });

  it('データが存在しない場合、空のitemsを返す', async () => {
    const result = await handler({} as APIGatewayProxyEvent, {} as Context);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).items).toEqual([]);
  });

  it('データが存在する場合、全itemsを返す', async () => {
    await ctx.db.insert(schema.items).values([
      { name: '炎の剣', description: '炎を纏った魔法の剣', rarity: 'rare', price: 5000 },
      { name: '回復薬', description: 'HPを100回復する', rarity: 'common', price: 100 },
    ]);

    const result = await handler({} as APIGatewayProxyEvent, {} as Context);

    expect(result.statusCode).toBe(200);
    const { items } = JSON.parse(result.body);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe('炎の剣');
    expect(items[0].rarity).toBe('rare');
    expect(items[0].price).toBe(5000);
    expect(items[1].name).toBe('回復薬');
  });
});
