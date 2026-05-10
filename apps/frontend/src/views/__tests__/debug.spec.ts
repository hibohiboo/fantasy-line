import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, defineComponent, watch } from 'vue'

describe('minimal vue reactivity test', () => {
  it('basic ref with watch callback', async () => {
    const externalRef = ref<string[]>([])
    let watchCalled = false
    let watchValue: string[] = []

    const TestComponent = defineComponent({
      template: `<div><span v-if="items.length === 0">empty</span><span v-else>{{ items[0] }}</span></div>`,
      setup() {
        watch(externalRef, (newVal) => {
          watchCalled = true
          watchValue = newVal
          console.log('watch called, newVal:', JSON.stringify(newVal))
        })
        return { items: externalRef }
      },
    })

    const wrapper = mount(TestComponent)

    console.log('before:', wrapper.html())

    externalRef.value = ['hello']

    console.log('watchCalled after ref update (sync):', watchCalled)

    // Manually flush microtasks
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    console.log('watchCalled after microtasks:', watchCalled)
    console.log('wrapper.html() after microtasks:', wrapper.html())

    expect(watchCalled).toBe(true)
    expect(wrapper.text()).toBe('hello')
  })
})
