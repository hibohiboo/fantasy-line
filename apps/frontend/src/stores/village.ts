import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { VillageResponse } from '@repo/schema'
import { useApiState } from '../composables/useApiState'

export const useVillageStore = defineStore('village', () => {
  const villages = ref<VillageResponse[]>([])
  const { isLoading, error, apiFetch, withLoading } = useApiState()

  async function fetchVillages(): Promise<void> {
    await withLoading(async () => {
      const res = await apiFetch('/api/villages')
      villages.value = (await res.json()).villages
    })
  }

  async function createVillage(name: string): Promise<VillageResponse | null> {
    return withLoading(async () => {
      const res = await apiFetch('/api/villages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      return (await res.json()).village as VillageResponse
    })
  }

  return { villages, isLoading, error, fetchVillages, createVillage }
})
