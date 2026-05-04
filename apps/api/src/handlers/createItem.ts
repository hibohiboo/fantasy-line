import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateItemSchema } from '@repo/schema';
import { getDb } from '../db/client';
import { items } from '../db/schema';

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: z.flattenError(parsed.error) }),
    };
  }

  const db = await getDb();
  const [inserted] = await db.insert(items).values(parsed.data).$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await db
    .select()
    .from(items)
    .where(eq(items.id, inserted.id));

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: created }),
  };
};
