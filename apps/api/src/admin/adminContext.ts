import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { getDb } from '../db/client';
import { serviceUsers } from '../db/service-schema';
import type { AppBindings } from '../hono/types';

export type AdminVariables = {
  userId: number;
  cognitoSub: string;
};

type AdminContextEnv = {
  Variables: AdminVariables;
  Bindings: AppBindings;
};

/**
 * 管理 Lambda 専用の認証ミドルウェア。
 *
 * tenantContext とは異なり、テナント情報を解決しない。
 * servicer_admin の JWT のみを許可し、userId と cognitoSub を context にセットする。
 */
export const adminContext: MiddlewareHandler<AdminContextEnv> = async (c, next) => {
  const event = c.env?.event;
  const claims = event?.requestContext?.authorizer?.jwt?.claims ?? {};

  if (claims['custom:user_type'] !== 'servicer_admin') {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const cognitoSub = claims['sub'];
  if (!cognitoSub) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const db = await getDb();
  const userRows = await db
    .select()
    .from(serviceUsers)
    .where(eq(serviceUsers.cognitoSub, cognitoSub));

  const user = userRows[0];
  if (!user) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('userId', user.id);
  c.set('cognitoSub', cognitoSub);
  await next();
  return c.res;
};
