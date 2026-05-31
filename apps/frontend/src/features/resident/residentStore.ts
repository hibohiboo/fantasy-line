import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  ResidentWithVillageResponse,
  ResidentResponse,
  CreateResidentInput,
  ListResidentsResponse,
  ListVillageResidentsResponse,
  CreateResidentResponse,
} from '@repo/schema'
import { useApiState } from '@/shared/lib/useApiState'

export const useResidentStore = defineStore('resident', () => {
  const residents = ref<ResidentWithVillageResponse[]>([])
  const villageResidents = ref<ResidentResponse[]>([])
  const { isLoading, error, apiFetch, withLoading } = useApiState()

  async function fetchResidents(): Promise<void> {
    await withLoading(async () => {
      const { residents: data } = await apiFetch<ListResidentsResponse>('/api/residents')
      residents.value = data
    })
  }

  async function fetchVillageResidents(villageId: number): Promise<void> {
    await withLoading(async () => {
      const { residents: data } = await apiFetch<ListVillageResidentsResponse>(`/api/villages/${villageId}/residents`)
      villageResidents.value = data
    })
  }

  async function createResident(input: CreateResidentInput): Promise<ResidentResponse | null> {
    return withLoading(async () => {
      const { resident } = await apiFetch<CreateResidentResponse>('/api/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      return resident
    })
  }

  return { residents, villageResidents, isLoading, error, fetchResidents, fetchVillageResidents, createResident }
})
