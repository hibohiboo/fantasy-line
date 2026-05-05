import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as ListVillagesModule from '../../src/handlers/listVillages';
import { mockDbClient } from '../helpers/db-mock';

let handler: typeof ListVillagesModule.handler;

beforeAll(async () => {
  vi.doMock('../../src/db/client', () => mockDbClient({}));
  ({ handler } = await import('../../src/handlers/listVillages'));
});

describe('listVillages handler - ハンドラー固有のケース', () => {
  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    const result = await handler(
      { headers: {} } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('Unauthorized');
  });
});
