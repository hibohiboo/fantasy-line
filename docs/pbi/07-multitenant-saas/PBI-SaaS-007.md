# PBI-SaaS-007 ユーザー管理画面（フロントエンド）実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a `tenant_admin`  
I want SaaS アプリ内のユーザー管理画面からテナントメンバーを管理したい  
So that Cognito コンソールを使わずに、テナント内のユーザー招待・削除・ロール変更が操作できる

---

## 背景 / 目的

[tenant-provisioning.md](../../design/non-functional/tenant-provisioning.md) のユーザー管理画面フロー設計と
PBI-SaaS-006 で実装した API を組み合わせてフロントエンドを実装する。
`tenant_admin` のみアクセスできるユーザー管理ページを `apps/frontend/src/features/user-management/` に配置する。

---

## スコープ

### 含む

- ユーザー管理ページ（独立した管理ページ: `/tenant/users`）
  - テナント内ユーザー一覧表示（名前・メールアドレス・ロール・登録日）
  - ユーザー招待ボタン・削除ボタン・ロール変更ボタン
- ユーザー招待モーダル
  - メールアドレス入力（最大 255 文字）
  - ロール選択（`tenant_admin` / `tenant_user`）
  - 送信後の成功・エラー表示
- ユーザー削除確認ダイアログ
  - 削除前の確認メッセージ
  - テナント内最後の `tenant_admin` を削除しようとした場合のエラー表示
- ロール変更 UI（インライン選択またはモーダル）
- `GET /api/my/permissions?tenant={slug}` でパーミッション取得 + Pinia store 管理
  - `canDo(resource, action)` ヘルパーで UI 制御（ボタン非表示・非活性）
- ルートガード（`tenant_admin` 以外はアクセス不可: リダイレクト）
- Vue コンポーネントの lint・型チェック通過

### 含まない

- `servicer_admin` / `servicer_delegate` 向けのテナント発行 UI（管理 Lambda 直呼び出しのため今回スコープ外）
- テナント一覧画面（サービサー向け管理 UI は後続 PBI）
- VRT（ビジュアルリグレッションテスト）全ページ化

---

## ユースケース

### メイン（ユーザー招待）

1. `tenant_admin` がユーザー管理ページを開く（ユーザー一覧が表示される）
2. 「ユーザーを招待」ボタンを押し、招待モーダルを開く
3. メールアドレスとロールを入力して送信する
4. `POST /api/users/invite` を呼び出し、成功時にユーザー一覧が更新される

### メイン（ユーザー削除）

1. `tenant_admin` がユーザー一覧から削除対象の「削除」ボタンを押す
2. 削除確認ダイアログが表示される
3. 確認後、`DELETE /api/users/{userId}` を呼び出す
4. 成功時にユーザー一覧からそのユーザーが消える

### メイン（ロール変更）

1. `tenant_admin` がユーザー一覧のロール列からロールを変更する
2. `PUT /api/users/{userId}/roles` を呼び出す
3. 成功時に一覧のロール表示が更新される

### 代替

- API エラー時はエラーメッセージをモーダル / トースト通知で表示する

### 例外

- `tenant_admin` 以外がページにアクセスした場合 → ホームへリダイレクト
- テナント内最後の `tenant_admin` の削除確認後に API が 400 を返した場合 → エラーメッセージを表示する

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: ユーザー管理ページにテナント内ユーザーが表示されること
  Given `tenant_admin` としてログインしている
  When  /tenant/users にアクセスしたとき
  Then  テナント内ユーザーの一覧が表示されること
  And   各ユーザーのメールアドレス・ロール・登録日が表示されること

Scenario 2: `tenant_user` がユーザー管理ページにアクセスできないこと
  Given `tenant_user` としてログインしている
  When  /tenant/users にアクセスしようとしたとき
  Then  ホームページにリダイレクトされること

Scenario 3: ユーザー招待モーダルから招待できること
  Given `tenant_admin` としてユーザー管理ページを開いている
  When  「ユーザーを招待」ボタンを押し、有効なメールアドレスとロールを入力して送信したとき
  Then  POST /api/users/invite が呼ばれること
  And   成功後にユーザー一覧が更新されること
  And   招待モーダルが閉じること

Scenario 4: 削除確認ダイアログが表示されること
  Given `tenant_admin` としてユーザー管理ページを開いている
  When  ユーザーの「削除」ボタンを押したとき
  Then  削除確認ダイアログが表示されること
  And   キャンセルするとダイアログが閉じてユーザーが削除されないこと

Scenario 5: 最後の `tenant_admin` 削除失敗時にエラーが表示されること
  Given `tenant_admin` としてユーザー管理ページを開いている
  And   テナント内の `tenant_admin` が自分 1 名のみである
  When  自分の「削除」ボタンを押し確認ダイアログで削除を実行したとき
  Then  API から 400 が返り、「最後の管理者は削除できません」旨のエラーメッセージが表示されること
  And   ユーザー一覧に変化がないこと

Scenario 6: lint・型チェックが通ること
  Given ユーザー管理機能のコードが実装されている
  When  `npm run lint` を実行したとき
  Then  エラーが 0 件であること
```

---

## ルール（Example Mapping）

- **Rule 1: ユーザー管理ページは `tenant_admin` のみアクセス可能**
  - Example: Vue Router のルートガードで `custom:user_type !== 'tenant_admin'` の場合はホームへリダイレクトする。Pinia store の `userType` を参照する

- **Rule 2: API エラーはユーザーに分かりやすく表示する**
  - Example: 400 の場合は「操作できません: {message}」、500 の場合は「一時的なエラーが発生しました。しばらく後に再試行してください」を表示する。スタックトレースを表示しない

- **Rule 3: 削除は確認ダイアログを必ず挟む**
  - Example: 削除ボタン押下で直接 API を呼ばず、確認ダイアログを表示してから実行する

- **Rule 4: 権限のない操作ボタンは `canDo(resource, action)` で非表示にする**
  - Example: `canDo('user', 'delete')` が `false` の場合は削除ボタンを表示しない。ただしバックエンドの認可チェックを省略しない

---

## 不明点 / 質問

なし（設計ドキュメントで確定済み）

---

## INVEST チェック

- **Independent**: NG — PBI-SaaS-006（ユーザー管理 API）の完了後に着手
- **Negotiable**: OK — UI コンポーネントライブラリの使い方・モーダルの UX 詳細は交渉余地あり
- **Valuable**: OK — この画面なしでは `tenant_admin` がユーザー管理をできない
- **Estimable**: OK — 画面フロー設計ドキュメントで手順が詳細化済み
- **Small**: OK — ユーザー管理ページ + 関連コンポーネントのみ
- **Testable**: OK — lint・型チェック + E2E テスト（Playwright）で検証可能
