import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as CreateVillageModule from '../../src/handlers/createVillage';
import { mockDbClient } from '../helpers/db-mock';

let handler: typeof CreateVillageModule.handler;

beforeAll(async () => {
  vi.doMock('../../src/db/client', () => mockDbClient({}));
  ({ handler } = await import('../../src/handlers/createVillage'));
});

describe('createVillage handler - ハンドラー固有のケース', () => {
  it('bodyがJSONでない場合は400を返す', async () => {
    const result = await handler(
      { body: 'not json', headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid JSON');
  });

  it('nameが空文字の場合は400を返す', async () => {
    const result = await handler(
      {
        body: JSON.stringify({ name: '' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toEqual(
      expect.objectContaining({ fieldErrors: { name: expect.any(Array) } }),
    );
  });

});
