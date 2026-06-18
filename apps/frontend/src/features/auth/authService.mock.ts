import type { AuthService, AuthUser, UserType } from './authService';

const MOCK_USER_TYPE_KEY = 'mock:userType';
const TENANT_USER_TYPES: readonly UserType[] = ['tenant_user', 'tenant_admin'];
const DEFAULT_USER_TYPE: UserType = 'tenant_user';

function buildMockUser(userType: UserType): AuthUser {
  return {
    userId: 'mock-user-1',
    email: 'mock@example.com',
    userType,
    tenantId: TENANT_USER_TYPES.includes(userType) ? 'acme' : undefined,
  };
}

/**
 * ローカル開発用のモック AuthService を生成する。
 * localStorage の 'mock:userType' をユーザー種別のストアとして使用する。
 */
export function createAuthService(): AuthService {
  return {
    async signIn(_email: string, _password: string): Promise<AuthUser> {
      const raw = localStorage.getItem(MOCK_USER_TYPE_KEY);
      const userType: UserType = (raw as UserType | null) ?? DEFAULT_USER_TYPE;
      return buildMockUser(userType);
    },

    async signOut(): Promise<void> {
      localStorage.removeItem(MOCK_USER_TYPE_KEY);
    },

    async getCurrentUser(): Promise<AuthUser | null> {
      const raw = localStorage.getItem(MOCK_USER_TYPE_KEY);
      if (raw === null) {
        return null;
      }
      return buildMockUser(raw as UserType);
    },
  };
}

/**
 * ログイン画面側からユーザー種別を設定する。
 *
 * @param userType - 設定するユーザー種別
 */
export function setMockUserType(userType: UserType): void {
  localStorage.setItem(MOCK_USER_TYPE_KEY, userType);
}
