import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateVillageSchema } from '@repo/schema';
import { tenantVillages } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * 村を新規作成するハンドラー。
 * リクエストボディの name をバリデーションし、tenantVillages テーブルに挿入する。
 */
export const createVillageHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = CreateVillageSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: z.flattenError(parsed.error) }, 400);
  }

  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const [inserted] = await tenantDb
    .insert(tenantVillages)
    .values({ name: parsed.data.name, ownerId: userId })
    .$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await tenantDb
    .select()
    .from(tenantVillages)
    .where(eq(tenantVillages.id, inserted.id));

  return c.json({ village: created }, 201);
};
