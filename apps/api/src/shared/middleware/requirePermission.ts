import type { MiddlewareHandler } from 'hono';
import { eq, and } from 'drizzle-orm';
import { tenantUserRoles, tenantRolePermissions } from '../../db/tenant-template-schema';
import {
  serviceTenants,
  serviceUserTenantRoles,
  serviceRolePermissions,
} from '../../db/service-schema';
import { getDb } from '../../db/client';
import type { HonoVariables } from '../../hono/types';

/**
 * 機能認可ミドルウェア（Tier 2）。
 * servicer_admin の場合はスキップ（全権限）。
 * servicer_delegate の場合は service.user_tenant_roles JOIN service.role_permissions で確認。
 * それ以外は tenant_{slug}.user_roles JOIN role_permissions で resource × action を確認する。
 *
 * @param resource - 認可対象リソース名（例: 'village'）
 * @param action - 認可対象アクション名（例: 'read'）
 */
export function requirePermission(
  resource: string,
  action: string,
): MiddlewareHandler<{ Variables: HonoVariables }> {
  return async (c, next) => {
    const userType = c.get('userType');

    if (userType === 'servicer_admin') {
      await next();
      return;
    }

    if (userType === 'servicer_delegate') {
      const serviceDb = await getDb();
      const userId = c.get('userId');
      const tenantSlug = c.get('tenantSlug');

      const rows = await serviceDb
        .select()
        .from(serviceUserTenantRoles)
        .innerJoin(serviceTenants, eq(serviceUserTenantRoles.tenantId, serviceTenants.id))
        .innerJoin(serviceRolePermissions, eq(serviceUserTenantRoles.roleId, serviceRolePermissions.roleId))
        .where(
          and(
            eq(serviceTenants.slug, tenantSlug),
            eq(serviceUserTenantRoles.userId, userId),
            eq(serviceRolePermissions.resource, resource),
            eq(serviceRolePermissions.action, action),
          ),
        );

      if (rows.length === 0) {
        return c.json({ error: 'Forbidden' }, 403);
      }

      await next();
      return;
    }

    const userId = c.get('userId');
    const tenantDb = c.get('tenantDb');

    const rows = await tenantDb
      .select()
      .from(tenantUserRoles)
      .innerJoin(tenantRolePermissions, eq(tenantUserRoles.roleId, tenantRolePermissions.roleId))
      .where(
        and(
          eq(tenantUserRoles.userId, userId),
          eq(tenantRolePermissions.resource, resource),
          eq(tenantRolePermissions.action, action),
        ),
      );

    if (rows.length === 0) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
}
