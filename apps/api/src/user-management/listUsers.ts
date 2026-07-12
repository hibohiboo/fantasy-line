import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { tenantUsers, tenantUserRoles, tenantRoles } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * テナントの全ユーザー一覧を取得するハンドラー。
 * tenantUserRoles と tenantRoles を LEFT JOIN するため、ロール未割当ユーザーも含む。
 */
export const listUsersHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');

  const result = await tenantDb
    .select({
      id: tenantUsers.id,
      email: tenantUsers.email,
      userType: tenantUsers.userType,
      roleName: tenantRoles.name,
      createdAt: tenantUsers.createdAt,
    })
    .from(tenantUsers)
    .leftJoin(tenantUserRoles, eq(tenantUsers.id, tenantUserRoles.userId))
    .leftJoin(tenantRoles, eq(tenantUserRoles.roleId, tenantRoles.id));

  return c.json({ users: result });
};
