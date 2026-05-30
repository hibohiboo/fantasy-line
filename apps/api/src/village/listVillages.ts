import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { villages } from '../db/schema';
import { json } from '../shared/http';
import { getOwnerId } from '../shared/auth';
import { logInfo } from '../shared/logger';

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  const ownerIdResult = getOwnerId(event);
  if (typeof ownerIdResult !== 'string') return ownerIdResult;
  const ownerId = ownerIdResult;

  const db = await getDb();
  const result = await db
    .select()
    .from(villages)
    .where(eq(villages.ownerId, ownerId))
    .orderBy(desc(villages.createdAt));

  logInfo({ message: '村一覧を取得しました', requestId: context.awsRequestId, userId: ownerId, count: result.length });

  return json(200, { villages: result });
};
