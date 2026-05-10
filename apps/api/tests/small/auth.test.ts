import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { getOwnerId } from '../../src/auth';

function makeEvent(headers: Record<string, string>): APIGatewayProxyEvent {
  return { headers } as unknown as APIGatewayProxyEvent;
}

describe('getOwnerId', () => {
  it('X-User-Id ヘッダーがある場合は ownerId 文字列を返す', () => {
    const result = getOwnerId(makeEvent({ 'X-User-Id': 'user-1' }));
    expect(result).toBe('user-1');
  });

  it('X-User-Id ヘッダーがない場合は 401 レスポンスを返す', () => {
    const result = getOwnerId(makeEvent({}));
    expect(typeof result).toBe('object');
    const res = result as { statusCode: number; body: string };
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });

  it('X-User-Id が空文字の場合は 401 レスポンスを返す', () => {
    const result = getOwnerId(makeEvent({ 'X-User-Id': '' }));
    expect(typeof result).toBe('object');
    const res = result as { statusCode: number; body: string };
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('Unauthorized');
  });
});
