import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateResidentSchema } from '@repo/schema';
import { getDb } from '../db/client';
import { villages, residents } from '../db/schema';
import { json } from '../http';
import { getOwnerId } from '../auth';
import { logInfo } from '../logger';

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
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

  const parsed = CreateResidentSchema.safeParse(body);
  if (!parsed.success) {
    return json(400, { error: z.flattenError(parsed.error) });
  }

  const db = await getDb();

  const [village] = await db
    .select()
    .from(villages)
    .where(eq(villages.id, parsed.data.villageId));

  if (!village || village.ownerId !== ownerId) {
    return json(403, { error: 'Forbidden' });
  }

  const [inserted] = await db
    .insert(residents)
    .values({
      name: parsed.data.name,
      nameKana: parsed.data.nameKana,
      birthDate: parsed.data.birthDate,
      villageId: parsed.data.villageId,
    })
    .$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await db
    .select()
    .from(residents)
    .where(eq(residents.id, inserted.id));

  logInfo({ action: 'createResident', residentId: inserted.id, villageId: parsed.data.villageId, ownerId });

  return json(201, { resident: created });
};
