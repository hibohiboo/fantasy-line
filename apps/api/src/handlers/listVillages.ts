import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { villages } from '../db/schema';
import { json } from '../http';

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  const ownerId = event.headers?.['X-User-Id'];
  if (!ownerId) {
    return json(401, { error: 'Unauthorized' });
  }

  const db = await getDb();
  const result = await db
    .select()
    .from(villages)
    .where(eq(villages.ownerId, ownerId))
    .orderBy(desc(villages.createdAt));

  console.log(JSON.stringify({ level: 'info', action: 'listVillages', count: result.length, ownerId }));

  return json(200, { villages: result });
};
