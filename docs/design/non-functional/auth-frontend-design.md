---
last_updated: 2026-06-18
---

# フロントエンド認証設計ドキュメント（PBI-014）

## 対象読者・目的・スコープ

**対象読者**: フロントエンド開発者

**目的**: Amplify UI for Vue を用いたログイン機能の設計方針を確定し、
`dev:mock` モードでの Cognito 非接続動作を可能にする切り替え方式を定義する。

**スコープ（含む）**:

- フロントエンドにおける認証の責務分離方針（authService 抽象化）
- `dev:mock` モードと本番モードの切り替え設計
- Pinia store で管理するユーザー情報の設計
- Vue Router ルートガードの認証チェック方針
- Amplify UI Authenticator コンポーネントの統合方針
- 日本語ローカライズ方針
- テスト観点

**スコープ（含まない）**:

- Cognito User Pool / App Client の構成（`auth-cognito.md` 参照）
- CDK / インフラ実装（`cognito-cdk-design.md` 参照）
- テナント選択画面の実装（別 PBI）

---

## 設計の核心：authService 抽象化

### 背景と判断

`dev:mock` モードでは Cognito に接続しない認証が必要だが、
認証フローはアプリケーションの多くの場所（ルートガード・Pinia store・ログアウト処理）から参照される。
認証バックエンドの差し替えをコンポーネント側に漏らさないため、
**authService インターフェースで認証処理を抽象化し、起動時に1か所で差し替える**設計を採用する。

### authService インターフェース

authService は以下の操作を提供する。

| 操作 | 説明 |
|---|---|
| `signIn(email, password)` | 認証情報を検証し、ログイン済みユーザー情報を返す |
| `signOut()` | セッションを終了する |
| `getCurrentUser()` | 現在のセッションからユーザー情報を取得する。未ログイン時は `null` を返す |

ユーザー情報（`AuthUser`）として返す属性：

| フィールド | 型 | 説明 |
|---|---|---|
| `userId` | string | Cognito sub（ユーザーを一意に識別する）|
| `email` | string | メールアドレス |
| `userType` | string リテラル union | `"tenant_user"` / `"tenant_admin"` / `"servicer_admin"` / `"servicer_delegate"` |
| `tenantId` | string \| undefined | `tenant_*` のみ設定。`servicer_*` は undefined |

### モード切り替え方式

Vite のビルド時定数（`import.meta.env.VITE_USE_MOCK`）の静的解析を利用して
動的 import のどちらのブランチが本番ビルドに含まれるかを制御する。

```
VITE_USE_MOCK=true  → authService.mock  を動的 import（モック実装）
VITE_USE_MOCK 未設定 → authService.amplify を動的 import（Amplify 実装）
```

Vite はビルド時に `import.meta.env` の値を確定した定数として扱うため、
使われないブランチは tree-shake により本番バンドルから除去される。
本番ビルドにモック実装が混入するリスクがない。

---

## `dev:mock` モードのモック認証

### 動作仕様

- ログイン画面を通常通り表示する
- 「モックログイン」ボタンと、ユーザー種別を選択するドロップダウンを表示する
- ドロップダウンで選択できる種別:
  - `tenant_user`（テナント一般ユーザー）
  - `tenant_admin`（テナント管理者）
  - `servicer_admin`（サービサー管理者）
  - `servicer_delegate`（サービサー委任者）
- ボタン押下で固定ユーザー情報を即座に返す（API 通信なし）
- 返却する固定値:
  - `userId`: `"mock-user-1"`
  - `email`: `"mock@example.com"`
  - `tenantId`: `"acme"`（`tenant_*` の場合）
- ログイン後は通常の `custom:user_type` 分岐ロジックを通り、リダイレクトされる

### 採用しない実装方式

- **Amplify UI の overrides でモック**: `signIn` を差し替えるだけでは Amplify の設定読み込みが走り、Cognito 未設定環境でエラーになる。採用しない。
- **Vitest の `vi.mock`**: テスト専用アプローチ。開発サーバーでは使えない。採用しない。

---

## Pinia store 設計（useAuthStore）

### 管理する状態

| 状態名 | 型 | 説明 |
|---|---|---|
| `user` | `AuthUser \| null` | ログイン済みユーザー情報。未ログイン時は `null` |
| `isLoading` | boolean | 認証状態の非同期チェック中フラグ |

### 操作

| 操作 | 説明 |
|---|---|
| `login(email, password)` | authService.signIn を呼び出し、user を更新する |
| `logout()` | authService.signOut を呼び出し、user を null にリセットする |
| `restoreSession()` | アプリ起動時に getCurrentUser を呼び出し、既存セッションを復元する |

### 設計方針

- Pinia store は `authService` を直接 import せず、引数またはプラグインで受け取る（テスト容易性）
- JWT の raw トークンは store に保持しない（Amplify SDK が localStorage で管理する）
- store には `custom:user_type` / `custom:tenant_id` 由来の情報のみを保持する

---

## Vue Router ルートガード

### 現状からの変更

現状は `localStorage.getItem('userId')` の存在確認のみ。
これを `authStore.user !== null` の確認に置き換える。

### 設計方針

- `requiresAuth: true` を持つルートへのアクセス時に `authStore.user` を確認する
- `null` の場合は `/login` へリダイレクトする
- アプリ起動時（`router.isReady()` 前）に `restoreSession()` を実行し、
  リロード後のセッション継続を保証する
- リフレッシュトークンが失効して `restoreSession()` が例外を返した場合も
  `user` を `null` にして `/login` へリダイレクトする

### 公開ルート（認証不要ページ）

以下のルートは `requiresAuth: false`（またはメタ属性なし）であり、未ログイン状態でもアクセスできる。
これは仕様上の意図的な判断であり、ルートガードの実装バグではない。

| パス | 理由 |
|---|---|
| `/` | トップページ。未ログインでも閲覧可能なランディングページとして提供する |
| `/login` | ログイン画面。認証不要であることが前提 |

今後公開ルートを追加・削除する場合は、このテーブルを必ず更新すること。
また `/` や `/about` 相当のページが増えた場合は、意図的に公開であることをルート定義のコメントにも記載する。

---

## Amplify UI Authenticator 統合方針

### 設定方針

- `<Authenticator :hideSignUp="true">` でサインアップリンクを非表示にする
- slot を活用してログインフォームの外側に Vuetify のレイアウトを当てる
- Amplify UI 固有のスタイルと Vuetify の CSS 変数が衝突しないよう、
  Authenticator は独立した `LoginView.vue` に閉じ込める

### Amplify 初期化

アプリ起動時（`main.ts`）に以下を実行する。

1. `Amplify.configure()` で Cognito User Pool ID / App Client ID を設定する（環境変数から取得）
2. `I18n.putVocabularies(translations)` + `I18n.setLanguage('ja')` で日本語ローカライズを適用する
3. `VITE_USE_MOCK !== 'true'` の場合のみ Amplify.configure を呼び出す（モック時は設定不要）

### 環境変数

| 変数名 | 用途 |
|---|---|
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID |
| `VITE_USE_MOCK` | `"true"` のとき モック認証を使用 |

---

## ログイン後リダイレクト方針

`custom:user_type` の値に応じて遷移先を決定する。
ハードコードせず定数マップで管理する。

| userType | 遷移先 |
|---|---|
| `tenant_user` | テナントダッシュボード（`/villages`：暫定） |
| `tenant_admin` | テナントダッシュボード（`/villages`：暫定） |
| `servicer_admin` | テナント選択画面（暫定ページ） |
| `servicer_delegate` | テナント選択画面（暫定ページ） |

---

## テスト観点

| 種別 | 観点 |
|---|---|
| 単体（authStore） | `login()` 成功時に `user` がセットされること |
| 単体（authStore） | `login()` 失敗時に `user` が `null` のままであること |
| 単体（authStore） | `logout()` 後に `user` が `null` になること |
| 単体（authStore） | `restoreSession()` でセッションが復元されること |
| 単体（authStore） | `restoreSession()` でセッション切れの場合に `user` が `null` になること |
| 単体（モック認証） | `tenant_user` を選択してモックログインすると正しい AuthUser が返ること |
| 単体（モック認証） | `servicer_admin` を選択すると `tenantId` が undefined であること |
| E2E（Playwright） | `dev:mock` モードでモックログインしてダッシュボードに遷移できること |
| E2E（Playwright） | 未ログイン状態で `/villages` にアクセスすると `/login` にリダイレクトされること |
| E2E（Playwright） | ログアウト後にブラウザバックしても保護ページが表示されないこと |

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-014 | 2026-06-18 | 初版作成。authService 抽象化・モック認証切り替え・Pinia store・ルートガード・Amplify UI 統合方針を定義 |
| PBI-014 | 2026-06-19 | セキュリティレビュー対応：公開ルート（`/`、`/login`）の意図的な非認証設定を明記（H-2） |
