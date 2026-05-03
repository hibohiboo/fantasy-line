import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { EchoResponseSchema } from '@repo/schema';
import { handler } from '../../../src/handlers/echo';

describe('echo handler', () => {
  it('レスポンスボディが EchoResponseSchema に準拠している', async () => {
    const result = await handler(
      { queryStringParameters: null } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const parsed = EchoResponseSchema.parse(JSON.parse(result.body));
    expect(parsed.message).toBe('echo');
  });
});
