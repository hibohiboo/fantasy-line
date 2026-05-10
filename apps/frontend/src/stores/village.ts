import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { VillageResponse } from '@repo/schema'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? ''

function userHeaders(): Record<string, string> {
  return { 'X-User-Id': encodeURIComponent(localStorage.getItem('userId') ?? 'mock-user-1') }
}

export const useVillageStore = defineStore('village', () => {
  const villages = ref<VillageResponse[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${API_BASE}${url}`, {
      ...init,
      headers: { ...userHeaders(), ...(init?.headers as Record<string, string>) },
    })
    if (!res.ok) throw new Error(`サーバーエラー: ${res.status}`)
    return res
  }

  async function withLoading<T>(fn: () => Promise<T>): Promise<T | null> {
    isLoading.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      error.value = e instanceof Error ? e.message : '通信エラーが発生しました'
      return null
    } finally {
      isLoading.value = false
    }
  }

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
