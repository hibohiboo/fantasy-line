import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { createTestingPinia } from '@pinia/testing'
import ResidentListView from './ResidentListView.vue'
import { makeRouter } from '@/test-utils/makeRouter'
import type { ResidentWithVillageResponse } from '@repo/schema'

const vuetify = createVuetify()

const RESIDENT_ROUTES = [
  { path: '/', component: { template: '<div />' } },
  { path: '/residents/new', component: { template: '<div />' } },
]

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

function mountView(initialResidentState: object = {}) {
  return mount(ResidentListView, {
    global: {
      plugins: [
        vuetify,
        createTestingPinia({
          initialState: {
            resident: { residents: [], isLoading: false, error: null, ...initialResidentState },
          },
          stubActions: true,
          createSpy: vi.fn,
        }),
        makeRouter(RESIDENT_ROUTES),
      ],
    },
  })
}

describe('ResidentListView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('住人一覧が表示される（名前・読み・所属村名の列あり）', async () => {
    const wrapper = mountView({ residents: mockResidents })
    await nextTick()
    expect(wrapper.text()).toContain('田中太郎')
    expect(wrapper.text()).toContain('タナカタロウ')
    expect(wrapper.text()).toContain('エルムの村')
  })

  it('「住人を追加」ボタンが存在する', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('住人を追加')
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
