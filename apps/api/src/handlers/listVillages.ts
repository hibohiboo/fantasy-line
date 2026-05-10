import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { villages } from '../db/schema';
import { json } from '../http';
import { getOwnerId } from '../auth';

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
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

  console.log(JSON.stringify({ level: 'info', action: 'listVillages', count: result.length, ownerId }));

  return json(200, { villages: result });
};
