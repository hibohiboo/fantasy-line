import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { AuthService, AuthUser } from './authService';

let _authService: AuthService | null = null;

/**
 * アプリ起動時に1回だけ呼ぶ。テストでは mock に差し替えて使う。
 */
export function setAuthService(service: AuthService): void {
  _authService = service;
}

function getService(): AuthService {
  if (!_authService)
    throw new Error('authService not initialized. Call setAuthService() first.');
  return _authService;
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null);
  const isLoading = ref(false);

  async function login(email: string, password: string): Promise<void> {
    isLoading.value = true;
    try {
      user.value = await getService().signIn(email, password);
    } finally {
      isLoading.value = false;
    }
  }

  async function logout(): Promise<void> {
    await getService().signOut();
    user.value = null;
  }

  async function restoreSession(): Promise<void> {
    try {
      user.value = await getService().getCurrentUser();
    } catch {
      user.value = null;
    }
  }

  return { user, isLoading, login, logout, restoreSession };
});
