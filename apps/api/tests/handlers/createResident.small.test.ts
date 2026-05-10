import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import type * as CreateResidentModule from '../../src/handlers/createResident';

const validBody = {
  name: '山田太郎',
  nameKana: 'ヤマダタロウ',
  birthDate: '2000-01-15',
  villageId: 1,
};

function buildSelectChain(villageRows: unknown[]) {
  return {
    from: () => ({ where: () => Promise.resolve(villageRows) }),
  };
}

function buildInsertChain() {
  return {
    values: () => ({ $returningId: () => Promise.resolve([{ id: 1 }]) }),
  };
}

function makeMockDb(villageRows: unknown[]) {
  return {
    getDb: () =>
      Promise.resolve({
        select: () => buildSelectChain(villageRows),
        insert: () => buildInsertChain(),
      }),
  };
}

describe('createResident handler - ハンドラー固有のケース', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('bodyがJSONでない場合は400を返す', async () => {
    vi.doMock('../../src/db/client', () => makeMockDb([]));
    const { handler } = await import('../../src/handlers/createResident') as typeof CreateResidentModule;

    const result = await handler(
      { body: 'not json', headers: { 'X-User-Id': 'user-1' } } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid JSON');
  });

  it('nameが空文字の場合は400を返す', async () => {
    vi.doMock('../../src/db/client', () => makeMockDb([]));
    const { handler } = await import('../../src/handlers/createResident') as typeof CreateResidentModule;

    const result = await handler(
      {
        body: JSON.stringify({ ...validBody, name: '' }),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toEqual(
      expect.objectContaining({ fieldErrors: { name: expect.any(Array) } }),
    );
  });

  it('X-User-Idヘッダーがない場合は401を返す', async () => {
    vi.doMock('../../src/db/client', () => makeMockDb([]));
    const { handler } = await import('../../src/handlers/createResident') as typeof CreateResidentModule;

    const result = await handler(
      {
        body: JSON.stringify(validBody),
        headers: {},
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toBe('Unauthorized');
  });

  it('他ユーザーの村へ登録しようとした場合は403を返す', async () => {
    const otherUserVillage = [{ id: 1, name: '他者の村', ownerId: 'user-2', createdAt: new Date() }];
    vi.doMock('../../src/db/client', () => makeMockDb(otherUserVillage));
    const { handler } = await import('../../src/handlers/createResident') as typeof CreateResidentModule;

    const result = await handler(
      {
        body: JSON.stringify(validBody),
        headers: { 'X-User-Id': 'user-1' },
      } as unknown as APIGatewayProxyEvent,
      {} as Context,
    );

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error).toBe('Forbidden');
  });
});
