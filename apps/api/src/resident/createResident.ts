import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CreateResidentSchema } from '@repo/schema';
import { tenantVillages, tenantResidents } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * 住人を新規作成するハンドラー。
 * リクエストボディをバリデーションし、村の所有者確認を行ったうえで tenantResidents テーブルに挿入する。
 */
export const createResidentHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = CreateResidentSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: z.flattenError(parsed.error) }, 400);
  }

  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  // 村の所有確認
  const [village] = await tenantDb
    .select()
    .from(tenantVillages)
    .where(eq(tenantVillages.id, parsed.data.villageId));

  if (!village || village.ownerId !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const [inserted] = await tenantDb
    .insert(tenantResidents)
    .values({
      name: parsed.data.name,
      nameKana: parsed.data.nameKana,
      birthDate: parsed.data.birthDate,
      villageId: parsed.data.villageId,
    })
    .$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await tenantDb
    .select()
    .from(tenantResidents)
    .where(eq(tenantResidents.id, inserted.id));

  return c.json({ resident: created }, 201);
};
