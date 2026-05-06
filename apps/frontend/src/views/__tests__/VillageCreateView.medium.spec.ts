import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VillageCreateView from '../VillageCreateView.vue'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/villages', component: { template: '<div />' } },
    ],
  })
}

function mountView(router = makeRouter()) {
  return mount(VillageCreateView, {
    global: { plugins: [vuetify, createPinia(), router] },
  })
}

describe('VillageCreateView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('フォームが表示される', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('村を作成する')
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.text()).toContain('作成する')
    expect(wrapper.text()).toContain('キャンセル')
  })

  it('空文字で送信するとバリデーションエラーが表示され遷移しない', async () => {
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('村名を入力してください')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('129文字で送信するとバリデーションエラーが表示され遷移しない', async () => {
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('input').setValue('あ'.repeat(129))
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('128文字以内')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('正常送信後に /villages へリダイレクトする', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        village: { id: 1, name: 'テスト村', ownerId: 'user-1', createdAt: '2026-05-05T00:00:00.000Z' },
      }),
    }))
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('input').setValue('テスト村')
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/villages')
  })
})
