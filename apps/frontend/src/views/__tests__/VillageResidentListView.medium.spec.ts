import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createWebHistory } from 'vue-router'
import VillageResidentListView from '../VillageResidentListView.vue'
import type { ResidentResponse } from '@repo/schema'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/villages/:id/residents', component: { template: '<div />' } },
    ],
  })
}

const mockResidents: ResidentResponse[] = [
  {
    id: 1,
    name: '田中太郎',
    nameKana: 'タナカタロウ',
    birthDate: '2000-01-15',
    villageId: 1,
    createdAt: '2026-05-05T00:00:00.000Z',
  },
  {
    id: 2,
    name: '鈴木花子',
    nameKana: 'スズキハナコ',
    birthDate: '1995-06-20',
    villageId: 1,
    createdAt: '2026-05-04T00:00:00.000Z',
  },
]

function mountView(initialResidentState: object = {}) {
  return mount(VillageResidentListView, {
    global: {
      plugins: [
        vuetify,
        createTestingPinia({
          initialState: {
            resident: { villageResidents: [], isLoading: false, error: null, ...initialResidentState },
          },
          stubActions: true,
          createSpy: vi.fn,
        }),
        makeRouter(),
      ],
    },
  })
}

describe('VillageResidentListView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('住人一覧が表示される（villageName 列なし）', async () => {
    const wrapper = mountView({ villageResidents: mockResidents })
    await nextTick()
    expect(wrapper.text()).toContain('田中太郎')
    expect(wrapper.text()).toContain('タナカタロウ')
    expect(wrapper.text()).not.toContain('所属村')
  })

  it('ローディング中はプログレスサークルを表示する', async () => {
    const wrapper = mountView({ isLoading: true })
    await nextTick()
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('住人が 0 件のとき空状態メッセージを表示する', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('住人が登録されていません。追加してください')
  })
})
