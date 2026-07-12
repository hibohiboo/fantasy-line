import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenantItems } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

const createTenantItemSchema = z.object({
  name: z.string().min(1),
});

/**
 * POST /api/items のハンドラー。
 * tenantItems テーブルに name・ownerId を挿入して 201 を返す。
 */
export const createItemHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const parsed = createTenantItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: z.flattenError(parsed.error) }, 400);
  }

  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const [inserted] = await tenantDb
    .insert(tenantItems)
    .values({ name: parsed.data.name, ownerId: userId })
    .$returningId();
  if (!inserted) throw new Error('Insert returned no result');

  const [created] = await tenantDb
    .select()
    .from(tenantItems)
    .where(eq(tenantItems.id, inserted.id));

  return c.json({ item: created }, 201);
};
