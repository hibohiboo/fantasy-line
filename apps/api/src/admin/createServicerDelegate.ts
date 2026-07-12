import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AdminVariables } from './adminContext';
import type { AppBindings } from '../hono/types';
import { getDb } from '../db/client';
import { serviceUsers, serviceRoles, serviceUserTenantRoles } from '../db/service-schema';

const createServicerDelegateSchema = z.object({
  email: z.string().email(),
  tenantIds: z.array(z.number().int().positive()).min(1),
});

/**
 * servicer_delegate ユーザーを作成するハンドラー（POST /admin/users）。
 *
 * 1. リクエストボディを検証する（email / tenantIds）
 * 2. Cognito に servicer_delegate ユーザーを作成する（custom:tenant_id は設定しない）
 * 3. service.users にユーザーレコードを登録する
 * 4. service.user_tenant_roles に各テナントへのアクセス設定を登録する
 */
export async function createServicerDelegateHandler(
  c: Context<{ Variables: AdminVariables; Bindings: AppBindings }>,
): Promise<Response> {
  // 1. リクエストボディをバリデーション
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { error: { code: 'validation_error', message: 'Request body must be valid JSON' } },
      400,
    );
  }

  const parsed = createServicerDelegateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: { code: 'validation_error', message: 'Request validation failed' } },
      400,
    );
  }

  const { email, tenantIds } = parsed.data;

  try {
    // 2. Cognito AdminCreateUser を呼ぶ（custom:tenant_id は設定しない — PBI Rule 4）
    const cognitoClient = new CognitoIdentityProviderClient({});
    const cognitoResult = await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID ?? '',
        Username: email,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:user_type', Value: 'servicer_delegate' },
          // custom:tenant_id は設定しない（servicer_delegate は複数テナントにアクセスするため）
        ],
      }),
    );

    const cognitoSub =
      cognitoResult.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ??
      cognitoResult.User?.Username ??
      '';

    const db = await getDb();

    // 3. service.users にユーザーレコードを登録する
    const insertResult = await db.insert(serviceUsers).values({
      cognitoSub,
      email,
      userType: 'servicer_delegate',
    });

    const insertedId = Array.isArray(insertResult)
      ? (insertResult[0] as { insertId: number }).insertId
      : 0;

    // 4. servicer_delegate のロール ID を取得する
    const roleRows = await db
      .select()
      .from(serviceRoles)
      .where(eq(serviceRoles.name, 'servicer_delegate'));

    const roleId = roleRows[0]?.id;
    if (!roleId) {
      throw new Error('Role "servicer_delegate" not found');
    }

    // 5. service.user_tenant_roles に各テナントへのアクセス設定を登録する
    for (const tenantId of tenantIds) {
      await db.insert(serviceUserTenantRoles).values({
        userId: insertedId,
        tenantId,
        roleId,
      });
    }

    return c.json(
      {
        user: {
          id: insertedId,
          email,
          userType: 'servicer_delegate' as const,
        },
      },
      201,
    );
  } catch {
    return c.json(
      { error: { code: 'internal_error', message: 'Failed to create user' } },
      500,
    );
  }
}
