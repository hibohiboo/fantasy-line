import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import VillageCard from '../VillageCard.vue'
import type { VillageResponse } from '@repo/schema'

const vuetify = createVuetify()

const mockVillage: VillageResponse = {
  id: 1,
  name: 'エルムの村',
  ownerId: 'user-1',
  createdAt: '2026-05-05T00:00:00.000Z',
}

function mountCard() {
  return mount(VillageCard, {
    props: { village: mockVillage },
    global: { plugins: [vuetify] },
  })
}

describe('VillageCard', () => {
  it('村名を表示する', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('エルムの村')
  })

  it('作成日を表示する', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('2026')
  })
})
