<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { useAuthStore } from './features/auth/useAuthStore'

const router = useRouter()
const authStore = useAuthStore()

async function handleLogout(): Promise<void> {
  await authStore.logout()
  // replace でナビゲーションスタックから保護ページを除去し、
  // ブラウザバックで保護ページに戻れないようにする
  await router.replace({ name: 'login' })
}
</script>

<template>
  <v-app>
    <v-app-bar color="primary" flat elevation="1">
      <v-app-bar-title>
        <router-link to="/" class="text-white text-decoration-none text-title-large">
          ファンタジーライン
        </router-link>
      </v-app-bar-title>
      <template #append>
        <template v-if="authStore.user">
          <v-btn to="/villages" variant="text" color="white">
            村一覧
          </v-btn>
          <v-btn to="/residents" variant="text" color="white">
            住人一覧
          </v-btn>
          <v-btn variant="text" color="white" @click="handleLogout">
            ログアウト
          </v-btn>
        </template>
      </template>
    </v-app-bar>
    <v-main>
      <RouterView />
    </v-main>
  </v-app>
</template>
