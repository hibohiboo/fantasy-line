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

  let body: unknown;
  try {
    body = JSON.parse(event.body ?? '');
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const parsed = CreateVillageSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: z.flattenError(parsed.error) });
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

  logInfo({ message: '村を作成しました', requestId: context.awsRequestId, userId: ownerId, villageId: inserted.id });

  return json(201, { village: created });
};
