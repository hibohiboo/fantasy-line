import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../../src/handlers/echo';

describe('echo handler', () => {
  it('queryStringParametersがある場合、その内容をそのまま返す', async () => {
    const result = await handler(
      { queryStringParameters: { message: 'hello' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toEqual({ message: 'hello' });
  });

  it('queryStringParametersがない場合、"echo"を返す', async () => {
    const result = await handler(
      { queryStringParameters: null } as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toBe('echo');
  });
});
