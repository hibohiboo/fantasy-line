import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client';
import { items } from '../db/schema';

const createItemSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  rarity: z
    .enum(['common', 'uncommon', 'rare', 'epic', 'legendary'])
    .optional(),
  price: z.number().int().min(0).optional(),
});

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

  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: parsed.error.flatten() }),
    };
  }

  const [{ id }] = await db.insert(items).values(parsed.data).$returningId();
  const [created] = await db.select().from(items).where(eq(items.id, id));

  return {
    statusCode: 201,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ item: created }),
  };
};
