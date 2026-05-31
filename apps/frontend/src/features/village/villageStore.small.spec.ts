import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useVillageStore } from './villageStore'
import type { VillageResponse } from '@repo/schema'

const mockVillage: VillageResponse = {
  id: 1,
  name: 'テスト村',
  ownerId: 'user-1',
  createdAt: '2026-05-05T00:00:00.000Z',
}

describe('useVillageStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  describe('fetchVillages', () => {
    it('GET /villages のレスポンスを villages ステートに反映する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ villages: [mockVillage] }),
      }))

      const store = useVillageStore()
      await store.fetchVillages()

      expect(store.villages).toEqual([mockVillage])
      expect(store.isLoading).toBe(false)
    })

    it('APIエラー時に error ステートを設定する', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }))

      const store = useVillageStore()
      await store.fetchVillages()

      expect(store.error).not.toBeNull()
      expect(store.villages).toEqual([])
    })
  })

  describe('createVillage', () => {
    it('POST /villages を呼び出し作成した村を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ village: mockVillage }),
      }))

      const store = useVillageStore()
      const result = await store.createVillage('テスト村')

      expect(result).toEqual(mockVillage)
    })

    it('APIエラー時に error ステートを設定し null を返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
      }))

      const store = useVillageStore()
      const result = await store.createVillage('テスト村')

      expect(result).toBeNull()
      expect(store.error).not.toBeNull()
    })
  })
})
