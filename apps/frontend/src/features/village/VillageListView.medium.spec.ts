import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createVuetify } from 'vuetify'
import { createTestingPinia } from '@pinia/testing'
import VillageListView from './VillageListView.vue'
import { makeRouter } from '@/test-utils/makeRouter'
import type { VillageResponse } from '@repo/schema'

const vuetify = createVuetify()

const mockVillages: VillageResponse[] = [
  { id: 1, name: 'エルムの村', ownerId: 'user-1', createdAt: '2026-05-05T00:00:00.000Z' },
  { id: 2, name: 'オークの村', ownerId: 'user-1', createdAt: '2026-05-04T00:00:00.000Z' },
]

function mountView(initialVillageState: object = {}) {
  return mount(VillageListView, {
    global: {
      plugins: [
        vuetify,
        createTestingPinia({
          initialState: {
            village: { villages: [], isLoading: false, error: null, ...initialVillageState },
          },
          stubActions: true,
          createSpy: vi.fn,
        }),
        makeRouter(),
      ],
    },
  })
}

describe('VillageListView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('「村を作成する」ボタンが表示される', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('村を作成する')
  })

  it('ローディング中はプログレスサークルを表示する', async () => {
    const wrapper = mountView({ isLoading: true })
    await nextTick()
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)
  })

  it('村が 0 件のとき空状態メッセージを表示する', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('村がありません')
  })

  it('村一覧を VillageCard で表示する', async () => {
    const wrapper = mountView({ villages: mockVillages })
    await nextTick()
    expect(wrapper.text()).toContain('エルムの村')
    expect(wrapper.text()).toContain('オークの村')
  })

  it('読み込み失敗時にエラーメッセージを表示する', async () => {
    const wrapper = mountView({ error: 'サーバーエラー: 500' })
    await nextTick()
    expect(wrapper.text()).toContain('村一覧の取得に失敗しました')
  })
})
