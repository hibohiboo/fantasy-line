import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useResidentStore } from '../resident'
import type {
  ResidentWithVillageResponse,
  ResidentResponse,
  CreateResidentInput,
} from '@repo/schema'

const mockResidentWithVillage: ResidentWithVillageResponse = {
  id: 1,
  name: '山田太郎',
  nameKana: 'ヤマダタロウ',
  birthDate: '2000-01-15',
  villageId: 1,
  createdAt: '2026-05-09T00:00:00.000Z',
  villageName: 'テスト村',
}

const mockResident: ResidentResponse = {
  id: 1,
  name: '山田太郎',
  nameKana: 'ヤマダタロウ',
  birthDate: '2000-01-15',
  villageId: 1,
  createdAt: '2026-05-09T00:00:00.000Z',
}

const mockCreateInput: CreateResidentInput = {
  name: '山田太郎',
  nameKana: 'ヤマダタロウ',
  birthDate: '2000-01-15',
  villageId: 1,
}

describe('useResidentStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  describe('fetchResidents', () => {
    it('GET /api/residents のレスポンスを residents ステートに反映する', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ residents: [mockResidentWithVillage] }),
        }),
      )

      const store = useResidentStore()
      await store.fetchResidents()

      expect(store.residents).toEqual([mockResidentWithVillage])
    })

    it('fetchResidents 完了後に isLoading が false になる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ residents: [] }),
        }),
      )

      const store = useResidentStore()
      await store.fetchResidents()

      expect(store.isLoading).toBe(false)
    })

    it('APIエラー時に error ステートを設定する', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      )

      const store = useResidentStore()
      await store.fetchResidents()

      expect(store.error).not.toBeNull()
      expect(store.residents).toEqual([])
    })
  })

  describe('fetchVillageResidents', () => {
    it('GET /api/villages/:id/residents のレスポンスを villageResidents ステートに反映する', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ residents: [mockResident] }),
        }),
      )

      const store = useResidentStore()
      await store.fetchVillageResidents(1)

      expect(store.villageResidents).toEqual([mockResident])
    })

    it('fetchVillageResidents は villageId を含む URL で API を呼ぶ', async () => {
      const mockFetch = vi.fn<() => Promise<{ ok: boolean; json: () => Promise<{ residents: ResidentResponse[] }> }>>().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ residents: [] }),
      })
      vi.stubGlobal('fetch', mockFetch)

      const store = useResidentStore()
      await store.fetchVillageResidents(42)

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/villages/42/residents'),
        expect.any(Object),
      )
    })

    it('fetchVillageResidents 完了後に isLoading が false になる', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ residents: [] }),
        }),
      )

      const store = useResidentStore()
      await store.fetchVillageResidents(1)

      expect(store.isLoading).toBe(false)
    })
  })

  describe('createResident', () => {
    it('POST /api/residents を呼び出し作成した住人を返す', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ resident: mockResident }),
        }),
      )

      const store = useResidentStore()
      const result = await store.createResident(mockCreateInput)

      expect(result).toEqual(mockResident)
    })

    it('APIエラー時に error ステートを設定し null を返す', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
        }),
      )

      const store = useResidentStore()
      const result = await store.createResident(mockCreateInput)

      expect(result).toBeNull()
      expect(store.error).not.toBeNull()
    })
  })
})
