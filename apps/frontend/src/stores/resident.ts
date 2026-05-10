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
      const { residents: data } = await apiFetch<{ residents: ResidentWithVillageResponse[] }>('/api/residents')
      residents.value = data
    })
  }

  async function fetchVillageResidents(villageId: number): Promise<void> {
    await withLoading(async () => {
      const { residents: data } = await apiFetch<{ residents: ResidentResponse[] }>(`/api/villages/${villageId}/residents`)
      villageResidents.value = data
    })
  }

  async function createResident(input: CreateResidentInput): Promise<ResidentResponse | null> {
    return withLoading(async () => {
      const { resident } = await apiFetch<{ resident: ResidentResponse }>('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return resident
    })
  }

  return { residents, villageResidents, isLoading, error, fetchResidents, fetchVillageResidents, createResident }
})
