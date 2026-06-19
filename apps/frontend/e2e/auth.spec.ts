import { test, expect } from '@playwright/test'

/** mock モードでセッションをセットアップする（addInitScript 経由） */
async function setupMockSession(
  page: Parameters<Parameters<typeof test>[1]>[0],
  userType = 'tenant_user',
): Promise<void> {
  await page.addInitScript((type) => {
    localStorage.setItem('mock:userType', type)
  }, userType)
}

test.describe('認証機能（dev:mock モード）', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前にログアウト状態にする（localStorage をクリア）
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
  })

  test('未ログイン状態で /villages にアクセスすると /login にリダイレクトされること', async ({
    page,
  }) => {
    // Act
    await page.goto('/villages')

    // Assert
    await expect(page).toHaveURL('/login')
  })

  test('tenant_user でモックログインすると /villages にリダイレクトされること', async ({
    page,
  }) => {
    // Arrange: ログイン画面に移動
    await page.goto('/login')

    // Act: デフォルト (tenant_user) のままログイン
    // v-select で同じ値を再選択するとドロップダウンが閉じない場合があるため
    // ここでは v-select を操作せず、Escape でドロップダウン外クリック後にログイン
    await page.getByLabel('ユーザー種別').click({ force: true })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'モックログイン' }).click()

    // Assert
    await expect(page).toHaveURL('/villages')
  })

  test('tenant_admin でモックログインすると /villages にリダイレクトされること', async ({
    page,
  }) => {
    // Arrange
    await page.goto('/login')

    // Act: v-select で tenant_admin を選択
    // Vuetify v-select は内部 span がポインターイベントをインターセプトするため force: true を使用
    await page.getByLabel('ユーザー種別').click({ force: true })
    await page.getByRole('option', { name: /tenant_admin/ }).click()
    await page.getByRole('button', { name: 'モックログイン' }).click()

    // Assert
    await expect(page).toHaveURL('/villages')
  })

  test('servicer_admin でモックログインすると / にリダイレクトされること', async ({ page }) => {
    // Arrange
    await page.goto('/login')

    // Act
    await page.getByLabel('ユーザー種別').click({ force: true })
    await page.getByRole('option', { name: /servicer_admin/ }).click()
    await page.getByRole('button', { name: 'モックログイン' }).click()

    // Assert
    await expect(page).toHaveURL('/')
  })

  test('ログイン済み状態で /login にアクセスしてもリダイレクトされないこと（ログイン画面が表示されること）', async ({
    page,
  }) => {
    // Arrange: addInitScript でセッションをセットアップしてから /villages に直接アクセス
    await setupMockSession(page, 'tenant_user')
    await page.goto('/villages')
    await expect(page).toHaveURL('/villages')

    // Act: /login に直接アクセス（ガードは掛けていないので表示される）
    await page.goto('/login')

    // Assert
    await expect(page.getByRole('button', { name: 'モックログイン' })).toBeVisible()
  })
})
