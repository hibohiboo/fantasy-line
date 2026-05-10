import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import 'vuetify/styles'

import App from './App.vue'
import router from './router'

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
  if (import.meta.env.VITE_USE_MOCK === 'true') {
    const { worker } = await import('./mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass' })
  }

  const app = createApp(App)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(createPinia() as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(router as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use(vuetify as any)
  app.mount('#app')
}

bootstrap()
