# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: village.spec.ts >> 村を作成する >> Scenario 4: 村名が128文字を超える場合は作成できない
- Location: e2e\village.spec.ts:80:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('128文字以内')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('128文字以内')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - img "Vue logo" [ref=e4]
      - generic [ref=e5]:
        - generic [ref=e6]:
          - heading "You did it!" [level=1] [ref=e7]
          - heading "You’ve successfully created a project with Vite + Vue 3. What's next?" [level=3] [ref=e8]:
            - text: You’ve successfully created a project with
            - link "Vite" [ref=e9] [cursor=pointer]:
              - /url: https://vite.dev/
            - text: +
            - link "Vue 3" [ref=e10] [cursor=pointer]:
              - /url: https://vuejs.org/
            - text: . What's next?
        - navigation [ref=e11]:
          - link "Home" [ref=e12] [cursor=pointer]:
            - /url: /
          - link "About" [ref=e13] [cursor=pointer]:
            - /url: /about
    - generic [ref=e14]:
      - heading "村を作成する" [level=1] [ref=e15]
      - generic [ref=e16]:
        - generic [ref=e17]:
          - generic [ref=e20]:
            - generic: 村名
            - textbox "村名" [ref=e21]: ああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああああ
          - alert [ref=e22]
        - generic [ref=e24]:
          - button "キャンセル" [ref=e26] [cursor=pointer]:
            - generic [ref=e27]: キャンセル
          - button "作成する" [active] [ref=e29] [cursor=pointer]:
            - generic [ref=e30]: 作成する
      - alert [ref=e31]:
        - generic [ref=e34]: "サーバーエラー: 404"
  - generic [ref=e35]:
    - generic "Toggle devtools panel" [ref=e36] [cursor=pointer]:
      - img [ref=e37]
    - generic "Toggle Component Inspector" [ref=e42] [cursor=pointer]:
      - img [ref=e43]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | type VillageMock = { id: number; name: string; ownerId: string; createdAt: string }
  4   | 
  5   | async function setupAuth(page: Page, userId = 'test-user-1'): Promise<void> {
  6   |   await page.addInitScript((id) => {
  7   |     localStorage.setItem('userId', id)
  8   |   }, userId)
  9   | }
  10  | 
  11  | function makeVillage(id: number, name: string, ownerId: string): VillageMock {
  12  |   return { id, name, ownerId, createdAt: new Date().toISOString() }
  13  | }
  14  | 
  15  | function mockVillagesApi(page: Page, villages: VillageMock[]): Promise<void> {
  16  |   let nextId = villages.length + 1
  17  |   return page.route('**/villages', async (route) => {
  18  |     if (route.request().method() === 'POST') {
  19  |       const body = await route.request().postDataJSON() as { name: string }
  20  |       const userId = route.request().headers()['x-user-id'] ?? 'test-user-1'
  21  |       const village = makeVillage(nextId++, body.name, userId)
  22  |       villages.push(village)
  23  |       await route.fulfill({
  24  |         status: 201,
  25  |         contentType: 'application/json',
  26  |         body: JSON.stringify({ village }),
  27  |       })
  28  |     } else {
  29  |       const userId = route.request().headers()['x-user-id']
  30  |       const filtered = userId ? villages.filter((v) => v.ownerId === userId) : villages
  31  |       await route.fulfill({
  32  |         contentType: 'application/json',
  33  |         body: JSON.stringify({ villages: filtered }),
  34  |       })
  35  |     }
  36  |   })
  37  | }
  38  | 
  39  | test.describe('村を作成する', () => {
  40  |   test('Scenario 1: 正常に村を作成できる', async ({ page }) => {
  41  |     const villages: VillageMock[] = []
  42  |     await setupAuth(page)
  43  |     await mockVillagesApi(page, villages)
  44  | 
  45  |     await page.goto('/villages/new')
  46  |     await page.locator('input').fill('テスト村')
  47  |     await page.getByTestId('submit').click()
  48  | 
  49  |     await expect(page).toHaveURL('/villages')
  50  |     await expect(page.locator('.v-card-title').filter({ hasText: 'テスト村' })).toBeVisible()
  51  |   })
  52  | 
  53  |   test('Scenario 2: 同名の村を複数作成できる', async ({ page }) => {
  54  |     const villages: VillageMock[] = []
  55  |     await setupAuth(page)
  56  |     await mockVillagesApi(page, villages)
  57  | 
  58  |     await page.goto('/villages/new')
  59  |     await page.locator('input').fill('同名村')
  60  |     await page.getByTestId('submit').click()
  61  |     await expect(page).toHaveURL('/villages')
  62  | 
  63  |     await page.goto('/villages/new')
  64  |     await page.locator('input').fill('同名村')
  65  |     await page.getByTestId('submit').click()
  66  |     await expect(page).toHaveURL('/villages')
  67  | 
  68  |     await expect(page.locator('.v-card-title').filter({ hasText: '同名村' })).toHaveCount(2)
  69  |   })
  70  | 
  71  |   test('Scenario 3: 村名が空の場合は作成できない', async ({ page }) => {
  72  |     await setupAuth(page)
  73  |     await page.goto('/villages/new')
  74  |     await page.getByTestId('submit').click()
  75  | 
  76  |     await expect(page.getByText('村名を入力してください')).toBeVisible()
  77  |     await expect(page).toHaveURL('/villages/new')
  78  |   })
  79  | 
  80  |   test('Scenario 4: 村名が128文字を超える場合は作成できない', async ({ page }) => {
  81  |     await setupAuth(page)
  82  |     await page.goto('/villages/new')
  83  |     await page.locator('input').fill('あ'.repeat(129))
  84  |     await page.getByTestId('submit').click()
  85  | 
> 86  |     await expect(page.getByText('128文字以内')).toBeVisible()
      |                                             ^ Error: expect(locator).toBeVisible() failed
  87  |     await expect(page).toHaveURL('/villages/new')
  88  |   })
  89  | 
  90  |   test('Scenario 5 & 6: 自分の村のみ表示される', async ({ browser }) => {
  91  |     const allVillages: VillageMock[] = [
  92  |       makeVillage(1, 'ユーザーAの村', 'user-a'),
  93  |       makeVillage(2, 'ユーザーBの村', 'user-b'),
  94  |     ]
  95  | 
  96  |     const contextA = await browser.newContext()
  97  |     const contextB = await browser.newContext()
  98  | 
  99  |     try {
  100 |       const pageA = await contextA.newPage()
  101 |       const pageB = await contextB.newPage()
  102 | 
  103 |       await pageA.addInitScript(() => localStorage.setItem('userId', 'user-a'))
  104 |       await pageB.addInitScript(() => localStorage.setItem('userId', 'user-b'))
  105 | 
  106 |       await mockVillagesApi(pageA, [...allVillages])
  107 |       await mockVillagesApi(pageB, [...allVillages])
  108 | 
  109 |       await pageA.goto('/villages')
  110 |       await expect(pageA.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toBeVisible()
  111 |       await expect(pageA.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toHaveCount(0)
  112 | 
  113 |       await pageB.goto('/villages')
  114 |       await expect(pageB.locator('.v-card-title').filter({ hasText: 'ユーザーBの村' })).toBeVisible()
  115 |       await expect(pageB.locator('.v-card-title').filter({ hasText: 'ユーザーAの村' })).toHaveCount(0)
  116 |     } finally {
  117 |       await contextA.close()
  118 |       await contextB.close()
  119 |     }
  120 |   })
  121 | })
  122 | 
```