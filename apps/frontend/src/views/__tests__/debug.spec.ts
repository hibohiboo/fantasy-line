import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, getCurrentInstance } from 'vue'
import * as vueModule from 'vue'
import { createVuetify } from 'vuetify'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import VillageListView from '../VillageListView.vue'
import { useVillageStore } from '@/stores/village'

const vuetify = createVuetify()

function makeRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/villages/new', component: { template: '<div />' } },
    ],
  })
}

describe('debug VillageListView', () => {
  it('withDirectives trace', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        villages: [{ id: 1, name: 'テスト村', ownerId: 'u1', createdAt: '2026-05-05T00:00:00.000Z' }],
      }),
    })
    vi.stubGlobal('fetch', mockFetch)

    // Spy on withDirectives
    const origWithDirectives = vueModule.withDirectives
    const withDirectivesSpy = vi.spyOn(vueModule, 'withDirectives').mockImplementation((...args) => {
      const inst = getCurrentInstance()
      if (!inst) {
        console.error('withDirectives called outside render function! Stack:', new Error().stack?.split('\n').slice(1, 5).join('\n'))
      }
      return origWithDirectives(...args)
    })

    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(VillageListView, {
      global: { plugins: [vuetify, pinia, makeRouter()] },
    })
    await flushPromises()
    await nextTick()

    const store = useVillageStore()
    console.log('store.villages:', JSON.stringify(store.villages))
    console.log('wrapper text:', wrapper.text())

    withDirectivesSpy.mockRestore()

    expect(store.villages).toHaveLength(1)
    expect(wrapper.text()).toContain('テスト村')
  })
})
