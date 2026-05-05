import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { VillageResponse } from '@repo/schema'

export const useVillageStore = defineStore('village', () => {
  const villages = ref<VillageResponse[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchVillages(): Promise<void> {}

  async function createVillage(_name: string): Promise<VillageResponse | null> {
    return null
  }

  return { villages, isLoading, error, fetchVillages, createVillage }
})
