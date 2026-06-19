import {
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
} from 'aws-amplify/auth';
import type { AuthService, AuthUser, UserType } from './authService';

const VALID_USER_TYPES = new Set<string>([
  'tenant_user',
  'tenant_admin',
  'servicer_admin',
  'servicer_delegate',
]);

export function createAuthService(): AuthService {
  return {
    async signIn(email: string, password: string): Promise<AuthUser> {
      const result = await amplifySignIn({ username: email, password });
      if (!result.isSignedIn) {
        throw new Error('Sign in did not complete.');
      }
      return await buildAuthUser();
    },

    async signOut(): Promise<void> {
      await amplifySignOut({ global: true });
    },

    async getCurrentUser(): Promise<AuthUser | null> {
      try {
        const session = await fetchAuthSession();
        if (!session.tokens) return null;
        return await buildAuthUser();
      } catch {
        return null;
      }
    },
  };
}

async function buildAuthUser(): Promise<AuthUser> {
  const session = await fetchAuthSession();
  const payload = session.tokens?.idToken?.payload;

  if (!payload) throw new Error('ID token payload not found.');

  const sub = payload['sub'];
  const email = payload['email'];
  const rawUserType = payload['custom:user_type'];
  const rawTenantId = payload['custom:tenant_id'];

  // エラーメッセージに JWT クレーム名・値を含めない（内部情報漏洩防止）
  if (typeof sub !== 'string') throw new Error('認証トークンの検証に失敗しました。');
  if (typeof email !== 'string') throw new Error('認証トークンの検証に失敗しました。');
  if (typeof rawUserType !== 'string' || !VALID_USER_TYPES.has(rawUserType)) {
    throw new Error('認証トークンの検証に失敗しました。');
  }

  const userType = rawUserType as UserType;
  const tenantId = typeof rawTenantId === 'string' ? rawTenantId : undefined;

  return { userId: sub, email, userType, tenantId };
}
