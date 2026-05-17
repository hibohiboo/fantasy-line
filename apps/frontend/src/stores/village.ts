import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { VillageResponse, ListVillagesResponse, CreateVillageResponse } from '@repo/schema'
import { useApiState } from '../composables/useApiState'

export const useVillageStore = defineStore('village', () => {
  const villages = ref<VillageResponse[]>([])
  const { isLoading, error, apiFetch, withLoading } = useApiState()

  async function fetchVillages(): Promise<void> {
    await withLoading(async () => {
      const { villages: data } = await apiFetch<ListVillagesResponse>('/api/villages')
      villages.value = data
    })
  }

  async function createVillage(name: string): Promise<VillageResponse | null> {
    return withLoading(async () => {
      const { village } = await apiFetch<CreateVillageResponse>('/api/villages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      return village
    })
  }

  return { villages, isLoading, error, fetchVillages, createVillage }
})
