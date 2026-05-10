import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import { createTestingPinia } from '@pinia/testing'
import { createRouter, createWebHistory } from 'vue-router'
import ResidentCreateView from '../ResidentCreateView.vue'
import { useResidentStore } from '@/stores/resident'
import type { ResidentResponse } from '@repo/schema'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/residents', component: { template: '<div />' } },
      { path: '/residents/new', component: { template: '<div />' } },
    ],
  })
}

function mountView(router = makeRouter()) {
  return mount(ResidentCreateView, {
    global: {
      plugins: [
        vuetify,
        createTestingPinia({
          initialState: {
            resident: {},
            village: { villages: [{ id: 1, name: 'テストの村', ownerId: 'user-1', createdAt: '2026-05-01T00:00:00.000Z' }] },
          },
          stubActions: true,
          createSpy: vi.fn,
        }),
        router,
      ],
    },
    attachTo: document.body,
  })
}

describe('ResidentCreateView', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('フォームが表示される（名前・読み・生年月日・所属村ドロップダウン）', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('住人を登録する')
    expect(wrapper.text()).toContain('名前')
    expect(wrapper.text()).toContain('読み（カタカナ）')
    expect(wrapper.text()).toContain('生年月日')
    expect(wrapper.text()).toContain('所属村')
    expect(wrapper.text()).toContain('登録する')
    wrapper.unmount()
  })

  it.skip('名前が空で送信 → 「名前は必須です」が表示・遷移しない', async () => {
    // JSDOM + Vuetify VForm.validate() の制限により動作しない（PBI-017 で追跡中）
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('名前は必須です')
    expect(router.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })

  it.skip('読みが空で送信 → 「読みは必須です」が表示・遷移しない', async () => {
    // JSDOM + Vuetify VForm.validate() の制限により動作しない（PBI-017 で追跡中）
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('読みは必須です')
    expect(router.currentRoute.value.path).toBe('/')
    wrapper.unmount()
  })

  it.skip('読みにひらがな入力で送信 → 「読みはカタカナで入力してください」が表示', async () => {
    // JSDOM + Vuetify VForm.validate() の制限により動作しない（PBI-017 で追跡中）
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('[data-testid="name"]').setValue('テスト')
    await wrapper.find('[data-testid="nameKana"]').setValue('てすと')
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('読みはカタカナで入力してください')
    wrapper.unmount()
  })

  it.skip('生年月日が空で送信 → 「生年月日は必須です」が表示', async () => {
    // JSDOM + Vuetify VForm.validate() の制限により動作しない（PBI-017 で追跡中）
    const router = makeRouter()
    const wrapper = mountView(router)
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    await flushPromises()
    expect(wrapper.text()).toContain('生年月日は必須です')
    wrapper.unmount()
  })

  it.skip('正常送信後 → /residents にリダイレクト', async () => {
    // JSDOM + Vuetify VForm.validate() の制限により動作しない（PBI-017 で追跡中）
    const router = makeRouter()
    const wrapper = mountView(router)
    const store = useResidentStore()
    const mockResident: ResidentResponse = {
      id: 1,
      name: '田中太郎',
      nameKana: 'タナカタロウ',
      birthDate: '2000-01-15',
      villageId: 1,
      createdAt: '2026-05-05T00:00:00.000Z',
    }
    vi.spyOn(store, 'createResident').mockResolvedValue(mockResident)
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('田中太郎')
    await inputs[1].setValue('タナカタロウ')
    await inputs[2].setValue('2000-01-15')
    await wrapper.find('[data-testid="submit"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/residents')
    wrapper.unmount()
  })
})
