---
last_updated: 2026-06-17
---

# セキュリティ方針

## 対象読者

API・インフラ担当の開発者。新しいエンドポイント実装時・認証機能追加時に参照すること。

---

## 認証

| フェーズ | 方式 | 詳細 |
|---|---|---|
| MVP 開発中（PBI-014 実装前） | モック認証 | リクエストヘッダー `X-User-Id` の値を `owner_id` として使用する。ヘッダーがない場合は固定値 `"mock-user-1"` にフォールバックする |
| PBI-014 実装後 | JWT 認証 | API Gateway Authorizer が JWT を検証し、`requestContext.authorizer.userId` を Lambda に渡す |
| SaaS 化（PBI-SaaS-001d 以降） | Cognito JWT Authorizer + テナントコンテキスト解決 | Cognito JWT Authorizer が JWT 署名検証。Lambda 内の tenantContext ミドルウェアが custom:user_type / custom:tenant_id を検証し、テナント DB 接続を確立する |

モック認証は `AUTH_ENABLED` 環境変数で切り替える（`true` で本番認証を使用）。
本番環境では必ず `AUTH_ENABLED=true` を設定すること。

---

## 認可

**原則: バックエンドで必ず `owner_id` チェックを実施する。**

フロントエンド側のガード（ボタン非表示・ルートガードなど）は UX のためのものであり、
認可の最終判断は常に API 側で行う。

| 操作 | チェック内容 |
|---|---|
| 村の一覧取得（GET /villages） | `owner_id = 認証ユーザーID` でフィルタ。他ユーザーの村はレスポンスに含めない |
| 村の作成（POST /villages） | 認証済みであることを確認。`owner_id` は認証ユーザーID を自動設定（リクエストボディから受け取らない） |
| 将来の更新・削除系エンドポイント | 対象リソースの `owner_id` と認証ユーザーID が一致することを確認。不一致は 403 を返す |

> `owner_id` はリクエストボディから受け取らない。必ず認証情報から取得する。

### マルチテナント認可（SaaS 化後）

認可は 2 段構成で実施する。

| Tier | ミドルウェア | チェック内容 |
|---|---|---|
| Tier 1 | `tenantContext` | テナントアクセス確認（`service.user_tenant_roles` / JWT `custom:tenant_id`） |
| Tier 2 | `requirePermission(resource, action)` | 機能認可（`role_permissions` テーブルの resource × action ホワイトリスト） |

`servicer_admin` は Tier 2 をスキップし全テナント・全操作に対する権限を持つ。
詳細は [api-authz-multitenant.md](./api-authz-multitenant.md) を参照。

---

## 入力バリデーション

- バリデーションは `packages/schema` の Zod スキーマを Single Source of Truth とする
- フロントエンドとバックエンドで同じスキーマを共有し、定義の乖離を防ぐ
- バックエンドのバリデーションを省略しない（フロントエンドがバイパスされる可能性があるため）

---

## HTTP ヘッダーへのユーザー入力の扱い

HTTP ヘッダーの値は **ISO-8859-1 の範囲内**でなければならない（RFC 7230）。
ユーザーが入力した文字列（日本語など非 ASCII 文字を含む可能性がある値）をそのままヘッダーにセットすると、ブラウザが `TypeError: Failed to execute 'fetch'` を投げる。

**方針: フロントエンドはヘッダー値を `encodeURIComponent` でエンコードし、受信側は `decodeURIComponent` でデコードする。**

```typescript
// フロントエンド送信側（village.ts）
function userHeaders(): Record<string, string> {
  return { 'X-User-Id': encodeURIComponent(localStorage.getItem('userId') ?? 'mock-user-1') }
}

// MSW ハンドラー受信側（handlers.ts）
const ownerId = decodeURIComponent(request.headers.get('X-User-Id') ?? '')

// バックエンド受信側（本番 API）
const ownerId = decodeURIComponent(c.req.header('X-User-Id') ?? '')
```

同じヘッダーを複数箇所でセットするときは、ヘッダー生成を1関数に集約してエンコード漏れを防ぐこと。

---

## 秘密情報の扱い

- DB 接続文字列・API キーなどは環境変数で管理し、コードにハードコードしない
- `owner_id`・ユーザーIDはログに出力してよい（識別子であり個人情報ではないが、氏名・メールアドレスは出力しない）
- エラーレスポンスにスタックトレース・内部パス・DB エラー詳細を含めない（[error-handling.md](./error-handling.md) 参照）

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成。認証モック方針・認可原則・バリデーション責務・秘密情報取り扱いを定義 |
| PBI-001 | 2026-05-06 | HTTP ヘッダーへのユーザー入力エンコーディング方針を追加（`encodeURIComponent` / `decodeURIComponent`） |
| PBI-SaaS-001d | 2026-06-17 | マルチテナント認証フェーズ（Cognito JWT Authorizer + tenantContext）と認可 2 段構成（Tier 1: テナントアクセス確認 / Tier 2: resource × action ホワイトリスト）を追記 |
