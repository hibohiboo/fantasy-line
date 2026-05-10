import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ResidentWithVillageResponse, ResidentResponse, CreateResidentInput } from '@repo/schema'
import { useApiState } from '../composables/useApiState'

export const useResidentStore = defineStore('resident', () => {
  const residents = ref<ResidentWithVillageResponse[]>([])
  const villageResidents = ref<ResidentResponse[]>([])
  const { isLoading, error, apiFetch, withLoading } = useApiState()

  async function fetchResidents(): Promise<void> {
    await withLoading(async () => {
      const res = await apiFetch('/api/residents')
      residents.value = (await res.json()).residents
    })
  }

  async function fetchVillageResidents(villageId: number): Promise<void> {
    await withLoading(async () => {
      const res = await apiFetch(`/api/villages/${villageId}/residents`)
      villageResidents.value = (await res.json()).residents
    })
  }

  async function createResident(input: CreateResidentInput): Promise<ResidentResponse | null> {
    return withLoading(async () => {
      const res = await apiFetch('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return (await res.json()).resident as ResidentResponse
    })
  }

  return { residents, villageResidents, isLoading, error, fetchResidents, fetchVillageResidents, createResident }
})
