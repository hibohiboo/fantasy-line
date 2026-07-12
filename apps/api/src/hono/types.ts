import type { TenantDb } from '../db/client';

export type UserType = 'tenant_admin' | 'tenant_user' | 'servicer_admin' | 'servicer_delegate';

export type HonoVariables = {
  tenantDb: TenantDb;
  tenantSlug: string;
  userId: number;
  userType: UserType;
};

/** Lambda event から JWT claims を取得するための Bindings 型。各 -lambda.ts で共有する */
export type AppBindings = {
  event: {
    requestContext: {
      authorizer: {
        jwt: {
          claims: Record<string, string>;
        };
      };
    };
    headers?: Record<string, string>;
  };
};
