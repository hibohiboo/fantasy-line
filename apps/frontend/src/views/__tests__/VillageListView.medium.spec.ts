import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VillageListView from '../VillageListView.vue'
import type { VillageResponse } from '@repo/schema'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
}

const mockVillages: VillageResponse[] = [
  { id: 1, name: 'エルムの村', ownerId: 'user-1', createdAt: '2026-05-05T00:00:00.000Z' },
  { id: 2, name: 'オークの村', ownerId: 'user-1', createdAt: '2026-05-04T00:00:00.000Z' },
]

function mountView() {
  return mount(VillageListView, {
    global: {
      plugins: [vuetify, createPinia(), makeRouter()],
    },
  })
}

describe('VillageListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('「村を作成する」ボタンが表示される', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ villages: [] }),
    }))
    const wrapper = mountView()
    expect(wrapper.text()).toContain('村を作成する')
  })

  it('ローディング中はプログレスサークルを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const wrapper = mountView()
    await nextTick()
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('村が 0 件のとき空状態メッセージを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ villages: [] }),
    }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('村がありません')
  })

  it('村一覧を VillageCard で表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ villages: mockVillages }),
    }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('エルムの村')
    expect(wrapper.text()).toContain('オークの村')
  })

  it('読み込み失敗時にエラーメッセージを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('村一覧の取得に失敗しました')
  })
})
