import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import ResidentListView from '../ResidentListView.vue'
import type { ResidentWithVillageResponse } from '@repo/schema'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/residents/new', component: { template: '<div />' } },
    ],
  })
}

const mockResidents: ResidentWithVillageResponse[] = [
  {
    id: 1,
    name: '田中太郎',
    nameKana: 'タナカタロウ',
    birthDate: '2000-01-15',
    villageId: 1,
    villageName: 'エルムの村',
    createdAt: '2026-05-05T00:00:00.000Z',
  },
  {
    id: 2,
    name: '鈴木花子',
    nameKana: 'スズキハナコ',
    birthDate: '1995-06-20',
    villageId: 2,
    villageName: 'オークの村',
    createdAt: '2026-05-04T00:00:00.000Z',
  },
]

function mountView() {
  return mount(ResidentListView, {
    global: {
      plugins: [vuetify, createPinia(), makeRouter()],
    },
  })
}

describe('ResidentListView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('住人一覧が表示される（名前・読み・所属村名の列あり）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ residents: mockResidents }),
    }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('田中太郎')
    expect(wrapper.text()).toContain('タナカタロウ')
    expect(wrapper.text()).toContain('エルムの村')
  })

  it('「住人を追加」ボタンが存在する', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ residents: [] }),
    }))
    const wrapper = mountView()
    expect(wrapper.text()).toContain('住人を追加')
  })

  it('ローディング中はプログレスサークルを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
    const wrapper = mountView()
    await nextTick()
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('住人が 0 件のとき空状態メッセージを表示する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ residents: [] }),
    }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('住人が登録されていません。追加してください')
  })
})
