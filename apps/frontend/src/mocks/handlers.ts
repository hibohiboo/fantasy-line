import { http, HttpResponse } from 'msw'
import type { VillageResponse, ResidentWithVillageResponse, ResidentResponse } from '@repo/schema'

let nextVillageId = 3
const villageDb: VillageResponse[] = [
  { id: 1, name: 'サンプルの村', ownerId: 'mock-user-1', createdAt: '2026-05-01T00:00:00.000Z' },
  { id: 2, name: 'テストの里', ownerId: 'mock-user-1', createdAt: '2026-05-02T00:00:00.000Z' },
]

let nextResidentId = 1
const residentDb: ResidentWithVillageResponse[] = []

export const handlers = [
  http.get('/api/villages', ({ request }) => {
    const ownerId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    return HttpResponse.json({ villages: villageDb.filter(v => v.ownerId === ownerId) })
  }),

  http.post('/api/villages', async ({ request }) => {
    const ownerId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    const { name } = await request.json() as { name: string }
    const village: VillageResponse = { id: nextVillageId++, name, ownerId, createdAt: new Date().toISOString() }
    villageDb.push(village)
    return HttpResponse.json({ village }, { status: 201 })
  }),

  http.get('/api/residents', ({ request }) => {
    const userId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    const ownedVillageIds = new Set(villageDb.filter(v => v.ownerId === userId).map(v => v.id))
    const residents = residentDb.filter(r => ownedVillageIds.has(r.villageId))
    return HttpResponse.json({ residents })
  }),

  http.post('/api/residents', async ({ request }) => {
    const userId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    const body = await request.json() as { name: string; nameKana: string; birthDate: string; villageId: number }
    const village = villageDb.find(v => v.id === body.villageId)
    if (!village || village.ownerId !== userId) {
      return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const resident: ResidentWithVillageResponse = {
      id: nextResidentId++,
      name: body.name,
      nameKana: body.nameKana,
      birthDate: body.birthDate,
      villageId: body.villageId,
      villageName: village.name,
      createdAt: new Date().toISOString(),
    }
    residentDb.push(resident)
    return HttpResponse.json({ resident }, { status: 201 })
  }),

  http.get('/api/villages/:id/residents', ({ request, params }) => {
    const userId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    const villageId = Number(params.id)
    const village = villageDb.find(v => v.id === villageId)
    if (!village || village.ownerId !== userId) {
      return HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const residents: ResidentResponse[] = residentDb
      .filter(r => r.villageId === villageId)
      .map(({ villageName: _villageName, ...r }) => r)
    return HttpResponse.json({ residents })
  }),
]
