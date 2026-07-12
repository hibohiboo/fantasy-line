import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { tenantItems } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * GET /api/items のハンドラー。
 * tenantItems テーブルから ownerId が userId に一致するアイテムを返す。
 */
export const listItemsHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const result = await tenantDb
    .select()
    .from(tenantItems)
    .where(eq(tenantItems.ownerId, userId));

  return c.json({ items: result });
};
