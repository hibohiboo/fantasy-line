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

async function mockVillagesApi(page: Page, villages: VillageMock[]): Promise<void> {
  let nextId = villages.length + 1
  await page.route('**/villages', async (route) => {
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
    // maxlength="128" によりブラウザが128文字以上の入力をブロックすることを確認
    await page.locator('input').fill('あ'.repeat(130))
    const value = await page.locator('input').inputValue()
    expect(value.length).toBeLessThanOrEqual(128)
  })

  test('Scenario 5 & 6: 自分の村のみ表示される', async ({ page }) => {
    const allVillages: VillageMock[] = [
      makeVillage(1, 'ユーザーAの村', 'user-a'),
      makeVillage(2, 'ユーザーBの村', 'user-b'),
    ]

    await page.route('**/villages', async (route) => {
      const userId = route.request().headers()['x-user-id']
      const filtered = userId ? allVillages.filter((v) => v.ownerId === userId) : allVillages
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ villages: filtered }),
      })
    })

    // User A: addInitScript でページロード時に userId='user-a' をセット
    await setupAuth(page, 'user-a')
    await page.goto('/villages')
    await expect(page.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toBeVisible()
    await expect(page.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toHaveCount(0)

    // User B: 後から追加した addInitScript が user-a のスクリプトの後に実行され上書きされる
    await page.addInitScript(() => localStorage.setItem('userId', 'user-b'))
    await page.goto('/villages')
    await expect(page.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toBeVisible()
    await expect(page.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toHaveCount(0)
  })
})
