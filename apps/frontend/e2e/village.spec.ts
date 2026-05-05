import { test, expect, type Page } from '@playwright/test'

type VillageMock = { id: number; name: string; ownerId: string; createdAt: string }

async function setupAuth(page: Page, userId = 'test-user-1'): Promise<void> {
  await page.addInitScript((id) => {
    localStorage.setItem('userId', id)
  }, userId)
}

function makeVillage(id: number, name: string, ownerId: string): VillageMock {
  return { id, name, ownerId, createdAt: new Date().toISOString() }
}

function mockVillagesApi(page: Page, villages: VillageMock[]): Promise<void> {
  let nextId = villages.length + 1
  return page.route('**/villages', async (route) => {
    if (route.request().method() === 'POST') {
      const body = await route.request().postDataJSON() as { name: string }
      const userId = route.request().headers()['x-user-id'] ?? 'test-user-1'
      const village = makeVillage(nextId++, body.name, userId)
      villages.push(village)
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ village }),
      })
    } else {
      const userId = route.request().headers()['x-user-id']
      const filtered = userId ? villages.filter((v) => v.ownerId === userId) : villages
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ villages: filtered }),
      })
    }
  })
}

test.describe('村を作成する', () => {
  test('Scenario 1: 正常に村を作成できる', async ({ page }) => {
    const villages: VillageMock[] = []
    await setupAuth(page)
    await mockVillagesApi(page, villages)

    await page.goto('/villages/new')
    await page.locator('input').fill('テスト村')
    await page.getByTestId('submit').click()

    await expect(page).toHaveURL('/villages')
    await expect(page.locator('.v-card-title').filter({ hasText: 'テスト村' })).toBeVisible()
  })

  test('Scenario 2: 同名の村を複数作成できる', async ({ page }) => {
    const villages: VillageMock[] = []
    await setupAuth(page)
    await mockVillagesApi(page, villages)

    await page.goto('/villages/new')
    await page.locator('input').fill('同名村')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/villages')

    await page.goto('/villages/new')
    await page.locator('input').fill('同名村')
    await page.getByTestId('submit').click()
    await expect(page).toHaveURL('/villages')

    await expect(page.locator('.v-card-title').filter({ hasText: '同名村' })).toHaveCount(2)
  })

  test('Scenario 3: 村名が空の場合は作成できない', async ({ page }) => {
    await setupAuth(page)
    await page.goto('/villages/new')
    await page.getByTestId('submit').click()

    await expect(page.getByText('村名を入力してください')).toBeVisible()
    await expect(page).toHaveURL('/villages/new')
  })

  test('Scenario 4: 村名が128文字を超える場合は作成できない', async ({ page }) => {
    await setupAuth(page)
    await page.goto('/villages/new')
    // fill() は maxlength を尊重するため evaluate で直接 value をセットして input イベントを発火する
    await page.locator('input').evaluate((el: HTMLInputElement, value) => {
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, 'あ'.repeat(129))
    await page.getByTestId('submit').click()

    await expect(page.getByText('128文字以内')).toBeVisible()
    await expect(page).toHaveURL('/villages/new')
  })

  test('Scenario 5 & 6: 自分の村のみ表示される', async ({ browser }) => {
    const allVillages: VillageMock[] = [
      makeVillage(1, 'ユーザーAの村', 'user-a'),
      makeVillage(2, 'ユーザーBの村', 'user-b'),
    ]

    const contextA = await browser.newContext({ baseURL: 'http://localhost:5173' })
    const contextB = await browser.newContext({ baseURL: 'http://localhost:5173' })

    try {
      const pageA = await contextA.newPage()
      const pageB = await contextB.newPage()

      await pageA.addInitScript(() => localStorage.setItem('userId', 'user-a'))
      await pageB.addInitScript(() => localStorage.setItem('userId', 'user-b'))

      await mockVillagesApi(pageA, [...allVillages])
      await mockVillagesApi(pageB, [...allVillages])

      await pageA.goto('/villages')
      await expect(pageA.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toBeVisible()
      await expect(pageA.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toHaveCount(0)

      await pageB.goto('/villages')
      await expect(pageB.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toBeVisible()
      await expect(pageB.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toHaveCount(0)
    } finally {
      await contextA.close()
      await contextB.close()
    }
  })
})
