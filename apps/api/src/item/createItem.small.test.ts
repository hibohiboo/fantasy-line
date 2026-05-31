import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as CreateItemModule from './createItem';
import { mockDbClient } from '../shared/db-mock';

let handler: typeof CreateItemModule.handler;

beforeAll(async () => {
  vi.doMock('../db/client', () => mockDbClient({}));
  ({ handler } = await import('./createItem'));
});

describe('createItem handler - バリデーションエラー', () => {
  it.each([
    {
      label: 'bodyがJSONでない',
      body: 'not json',
      expectedError: 'Invalid JSON',
    },
    {
      label: 'nameが未指定',
      body: JSON.stringify({ price: 100 }),
      expectedError: expect.objectContaining({ fieldErrors: { name: expect.any(Array) } }),
    },
    {
      label: 'nameが空文字',
      body: JSON.stringify({ name: '' }),
      expectedError: expect.objectContaining({ fieldErrors: { name: expect.any(Array) } }),
    },
    {
      label: 'priceが負の数',
      body: JSON.stringify({ name: '剣', price: -1 }),
      expectedError: expect.objectContaining({ fieldErrors: { price: expect.any(Array) } }),
    },
    {
      label: 'rarityが不正な値',
      body: JSON.stringify({ name: '剣', rarity: 'super_rare' }),
      expectedError: expect.objectContaining({ fieldErrors: { rarity: expect.any(Array) } }),
    },
  ])('$label 場合は400を返す', async ({ body, expectedError }) => {
    const result = await handler(
      { body } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toEqual(expectedError);
  });
});
