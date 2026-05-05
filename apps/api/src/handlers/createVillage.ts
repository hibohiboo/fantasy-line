import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateVillageSchema } from '@repo/schema';
import { getDb } from '../db/client';
import { villages } from '../db/schema';

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

  const parsed = CreateVillageSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: z.flattenError(parsed.error) }),
    };
  }

  const ownerId = event.headers?.['X-User-Id'];
  if (!ownerId) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const db = await getDb();
  const [inserted] = await db
    .insert(villages)
    .values({ name: parsed.data.name, ownerId })
    .$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await db
    .select()
    .from(villages)
    .where(eq(villages.id, inserted.id));

  console.log(JSON.stringify({ level: 'info', action: 'createVillage', villageId: inserted.id, ownerId }));

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ village: created }),
  };
};
