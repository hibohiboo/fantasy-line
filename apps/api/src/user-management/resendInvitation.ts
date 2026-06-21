import type { Handler } from 'hono';
import { eq } from 'drizzle-orm';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { tenantUsers } from '../db/tenant-template-schema';
import type { HonoVariables } from '../hono/types';

const cognitoClient = new CognitoIdentityProviderClient({});
const cognitoUserPoolId = process.env['COGNITO_USER_POOL_ID'] ?? '';

/**
 * 招待メールを再送するハンドラー。
 * POST /api/users/:userId/resend-invitation
 *
 * 1. パスパラメータ userId を数値にパース（整数でなければ 400）
 * 2. tenantDb でユーザー確認（存在しなければ 404）
 * 3. Cognito AdminCreateUserCommand を MessageAction: "RESEND" で送信
 * 4. 200 を返す
 */
export const resendInvitationHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  // 1. パスパラメータの検証
  const userIdParam = c.req.param('userId');
  const userId = Number(userIdParam);
  if (!Number.isInteger(userId) || isNaN(userId)) {
    return c.json(
      { error: { code: 'validation_error', message: 'Invalid userId' } },
      400,
    );
  }

  const tenantDb = c.get('tenantDb');

  // 2. ユーザー存在確認
  const rows = await tenantDb
    .select()
    .from(tenantUsers)
    .where(eq(tenantUsers.id, userId));

  const user = rows[0];
  if (!user) {
    return c.json(
      { error: { code: 'not_found', message: 'User not found' } },
      404,
    );
  }

  // 3. Cognito に招待メール再送
  try {
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: cognitoUserPoolId,
        Username: user.cognitoSub,
        MessageAction: 'RESEND',
      }),
    );
  } catch (err) {
    console.error('[resendInvitation] Cognito エラー:', err);
    return c.json(
      { error: { code: 'internal_error', message: 'Internal Server Error' } },
      500,
    );
  }

  return c.json({ message: 'invitation resent' }, 200);
};
