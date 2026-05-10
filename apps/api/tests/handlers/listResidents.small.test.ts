import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as ListResidentsModule from '../../src/handlers/listResidents';

describe('listResidents handler - 未認証ケース', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    const { handler } = await import('../../src/handlers/listResidents') as typeof ListResidentsModule;

    const result = await handler(
      { headers: {} } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('Unauthorized');
  });
});
