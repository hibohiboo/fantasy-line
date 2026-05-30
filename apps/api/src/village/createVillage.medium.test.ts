import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { CreateVillageResponseSchema } from '@repo/schema';
import type * as CreateVillageModule from './createVillage';
import * as schema from '../db/schema';
import { useMysqlContainer } from '../shared/use-mysql-container';
import { mockDbClient } from '../shared/db-mock';

// バリデーションエラー（400）ケースは DB 不要のため createVillage.small.test.ts で管理

const ctx = useMysqlContainer();
let handler: typeof CreateVillageModule.handler;

describe('createVillage handler - 統合テスト', () => {
  beforeEach(async () => {
    await ctx.db.delete(schema.villages);
    vi.resetModules();
    vi.doMock('../db/client', () => mockDbClient(ctx.db));
    ({ handler } = await import('./createVillage'));
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
    const { village } = CreateVillageResponseSchema.parse(JSON.parse(result.body));
    expect(village.id).toBeDefined();
    expect(village.name).toBe('勇者の村');
    expect(village.ownerId).toBe('user-1');
    expect(village.createdAt).toBeDefined();
  });
});
