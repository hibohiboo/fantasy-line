import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { VillageResponse } from '@repo/schema'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function getUserId(): string {
  return localStorage.getItem('userId') ?? 'mock-user-1'
}

export const useVillageStore = defineStore('village', () => {
  const villages = ref<VillageResponse[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchVillages(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/villages`, {
        headers: { 'X-User-Id': getUserId() },
      })
      if (!res.ok) {
        error.value = `サーバーエラー: ${res.status}`
        return
      }
      const data = await res.json()
      villages.value = data.villages
    } catch {
      error.value = '通信エラーが発生しました'
    } finally {
      isLoading.value = false
    }
  }

  async function createVillage(name: string): Promise<VillageResponse | null> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch(`${API_BASE}/villages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': getUserId(),
        },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        error.value = `サーバーエラー: ${res.status}`
        return null
      }
      const data = await res.json()
      return data.village
    } catch {
      error.value = '通信エラーが発生しました'
      return null
    } finally {
      isLoading.value = false
    }
  }

  return { villages, isLoading, error, fetchVillages, createVillage }
})
