import { test, expect, type Page } from '@playwright/test'

type VillageMock = { id: number; name: string; ownerId: string; createdAt: string }
type ResidentMock = {
  id: number
  name: string
  nameKana: string
  birthDate: string
  villageId: number
  villageName: string
  createdAt: string
}

async function setupAuth(page: Page, userId = 'test-user-1'): Promise<void> {
  await page.addInitScript((id) => {
    localStorage.setItem('userId', id)
  }, userId)
}

function makeVillage(id: number, name: string, ownerId: string): VillageMock {
  return { id, name, ownerId, createdAt: new Date().toISOString() }
}

function makeResident(
  id: number,
  name: string,
  nameKana: string,
  birthDate: string,
  village: VillageMock,
): ResidentMock {
  return {
    id,
    name,
    nameKana,
    birthDate,
    villageId: village.id,
    villageName: village.name,
    createdAt: new Date().toISOString(),
  }
}

type MockDb = {
  villages: VillageMock[]
  residents: ResidentMock[]
  nextResidentId: number
}

async function setupMocks(page: Page, db: MockDb): Promise<void> {
  await page.route('**/api/villages', async (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      const body = (await route.request().postDataJSON()) as { name: string }
      const userId = route.request().headers()['x-user-id'] ?? 'test-user-1'
      const village = makeVillage(db.villages.length + 1, body.name, userId)
      db.villages.push(village)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ village }),
      })
    } else {
      const userId = route.request().headers()['x-user-id']
      const filtered = userId ? db.villages.filter((v) => v.ownerId === userId) : db.villages
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ villages: filtered }),
      })
    }
  })

  await page.route('**/api/residents', async (route) => {
    const method = route.request().method()
    if (method === 'POST') {
      const body = (await route.request().postDataJSON()) as {
        name: string
        nameKana: string
        birthDate: string
        villageId: number
      }
      const userId = route.request().headers()['x-user-id'] ?? 'test-user-1'
      const village = db.villages.find((v) => v.id === body.villageId)
      if (!village || village.ownerId !== userId) {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Forbidden' }),
        })
        return
      }
      const resident = makeResident(db.nextResidentId++, body.name, body.nameKana, body.birthDate, village)
      db.residents.push(resident)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ resident }),
      })
    } else {
      const userId = route.request().headers()['x-user-id']
      const ownedVillageIds = new Set(
        db.villages.filter((v) => v.ownerId === userId).map((v) => v.id),
      )
      const residents = db.residents
        .filter((r) => ownedVillageIds.has(r.villageId))
        .sort((a, b) => a.nameKana.localeCompare(b.nameKana))
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ residents }),
      })
    }
  })
}

async function fillResidentForm(
  page: Page,
  data: { name?: string; nameKana?: string; birthDate?: string },
): Promise<void> {
  if (data.name !== undefined) {
    await page.getByTestId('name').locator('input').fill(data.name)
  }
  if (data.nameKana !== undefined) {
    await page.getByTestId('nameKana').locator('input').fill(data.nameKana)
  }
  if (data.birthDate !== undefined) {
    await page.getByTestId('birthDate').locator('input').fill(data.birthDate)
  }
}

test.describe('住人を登録する', () => {
  test('Scenario 1: 正常に住人を登録できる', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    await fillResidentForm(page, { name: '山田太郎', nameKana: 'ヤマダタロウ', birthDate: '2000-01-15' })

    // 所属村を選択する
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()

    await page.getByTestId('submit').click()

    await expect(page).toHaveURL('/residents')
    await expect(page.locator('td').filter({ hasText: '山田太郎' })).toBeVisible()
  })

  test('Scenario 2: 同じ村に同名の住人を複数登録できる', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    // 1回目の登録
    await page.goto('/residents/new')
    await fillResidentForm(page, { name: '山田太郎', nameKana: 'ヤマダタロウ', birthDate: '2000-01-15' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/residents')

    // 2回目の登録（同名）
    await page.goto('/residents/new')
    await fillResidentForm(page, { name: '山田太郎', nameKana: 'ヤマダタロウ', birthDate: '2001-06-20' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/residents')

    // 一覧に2件表示される
    await expect(page.locator('td').filter({ hasText: '山田太郎' })).toHaveCount(2)
  })

  test('Scenario 3: 住人一覧は読みの昇順で表示される', async ({ page }) => {
    const village = makeVillage(1, 'テスト村', 'test-user-1')
    const db: MockDb = {
      villages: [village],
      residents: [
        makeResident(1, '田中花子', 'タナカハナコ', '1995-03-10', village),
        makeResident(2, '山田太郎', 'ヤマダタロウ', '2000-01-15', village),
        makeResident(3, '鈴木一郎', 'スズキイチロウ', '1988-07-22', village),
      ],
      nextResidentId: 4,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents')

    // nameKana 昇順: スズキイチロウ → タナカハナコ → ヤマダタロウ
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).locator('td').nth(1)).toHaveText('スズキイチロウ')
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('タナカハナコ')
    await expect(rows.nth(2).locator('td').nth(1)).toHaveText('ヤマダタロウ')
  })

  test('Scenario 4: 住人名が空の場合は登録できない', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    // 名前を空のまま他のフィールドを入力して送信
    await fillResidentForm(page, { nameKana: 'ヤマダタロウ', birthDate: '2000-01-15' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()

    await expect(page.getByText('名前は必須です')).toBeVisible()
    await expect(page).toHaveURL('/residents/new')
  })

  test('Scenario 5: 住人名は128文字を超えて入力できない', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    // maxlength="128" によりブラウザが129文字目をブロックすることを確認
    await page.getByTestId('name').locator('input').fill('あ'.repeat(130))
    const value = await page.getByTestId('name').locator('input').inputValue()
    expect(value.length).toBeLessThanOrEqual(128)
  })

  test('Scenario 6: 読みが空の場合は登録できない', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    // 読みを空のまま他のフィールドを入力して送信
    await fillResidentForm(page, { name: '山田太郎', birthDate: '2000-01-15' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()

    await expect(page.getByText('読みは必須です')).toBeVisible()
    await expect(page).toHaveURL('/residents/new')
  })

  test('Scenario 7: 読みにカタカナ以外の文字が含まれる場合は登録できない', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    await fillResidentForm(page, { name: '山田太郎', nameKana: 'たろう', birthDate: '2000-01-15' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()

    await expect(page.getByText('読みはカタカナで入力してください')).toBeVisible()
    await expect(page).toHaveURL('/residents/new')
  })

  test('Scenario 8: 生年月日が未入力の場合は登録できない', async ({ page }) => {
    const db: MockDb = {
      villages: [makeVillage(1, 'テスト村', 'test-user-1')],
      residents: [],
      nextResidentId: 1,
    }
    await setupAuth(page)
    await setupMocks(page, db)

    await page.goto('/residents/new')
    // 生年月日を空のまま他のフィールドを入力して送信
    await fillResidentForm(page, { name: '山田太郎', nameKana: 'ヤマダタロウ' })
    await page.getByTestId('villageId').click()
    await page.getByRole('option', { name: 'テスト村' }).click()
    await page.getByTestId('submit').click()

    await expect(page.getByText('生年月日は必須です')).toBeVisible()
    await expect(page).toHaveURL('/residents/new')
  })

  test('Scenario 10: 住人一覧には自分の村の住人のみ表示される', async ({ page }) => {
    const villageA = makeVillage(1, 'ユーザーAの村', 'user-a')
    const villageB = makeVillage(2, 'ユーザーBの村', 'user-b')
    const db: MockDb = {
      villages: [villageA, villageB],
      residents: [
        makeResident(1, 'Aの住人', 'エーノジュウニン', '2000-01-01', villageA),
        makeResident(2, 'Bの住人', 'ビーノジュウニン', '2000-01-01', villageB),
      ],
      nextResidentId: 3,
    }

    await page.route('**/api/villages', async (route) => {
      const userId = route.request().headers()['x-user-id']
      const filtered = userId ? db.villages.filter((v) => v.ownerId === userId) : db.villages
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ villages: filtered }),
      })
    })

    await page.route('**/api/residents', async (route) => {
      const userId = route.request().headers()['x-user-id']
      const ownedVillageIds = new Set(
        db.villages.filter((v) => v.ownerId === userId).map((v) => v.id),
      )
      const residents = db.residents
        .filter((r) => ownedVillageIds.has(r.villageId))
        .sort((a, b) => a.nameKana.localeCompare(b.nameKana))
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ residents }),
      })
    })

    // User A: まず / に遷移して origin を確立してから localStorage をセット
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('userId', 'user-a'))
    await page.goto('/residents')
    await expect(page.locator('td').filter({ hasText: 'Aの住人' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: 'Bの住人' })).toHaveCount(0)

    // User B: localStorage を書き換えて再ナビゲート
    await page.evaluate(() => localStorage.setItem('userId', 'user-b'))
    await page.goto('/residents')
    await expect(page.locator('td').filter({ hasText: 'Bの住人' })).toBeVisible()
    await expect(page.locator('td').filter({ hasText: 'Aの住人' })).toHaveCount(0)
  })
})
