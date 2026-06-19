import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'

import App from './App.vue'
import router from './router'
import { setAuthService } from './features/auth/useAuthStore'
import { useAuthStore } from './features/auth/useAuthStore'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary:    '#4a7c59',
          secondary:  '#c9963d',
          error:      '#a63228',
          success:    '#2d6e3e',
          warning:    '#8a6020',
          background: '#f5f0e8',
          surface:    '#fffdf7',
        },
      },
      dark: {
        colors: {
          primary:    '#4a7c59',
          secondary:  '#c9963d',
          error:      '#a63228',
          success:    '#2d6e3e',
          warning:    '#8a6020',
          background: '#1c1a14',
          surface:    '#2a2720',
        },
      },
    },
  },
})

async function bootstrap() {
  // 1. MSW（dev:mock モード用 API スタブ）
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  // 2. authService DI（VITE_USE_MOCK で切り替え）
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { createAuthService } = await import('./features/auth/authService.mock')
    setAuthService(createAuthService())
  } else {
    const { createAuthService } = await import('./features/auth/authService.amplify')
    setAuthService(createAuthService())

    // 3. Amplify 初期化（本番のみ）
    const { Amplify } = await import('aws-amplify')
    const { I18n } = await import('aws-amplify/utils')
    const { translations } = await import('./features/auth/i18n')
    Amplify.configure({
      Auth: {
        Cognito: {
          userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID as string,
          userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
        },
      },
    })
    I18n.putVocabularies(translations)
    I18n.setLanguage('ja')
  }

  // 4. Vue アプリ起動
  const app = createApp(App)
  const pinia = createPinia()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(pinia as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(router as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(vuetify as any)

  // 5. セッション復元（ルートガードが動く前に必要）
  const authStore = useAuthStore()
  await authStore.restoreSession()
  await router.isReady()

  app.mount('#app')
}

bootstrap()
