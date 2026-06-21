import type { Handler } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { tenantVillages, tenantResidents } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * 指定した村の住人一覧を取得するハンドラー。
 * 村の所有者確認を行い、自分の村の住人のみを nameKana 昇順で返す。
 *
 * @param c - パスパラメータ id に村 ID を含む Hono コンテキスト
 */
export const listVillageResidentsHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  const villageId = Number(c.req.param('id'));

  // 村の所有確認
  const [village] = await tenantDb
    .select()
    .from(tenantVillages)
    .where(eq(tenantVillages.id, villageId));

  if (!village || village.ownerId !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const rows = await tenantDb
    .select({
      id: tenantResidents.id,
      name: tenantResidents.name,
      nameKana: tenantResidents.nameKana,
      birthDate: tenantResidents.birthDate,
      villageId: tenantResidents.villageId,
      createdAt: tenantResidents.createdAt,
    })
    .from(tenantResidents)
    .where(eq(tenantResidents.villageId, villageId))
    .orderBy(asc(tenantResidents.nameKana));

  return c.json({ residents: rows });
};
