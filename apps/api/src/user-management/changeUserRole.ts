import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenantUsers, tenantRoles, tenantUserRoles } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

const ChangeUserRoleBodySchema = z.object({
  roleId: z.number().int().positive(),
});

/**
 * ユーザーロールを変更するハンドラー。
 * PUT /api/users/:userId/roles
 * 権限: user.manage（tenant_admin のみ）
 */
export const changeUserRoleHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const rawUserId = c.req.param('userId');
  const targetUserId = Number(rawUserId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return c.json(
      { error: { code: 'validation_error', message: 'userId must be a positive integer' } },
      400,
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: 'validation_error', message: 'Invalid JSON' } },
      400,
    );
  }

  const parsed = ChangeUserRoleBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const { roleId } = parsed.data;
  const tenantDb = c.get('tenantDb');

  const [user] = await tenantDb.select().from(tenantUsers).where(eq(tenantUsers.id, targetUserId));
  if (!user) {
    return c.json(
      { error: { code: 'not_found', message: 'User not found' } },
      404,
    );
  }

  const [role] = await tenantDb.select().from(tenantRoles).where(eq(tenantRoles.id, roleId));
  if (!role) {
    return c.json(
      { error: { code: 'unprocessable_entity', message: 'Role not found' } },
      422,
    );
  }

  await tenantDb.delete(tenantUserRoles).where(eq(tenantUserRoles.userId, targetUserId));
  await tenantDb.insert(tenantUserRoles).values({ userId: targetUserId, roleId });

  return c.json(
    { user: { id: user.id, email: user.email, roleId } },
    200,
  );
};
