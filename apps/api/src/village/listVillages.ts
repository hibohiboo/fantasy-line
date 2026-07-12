import type { Handler } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { tenantVillages } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * テナントの村一覧を取得するハンドラー。
 * tenantContext ミドルウェアが解決した tenantDb と userId を使用する。
 */
export const listVillagesHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const result = await tenantDb
    .select()
    .from(tenantVillages)
    .where(eq(tenantVillages.ownerId, userId))
    .orderBy(desc(tenantVillages.createdAt));

  return c.json({ villages: result });
};
