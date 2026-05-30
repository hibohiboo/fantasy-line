import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as ListVillageResidentsModule from './listVillageResidents';

// createResident.small.test.ts の makeMockDb パターンを踏襲
// early-return ケース（403）専用の最小モック
// 正常系は Medium テスト（listVillageResidents.medium.test.ts）で担保
function buildSelectChain(villageRows: unknown[]) {
  return {
    from: () => ({ where: () => Promise.resolve(villageRows) }),
  };
}

function makeMockDb(villageRows: unknown[]) {
  return {
    getDb: () =>
      Promise.resolve({
        select: () => buildSelectChain(villageRows),
      }),
  };
}

describe('listVillageResidents handler - ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('他ユーザーの村への参照は403を返す', async () => {
    const otherUserVillage = [{ id: 1, name: '他者の村', ownerId: 'user-2', createdAt: new Date() }];
    vi.doMock('../db/client', () => makeMockDb(otherUserVillage));
    const { handler } = await import('./listVillageResidents') as typeof ListVillageResidentsModule;

    const result = await handler(
      {
        headers: { 'X-User-Id': 'user-1' },
        pathParameters: { id: '1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');
  });
});
