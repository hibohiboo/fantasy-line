import { setActivePinia, createPinia } from 'pinia';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { setAuthService, useAuthStore } from './useAuthStore';
import type { AuthService, AuthUser } from './authService';

const mockTenantUser: AuthUser = {
  userId: 'test-user-1',
  email: 'test@example.com',
  userType: 'tenant_user',
  tenantId: 'acme',
};

function createMockAuthService(overrides?: Partial<AuthService>): AuthService {
  return {
    signIn: vi.fn<(email: string, password: string) => Promise<AuthUser>>().mockResolvedValue(mockTenantUser),
    signOut: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getCurrentUser: vi.fn<() => Promise<AuthUser | null>>().mockResolvedValue(mockTenantUser),
    ...overrides,
  };
}

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setAuthService(createMockAuthService());
  });

  describe('login()', () => {
    test('login() が成功したとき user がセットされること', async () => {
      // Arrange
      const mockService = createMockAuthService();
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      const returned = await store.login('test@example.com', 'password');

      // Assert: 戻り値に AuthUser が含まれること
      expect(returned).toMatchObject({ userType: 'tenant_user' });
      // Assert: ストアの user にも反映されること
      expect(store.user).toMatchObject({ userType: 'tenant_user' });
    });

    test('login() が失敗したとき user が null のままであること', async () => {
      // Arrange
      const mockService = createMockAuthService({
        signIn: vi.fn<(email: string, password: string) => Promise<AuthUser>>().mockRejectedValue(new Error('Invalid')),
      });
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      try {
        await store.login('test@example.com', 'wrong-password');
      } catch {
        // 例外は握りつぶす
      }

      // Assert
      expect(store.user).toBeNull();
    });

    test('login() 実行中は isLoading が true になること', async () => {
      // Arrange
      let resolveSignIn!: (user: AuthUser) => void;
      const pendingSignIn = new Promise<AuthUser>((resolve) => {
        resolveSignIn = resolve;
      });
      const mockService = createMockAuthService({
        signIn: vi.fn<(email: string, password: string) => Promise<AuthUser>>().mockReturnValue(pendingSignIn),
      });
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      const loginPromise = store.login('test@example.com', 'password');

      // Assert: resolve 前は isLoading === true
      expect(store.isLoading).toBe(true);

      resolveSignIn(mockTenantUser);
      await loginPromise;

      // Assert: resolve 後は isLoading === false
      expect(store.isLoading).toBe(false);
    });
  });

  describe('logout()', () => {
    test('logout() 後に user が null になること', async () => {
      // Arrange
      const mockService = createMockAuthService();
      setAuthService(mockService);
      const store = useAuthStore();
      await store.login('test@example.com', 'password');

      // Act
      await store.logout();

      // Assert
      expect(store.user).toBeNull();
    });

    test('logout() で authService.signOut() が呼ばれること', async () => {
      // Arrange
      const mockService = createMockAuthService();
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      await store.logout();

      // Assert
      expect(mockService.signOut).toHaveBeenCalledTimes(1);
    });
  });

  describe('restoreSession()', () => {
    test('restoreSession() でセッションが復元されること', async () => {
      // Arrange
      const mockService = createMockAuthService({
        getCurrentUser: vi.fn<() => Promise<AuthUser | null>>().mockResolvedValue(mockTenantUser),
      });
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      await store.restoreSession();

      // Assert: Pinia 3 setup store は Vue reactive proxy 経由で ref を自動 unwrap する
      expect(store.user).toMatchObject({ userType: 'tenant_user' });
    });

    test('restoreSession() で getCurrentUser() が null を返すとき user が null のままであること', async () => {
      // Arrange
      const mockService = createMockAuthService({
        getCurrentUser: vi.fn<() => Promise<AuthUser | null>>().mockResolvedValue(null),
      });
      setAuthService(mockService);
      const store = useAuthStore();

      // Act
      await store.restoreSession();

      // Assert
      expect(store.user).toBeNull();
    });

    test('restoreSession() で例外が発生したとき user が null のままであること', async () => {
      // Arrange
      const mockService = createMockAuthService({
        getCurrentUser: vi.fn<() => Promise<AuthUser | null>>().mockRejectedValue(new Error('Session expired')),
      });
      setAuthService(mockService);
      const store = useAuthStore();

      // Act（例外を外に出してはいけない）
      await store.restoreSession();

      // Assert
      expect(store.user).toBeNull();
    });
  });
});
