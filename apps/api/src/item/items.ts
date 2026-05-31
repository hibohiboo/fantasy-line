import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { getDb } from '../db/client';
import { items } from '../db/schema';

export const handler = async (
  _event: APIGatewayProxyEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  const db = await getDb();
  const result = await db.select().from(items);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: result }),
  };
};
