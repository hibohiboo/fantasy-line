import type { Handler } from 'hono';
import { eq, asc } from 'drizzle-orm';
import { tenantVillages, tenantResidents } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * テナントの住人一覧を取得するハンドラー。
 * 自分が所有する村の住人のみを nameKana 昇順で返す。
 * レスポンスには villageName フィールドを含む。
 */
export const listResidentsHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');

  const rows = await tenantDb
    .select({
      id: tenantResidents.id,
      name: tenantResidents.name,
      nameKana: tenantResidents.nameKana,
      birthDate: tenantResidents.birthDate,
      villageId: tenantResidents.villageId,
      createdAt: tenantResidents.createdAt,
      villageName: tenantVillages.name,
    })
    .from(tenantResidents)
    .innerJoin(tenantVillages, eq(tenantResidents.villageId, tenantVillages.id))
    .where(eq(tenantVillages.ownerId, userId))
    .orderBy(asc(tenantResidents.nameKana));

  return c.json({ residents: rows });
};
