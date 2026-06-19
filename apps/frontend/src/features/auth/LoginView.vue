<script setup lang="ts">
import { defineComponent, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Authenticator } from '@aws-amplify/ui-vue'
import '@aws-amplify/ui-vue/styles.css'
import { useAuthStore } from './useAuthStore'
import type { AuthUser, UserType } from './authService'

const router = useRouter()
const authStore = useAuthStore()

const isMock = import.meta.env.VITE_USE_MOCK === 'true'

const REDIRECT_MAP: Record<UserType, string> = {
  tenant_user: '/villages',
  tenant_admin: '/villages',
  servicer_admin: '/',
  servicer_delegate: '/',
}

function getRedirectPath(userType: UserType): string {
  // Record<UserType, string> はすべてのキーを網羅しているが、
  // noUncheckedIndexedAccess により string | undefined になるため
  // フォールバックを付与する
  return REDIRECT_MAP[userType] ?? '/'
}

function resolveUser(): AuthUser | null {
  // useAuthStore の user は vue-tsc では Ref として推論されるため、
  // 実行時は Pinia が自動アンラップする。
  // 型安全にアクセスするため AuthUser | null にキャストする。
  const raw: unknown = authStore.user
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'userType' in raw &&
    'userId' in raw &&
    'email' in raw
  ) {
    return raw as AuthUser
  }
  return null
}

// === モックモード ===
const selectedUserType = ref<UserType>('tenant_user')
const mockError = ref('')
const isLoggingIn = ref(false)

const userTypeOptions: Array<{ title: string; value: UserType }> = [
  { title: 'テナント一般ユーザー (tenant_user)', value: 'tenant_user' },
  { title: 'テナント管理者 (tenant_admin)', value: 'tenant_admin' },
  { title: 'サービサー管理者 (servicer_admin)', value: 'servicer_admin' },
  { title: 'サービサー委任者 (servicer_delegate)', value: 'servicer_delegate' },
]

async function handleMockLogin(): Promise<void> {
  mockError.value = ''
  isLoggingIn.value = true
  try {
    localStorage.setItem('mock:userType', selectedUserType.value)
    await authStore.login('', '')
    const user = resolveUser()
    if (user) {
      await router.push(getRedirectPath(user.userType))
    }
  } catch {
    mockError.value = 'ログインに失敗しました。'
  } finally {
    isLoggingIn.value = false
  }
}

// === 本番モード: Amplify 認証後リダイレクト ===
// Authenticator の slot 内で使う内部コンポーネント。
// マウント時に restoreSession → リダイレクトを実行する。
const PostSignInRedirect = defineComponent({
  name: 'PostSignInRedirect',
  setup() {
    const postRouter = useRouter()
    const postStore = useAuthStore()

    function resolvePostUser(): AuthUser | null {
      const raw: unknown = postStore.user
      if (
        raw !== null &&
        typeof raw === 'object' &&
        'userType' in raw &&
        'userId' in raw &&
        'email' in raw
      ) {
        return raw as AuthUser
      }
      return null
    }

    onMounted(async () => {
      await postStore.restoreSession()
      const user = resolvePostUser()
      if (user) {
        await postRouter.push(getRedirectPath(user.userType))
      }
    })
    return () => null
  },
})
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="5">

        <!-- モックモード: 開発用ログインフォーム -->
        <template v-if="isMock">
          <v-card class="pa-6" elevation="3">
            <v-card-title class="text-h5 mb-2">
              モックログイン
            </v-card-title>
            <v-card-subtitle>
              開発環境専用（Cognito 未接続）
            </v-card-subtitle>
            <v-card-text>
              <v-select
                v-model="selectedUserType"
                :items="userTypeOptions"
                item-title="title"
                item-value="value"
                label="ユーザー種別"
                variant="outlined"
                class="mt-4"
              />
              <v-alert
                v-if="mockError"
                type="error"
                variant="tonal"
                class="mt-2"
              >
                {{ mockError }}
              </v-alert>
            </v-card-text>
            <v-card-actions class="px-4 pb-4">
              <v-btn
                color="primary"
                variant="elevated"
                :loading="isLoggingIn"
                block
                @click="handleMockLogin"
              >
                モックログイン
              </v-btn>
            </v-card-actions>
          </v-card>
        </template>

        <!-- 本番モード: Amplify Authenticator -->
        <template v-else>
          <Authenticator :hide-sign-up="true">
            <template #default>
              <PostSignInRedirect />
            </template>
          </Authenticator>
        </template>

      </v-col>
    </v-row>
  </v-container>
</template>
