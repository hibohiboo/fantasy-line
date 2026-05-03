import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { EchoResponseSchema } from '@repo/schema';
import { handler } from '../../src/handlers/echo';

describe('echo handler', () => {
  it('queryStringParametersがある場合、JSON文字列として返す', async () => {
    const result = await handler(
      { queryStringParameters: { message: 'hello' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    const parsed = EchoResponseSchema.parse(JSON.parse(result.body));
    expect(parsed.message).toBe(JSON.stringify({ message: 'hello' }));
  });

  it('queryStringParametersがない場合、"echo"を返す', async () => {
    const result = await handler(
      { queryStringParameters: null } as APIGatewayProxyEvent,
      {} as Context,
    );

    const parsed = EchoResponseSchema.parse(JSON.parse(result.body));
    expect(parsed.message).toBe('echo');
  });
});
