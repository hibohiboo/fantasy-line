import { z } from 'zod';
import type { Context, MiddlewareHandler, Next } from 'hono';
import { getDb, getTenantDb } from '../../db/client';
import { serviceTenants, serviceUsers, serviceUserTenantRoles } from '../../db/service-schema';
import { tenantUsers } from '../../db/tenant-template-schema';
import type { HonoVariables } from '../../hono/types';
import { validateSlug } from '../tenant';
import { eq, and } from 'drizzle-orm';

/** Lambda event から JWT claims を取得するための最小型 */
type EventWithJwtClaims = {
  requestContext: {
    authorizer: {
      jwt: {
        claims: Record<string, string>;
      };
    };
  };
  headers?: Record<string, string>;
};

type TenantContextBindings = {
  event: EventWithJwtClaims;
};

type TenantContextEnv = {
  Variables: HonoVariables;
  Bindings: TenantContextBindings;
};

type TenantContextContext = Context<TenantContextEnv>;

const userTypeSchema = z.enum([
  'tenant_admin',
  'tenant_user',
  'servicer_admin',
  'servicer_delegate',
]);

/**
 * テナントコンテキストを Hono context にセットするミドルウェア。
 *
 * JWT claims の custom:user_type に応じて 2 経路でテナント情報を解決する。
 * - tenant_admin / tenant_user: claims の custom:tenant_id でテナントを特定
 * - servicer_admin / servicer_delegate: X-Tenant-Id ヘッダーでテナントを特定
 */
export const tenantContext: MiddlewareHandler<TenantContextEnv> = async (c, next) => {
  const event = c.env?.event as EventWithJwtClaims | undefined;
  const claims = event?.requestContext?.authorizer?.jwt?.claims ?? {};

  const userTypeParsed = userTypeSchema.safeParse(claims['custom:user_type']);
  if (!userTypeParsed.success) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const userType = userTypeParsed.data;

  const cognitoSub = claims['sub'];
  if (!cognitoSub) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  if (userType === 'tenant_admin' || userType === 'tenant_user') {
    return handleTenantUser(c, next, claims, userType, cognitoSub);
  }

  return handleServicerUser(c, next, event, userType, cognitoSub);
};

/**
 * tenant_admin / tenant_user 経路の処理。
 * claims の custom:tenant_id でテナントを特定し、テナント DB のユーザーを検索する。
 */
async function handleTenantUser(
  c: TenantContextContext,
  next: Next,
  claims: Record<string, string>,
  userType: 'tenant_admin' | 'tenant_user',
  cognitoSub: string,
): Promise<Response> {
  const slug = claims['custom:tenant_id'];
  if (!slug) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const slugValidation = validateSlug(slug);
  if (!slugValidation.valid) {
    return c.json({ error: 'Bad Request' }, 400);
  }

  const db = await getDb();
  const tenantRows = await db
    .select()
    .from(serviceTenants)
    .where(eq(serviceTenants.slug, slug));

  const tenant = tenantRows[0];
  if (!tenant || tenant.status !== 'active') {
    return c.json({ error: 'Service Unavailable' }, 503);
  }

  const tenantDb = await getTenantDb(slug);
  const userRows = await tenantDb
    .select()
    .from(tenantUsers)
    .where(eq(tenantUsers.cognitoSub, cognitoSub));

  const user = userRows[0];
  if (!user) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  c.set('tenantDb', tenantDb);
  c.set('tenantSlug', slug);
  c.set('userId', user.id);
  c.set('userType', userType);
  await next();
  return c.res;
}

/**
 * servicer_admin / servicer_delegate 経路の処理。
 * X-Tenant-Id ヘッダーでテナントを特定し、service DB でアクセス権を確認する。
 */
async function handleServicerUser(
  c: TenantContextContext,
  next: Next,
  event: EventWithJwtClaims | undefined,
  userType: 'servicer_admin' | 'servicer_delegate',
  cognitoSub: string,
): Promise<Response> {
  const slug =
    c.req.header('X-Tenant-Id') ??
    event?.headers?.['X-Tenant-Id'];

  if (!slug) {
    return c.json({ error: 'Bad Request' }, 400);
  }

  const slugValidation = validateSlug(slug);
  if (!slugValidation.valid) {
    return c.json({ error: 'Bad Request' }, 400);
  }

  const db = await getDb();

  const tenantRows = await db
    .select()
    .from(serviceTenants)
    .where(eq(serviceTenants.slug, slug));

  const tenant = tenantRows[0];
  if (!tenant || tenant.status !== 'active') {
    return c.json({ error: 'Service Unavailable' }, 503);
  }

  // cognitoSub から service user を取得して userId を解決する
  const serviceUserRows = await db
    .select()
    .from(serviceUsers)
    .where(eq(serviceUsers.cognitoSub, cognitoSub));

  const serviceUser = serviceUserRows[0];

  // user_tenant_roles でアクセス権を確認する
  const roleRows = serviceUser
    ? await db
        .select()
        .from(serviceUserTenantRoles)
        .where(
          and(
            eq(serviceUserTenantRoles.userId, serviceUser.id),
            eq(serviceUserTenantRoles.tenantId, tenant.id),
          ),
        )
    : [];

  if (roleRows.length === 0) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const tenantDb = await getTenantDb(slug);

  c.set('tenantDb', tenantDb);
  c.set('tenantSlug', slug);
  c.set('userId', serviceUser?.id ?? 0);
  c.set('userType', userType);
  await next();
  return c.res;
}
