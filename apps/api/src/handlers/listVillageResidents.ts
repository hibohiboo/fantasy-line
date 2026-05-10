import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/client';
import { villages, residents } from '../db/schema';
import { json } from '../http';
import { getOwnerId } from '../auth';
import { logInfo } from '../logger';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  const ownerIdResult = getOwnerId(event);
  if (typeof ownerIdResult !== 'string') return ownerIdResult;
  const ownerId = ownerIdResult;

  const villageId = Number(event.pathParameters?.id);

  const db = await getDb();

  const [village] = await db
    .select()
    .from(villages)
    .where(eq(villages.id, villageId));

  if (!village || village.ownerId !== ownerId) {
    return json(403, { error: 'Forbidden' });
  }

  const rows = await db
    .select({
      id: residents.id,
      name: residents.name,
      nameKana: residents.nameKana,
      birthDate: residents.birthDate,
      villageId: residents.villageId,
      createdAt: residents.createdAt,
    })
    .from(residents)
    .where(eq(residents.villageId, villageId))
    .orderBy(asc(residents.nameKana));

  logInfo({ message: '村別住人一覧を取得しました', requestId: context.awsRequestId, userId: ownerId, villageId, count: rows.length });

  return json(200, { residents: rows });
};
