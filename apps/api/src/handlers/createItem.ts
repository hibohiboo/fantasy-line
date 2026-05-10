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
import { json } from '../http';
import { logInfo } from '../logger';

// items テーブルはユーザー所有リソースでないため認証チェック不要
export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
): Promise<APIGatewayProxyResult> => {
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: z.flattenError(parsed.error) });
  }

  const db = await getDb();
  const [inserted] = await db.insert(items).values(parsed.data).$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await db
    .select()
    .from(items)
    .where(eq(items.id, inserted.id));

  logInfo({ action: 'createItem', itemId: inserted.id });

  return json(201, { item: created });
};
