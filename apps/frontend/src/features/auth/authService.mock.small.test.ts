import { beforeEach, describe, expect, test } from 'vitest';
import { createAuthService, setMockUserType } from './authService.mock';
import type { AuthService } from './authService';

describe('authService.mock', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    service = createAuthService();
  });

  describe('signIn()', () => {
    test('tenant_user を選択してモックログインすると tenantId が "acme" であること', async () => {
      // Arrange
      setMockUserType('tenant_user');

      // Act
      const result = await service.signIn('', '');

      // Assert
      expect(result.userType).toBe('tenant_user');
      expect(result.tenantId).toBe('acme');
    });

    test('tenant_admin を選択してモックログインすると tenantId が "acme" であること', async () => {
      // Arrange
      setMockUserType('tenant_admin');

      // Act
      const result = await service.signIn('', '');

      // Assert
      expect(result.userType).toBe('tenant_admin');
      expect(result.tenantId).toBe('acme');
    });

    test('servicer_admin を選択してモックログインすると tenantId が undefined であること', async () => {
      // Arrange
      setMockUserType('servicer_admin');

      // Act
      const result = await service.signIn('', '');

      // Assert
      expect(result.tenantId).toBeUndefined();
    });

    test('servicer_delegate を選択してモックログインすると tenantId が undefined であること', async () => {
      // Arrange
      setMockUserType('servicer_delegate');

      // Act
      const result = await service.signIn('', '');

      // Assert
      expect(result.tenantId).toBeUndefined();
    });

    test('userType が未設定のときデフォルト tenant_user でログインできること', async () => {
      // Arrange: localStorage に 'mock:userType' が存在しない状態（beforeEach でクリア済み）

      // Act
      const result = await service.signIn('', '');

      // Assert
      expect(result.userType).toBe('tenant_user');
    });
  });

  describe('signOut()', () => {
    test('signOut() 後に getCurrentUser() が null を返すこと', async () => {
      // Arrange
      setMockUserType('tenant_user');
      await service.signIn('', '');

      // Act
      await service.signOut();

      // Assert
      const result = await service.getCurrentUser();
      expect(result).toBeNull();
    });
  });

  describe('getCurrentUser()', () => {
    test('ログイン済みのとき AuthUser を返すこと', async () => {
      // Arrange
      setMockUserType('tenant_admin');

      // Act
      const result = await service.getCurrentUser();

      // Assert
      expect(result?.userType).toBe('tenant_admin');
    });

    test('未ログインのとき null を返すこと', async () => {
      // Arrange: localStorage に 'mock:userType' が存在しない状態（beforeEach でクリア済み）

      // Act
      const result = await service.getCurrentUser();

      // Assert
      expect(result).toBeNull();
    });
  });
});
