import type { TenantDb } from '../db/client';

export type UserType = 'tenant_admin' | 'tenant_user' | 'servicer_admin' | 'servicer_delegate';

export type HonoVariables = {
  tenantDb: TenantDb;
  tenantSlug: string;
  userId: number;
  userType: UserType;
};
