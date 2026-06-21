import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { tenantRoles, tenantUsers, tenantUserRoles } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

const inviteUserSchema = z.object({
  email: z.string().email(),
  roleId: z.number().int().positive(),
});

/**
 * ユーザーを招待するハンドラー。
 * POST /api/users/invite
 *
 * 1. Zod でリクエストボディをバリデーション
 * 2. tenantRoles でロール存在確認
 * 3. Cognito に AdminCreateUser を送信
 * 4. tenantUsers / tenantUserRoles にレコード挿入
 */
export const inviteUserHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  // 1. リクエストボディのパース・バリデーション
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const parsed = inviteUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const { email, roleId } = parsed.data;
  const tenantDb = c.get('tenantDb');
  const tenantSlug = c.get('tenantSlug');

  const cognitoClient = new CognitoIdentityProviderClient({});
  const cognitoUserPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';

  // 2. ロール存在確認
  const roleRows = await tenantDb
    .select()
    .from(tenantRoles)
    .where(eq(tenantRoles.id, roleId));

  const role = roleRows[0];
  if (!role) {
    return c.json(
      { error: { code: 'unprocessable_entity', message: 'Role not found' } },
      422,
    );
  }

  // ロール名に応じて userType を決定
  const userType = role.name === 'tenant_admin' ? 'tenant_admin' : 'tenant_user';

  // 3. Cognito にユーザーを作成
  let cognitoSub: string;
  try {
    const response = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: cognitoUserPoolId,
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:user_type', Value: userType },
          { Name: 'custom:tenant_id', Value: tenantSlug },
        ],
      }),
    );
    cognitoSub = response.User?.Username ?? email;
  } catch (err) {
    if (err instanceof UsernameExistsException) {
      return c.json(
        { error: { code: 'conflict', message: 'User already exists' } },
        409,
      );
    }
    console.error('[inviteUser] Cognito エラー:', err);
    return c.json(
      { error: { code: 'internal_error', message: 'Internal Server Error' } },
      500,
    );
  }

  // 4. tenantUsers にレコード挿入
  const [insertResult] = await tenantDb
    .insert(tenantUsers)
    .values({ cognitoSub, email, userType })
    .$returningId();

  if (!insertResult) {
    console.error('[inviteUser] tenantUsers 挿入結果が空');
    return c.json(
      { error: { code: 'internal_error', message: 'Internal Server Error' } },
      500,
    );
  }

  // 5. tenantUserRoles にレコード挿入
  await tenantDb
    .insert(tenantUserRoles)
    .values({ userId: insertResult.id, roleId });

  return c.json(
    {
      user: {
        id: insertResult.id,
        email,
        userType,
      },
    },
    201,
  );
};
