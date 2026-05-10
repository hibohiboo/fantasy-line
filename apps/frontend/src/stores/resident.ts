import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ResidentWithVillageResponse, ResidentResponse, CreateResidentInput } from '@repo/schema'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function userHeaders(): Record<string, string> {
  return { 'X-User-Id': encodeURIComponent(localStorage.getItem('userId') ?? 'mock-user-1') }
}

export const useResidentStore = defineStore('resident', () => {
  const residents = ref<ResidentWithVillageResponse[]>([])
  const villageResidents = ref<ResidentResponse[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchResidents(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/residents`, {
        headers: userHeaders(),
      })
      if (!res.ok) {
        error.value = `サーバーエラー: ${res.status}`
        return
      }
      const data = await res.json()
      residents.value = data.residents
    } catch (e) {
      console.error(e)
      error.value = '通信エラーが発生しました'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchVillageResidents(villageId: number): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/villages/${villageId}/residents`, {
        headers: userHeaders(),
      })
      if (!res.ok) {
        error.value = `サーバーエラー: ${res.status}`
        return
      }
      const data = await res.json()
      villageResidents.value = data.residents
    } catch (e) {
      console.error(e)
      error.value = '通信エラーが発生しました'
    } finally {
      isLoading.value = false
    }
  }

  async function createResident(input: CreateResidentInput): Promise<ResidentResponse | null> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/api/residents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...userHeaders(),
        },
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        error.value = `サーバーエラー: ${res.status}`
        return null
      }
      const data = await res.json()
      return data.resident
    } catch {
      error.value = '通信エラーが発生しました'
      return null
    } finally {
      isLoading.value = false
    }
  }

  return { residents, villageResidents, isLoading, error, fetchResidents, fetchVillageResidents, createResident }
})
