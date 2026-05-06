import { http, HttpResponse } from 'msw'
import type { VillageResponse } from '@repo/schema'

let nextId = 3
const db: VillageResponse[] = [
  { id: 1, name: 'サンプルの村', ownerId: 'mock-user-1', createdAt: '2026-05-01T00:00:00.000Z' },
  { id: 2, name: 'テストの里', ownerId: 'mock-user-1', createdAt: '2026-05-02T00:00:00.000Z' },
]

export const handlers = [
  http.get('/api/villages', ({ request }) => {
    const ownerId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    return HttpResponse.json({ villages: db.filter(v => v.ownerId === ownerId) })
  }),

  http.post('/api/villages', async ({ request }) => {
    const ownerId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')
    const { name } = await request.json() as { name: string }
    const village: VillageResponse = { id: nextId++, name, ownerId, createdAt: new Date().toISOString() }
    db.push(village)
    return HttpResponse.json({ village }, { status: 201 })
  }),
]
