export type UserType =
  | 'tenant_user'
  | 'tenant_admin'
  | 'servicer_admin'
  | 'servicer_delegate';

export interface AuthUser {
  userId: string;
  email: string;
  userType: UserType;
  tenantId?: string; // tenant_* のみ設定。servicer_* は undefined
}

export interface AuthService {
  signIn(email: string, password: string): Promise<AuthUser>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<AuthUser | null>;
}
