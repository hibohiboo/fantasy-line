import type { Handler } from 'hono';
import { eq, and } from 'drizzle-orm';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { tenantUsers, tenantUserRoles, tenantRolePermissions } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

/**
 * ユーザーを削除するハンドラー。
 * DELETE /api/users/:userId
 *
 * 1. パスパラメータ userId を取得し整数にパース（整数でなければ 400）
 * 2. tenantDb でユーザー確認（存在しなければ 404）
 * 3. ラストアドミンガード（user.manage 権限を持つユーザーが 1 人だけで削除対象なら 409）
 * 4. Cognito AdminDisableUserCommand を送信
 * 5. Cognito AdminDeleteUserCommand を送信
 * 6. tenantUserRoles からレコード削除
 * 7. tenantUsers からレコード削除
 * 8. 204 を返す
 */
export const deleteUserHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  // 1. パスパラメータ userId のパース
  const userIdParam = c.req.param('userId');
  const targetUserId = Number(userIdParam);
  if (!Number.isInteger(targetUserId) || isNaN(targetUserId) || String(targetUserId) !== userIdParam) {
    return c.json(
      { error: { code: 'validation_error', message: 'userId must be an integer' } },
      400,
    );
  }

  const tenantDb = c.get('tenantDb');

  // 2. ユーザー確認
  const userRows = await tenantDb
    .select()
    .from(tenantUsers)
    .where(eq(tenantUsers.id, targetUserId));

  const user = userRows[0];
  if (!user) {
    return c.json(
      { error: { code: 'not_found', message: 'User not found' } },
      404,
    );
  }

  // 3. ラストアドミンガード: user.manage 権限を持つ全ユーザーを取得
  const adminUsers = await tenantDb
    .select({ userId: tenantUserRoles.userId })
    .from(tenantUserRoles)
    .innerJoin(tenantRolePermissions, eq(tenantUserRoles.roleId, tenantRolePermissions.roleId))
    .where(
      and(
        eq(tenantRolePermissions.resource, 'user'),
        eq(tenantRolePermissions.action, 'manage'),
      ),
    );

  if (adminUsers.length === 1 && adminUsers[0]?.userId === targetUserId) {
    return c.json(
      { error: { code: 'last_admin', message: 'Cannot delete the last admin' } },
      409,
    );
  }

  // 4 & 5. Cognito からユーザーを無効化・削除
  const cognitoClient = new CognitoIdentityProviderClient({});
  const cognitoUserPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';

  try {
    await cognitoClient.send(
      new AdminDisableUserCommand({ UserPoolId: cognitoUserPoolId, Username: user.cognitoSub }),
    );
    await cognitoClient.send(
      new AdminDeleteUserCommand({ UserPoolId: cognitoUserPoolId, Username: user.cognitoSub }),
    );
  } catch (err) {
    console.error('[deleteUser] Cognito エラー:', err);
    return c.json(
      { error: { code: 'internal_error', message: 'Internal Server Error' } },
      500,
    );
  }

  // 6. tenantUserRoles からレコード削除
  await tenantDb
    .delete(tenantUserRoles)
    .where(eq(tenantUserRoles.userId, targetUserId));

  // 7. tenantUsers からレコード削除
  await tenantDb
    .delete(tenantUsers)
    .where(eq(tenantUsers.id, targetUserId));

  // 8. 204 No Content
  return new Response(null, { status: 204 });
};
