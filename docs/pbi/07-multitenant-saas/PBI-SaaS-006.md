# PBI-SaaS-006 テナント内ユーザー管理 API 実装

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-17

---

## ユーザーストーリー

As a `tenant_admin`  
I want テナント内のユーザー招待・削除・ロール変更を API 経由で操作したい  
So that SaaS アプリ内のユーザー管理画面から安全にテナントメンバーを管理できる

---

## 背景 / 目的

[tenant-provisioning.md](../../design/non-functional/tenant-provisioning.md) で確定したユーザー管理フローを API として実装する。
`tenant_admin` が SaaS アプリ内の管理画面（→ PBI-SaaS-007）から呼び出すエンドポイントを提供する。
全エンドポイントに `tenantContext` + `requirePermission` ミドルウェアを適用し、
テナント境界を超えた操作を防ぐ。

---

## スコープ

### 含む

- ユーザー一覧取得 API
  - `GET /api/users`（テナント内ユーザー一覧。`tenant_admin` / `tenant_user` が自テナント分を取得）
- ユーザー招待 API
  - `POST /api/users/invite`（`tenant_admin` のみ）
  - Cognito `AdminCreateUser`（`custom:user_type`・`custom:tenant_id` 設定）
  - 招待メール（日本語）送信
  - `tenant_{slug}.users` 登録
  - `tenant_{slug}.user_roles` 設定
- ユーザー削除 API
  - `DELETE /api/users/{userId}`（`tenant_admin` のみ）
  - テナント内最後の `tenant_admin` は削除不可（400 エラー）
  - Cognito `AdminDisableUser` → `AdminDeleteUser` の順で実行
  - `tenant_{slug}.user_roles` → `tenant_{slug}.users` の順で削除
- ロール変更 API
  - `PUT /api/users/{userId}/roles`（`tenant_admin` のみ）
  - `tenant_{slug}.user_roles` を更新
- 招待メール再送 API
  - `POST /api/users/{userId}/resend-invitation`（`tenant_admin` のみ）
- 全エンドポイントに `tenantContext` + `requirePermission` ミドルウェアを適用
- ユニットテスト・統合テスト

### 含まない

- フロントエンド画面（→ PBI-SaaS-007）
- `servicer_*` アクターの管理 API（→ PBI-SaaS-005）
- `tenant_admin` がテナント外ユーザーを操作するエンドポイント

---

## ユースケース

### メイン（ユーザー招待）

1. `tenant_admin` が `POST /api/users/invite` にメールアドレスとロールを送る
2. Cognito `AdminCreateUser` でアカウントを作成し招待メールを送信する
3. `tenant_{slug}.users` にユーザーを登録し `tenant_{slug}.user_roles` にロールを設定する
4. 201 Created とユーザー情報を返す

### メイン（ユーザー削除）

1. `tenant_admin` が `DELETE /api/users/{userId}` を呼び出す
2. 削除対象がテナント内最後の `tenant_admin` でないことを確認する
3. Cognito `AdminDisableUser` → `AdminDeleteUser` の順で削除する
4. `tenant_{slug}.user_roles` → `tenant_{slug}.users` の順でレコードを削除する
5. 204 No Content を返す

### 代替

- 招待メールが届かない場合 → `POST /api/users/{userId}/resend-invitation` で再送できる

### 例外

- テナント内最後の `tenant_admin` を削除しようとした場合 → 400 Bad Request
- 他テナントのユーザー ID を指定した場合 → 403 Forbidden
- 存在しないユーザー ID を指定した場合 → 404 Not Found

---

## 受け入れ条件（Gherkin）

```gherkin
Scenario 1: ユーザー一覧が自テナント分のみ返ること
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  When  GET /api/users にリクエストを送ったとき
  Then  200 OK で `tenant_acme.users` のユーザー一覧が返ること
  And   他テナントのユーザーが含まれないこと

Scenario 2: ユーザー招待が正常に完了すること
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  When  POST /api/users/invite に { email: "new@example.com", role: "tenant_user" } を送ったとき
  Then  201 Created が返ること
  And   Cognito に `custom:tenant_id: "acme"` のユーザーが作成されていること
  And   `tenant_acme.users` にユーザーレコードが存在すること
  And   `tenant_acme.user_roles` にロールが設定されていること

Scenario 3: `servicer_*` ロールは招待できないこと
  Given `tenant_admin` の JWT でリクエストしている
  When  POST /api/users/invite に { email: "admin@example.com", role: "servicer_admin" } を送ったとき
  Then  400 Bad Request が返ること

Scenario 4: テナント内最後の `tenant_admin` は削除できないこと
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  And   `tenant_acme` のテナント管理者が 1 名のみである
  When  DELETE /api/users/{その管理者ID} にリクエストを送ったとき
  Then  400 Bad Request が返ること

Scenario 5: 通常のユーザー削除が正常に完了すること
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  And   削除対象がテナント内唯一の管理者ではない
  When  DELETE /api/users/{userId} にリクエストを送ったとき
  Then  204 No Content が返ること
  And   Cognito から対象ユーザーが削除されていること
  And   `tenant_acme.users` から対象レコードが削除されていること

Scenario 6: 他テナントのユーザー操作は 403 を返すこと
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  And   指定 userId が `tenant_beta.users` のユーザーである
  When  DELETE /api/users/{userId} にリクエストを送ったとき
  Then  403 Forbidden が返ること

Scenario 7: ロール変更が正常に完了すること
  Given `tenant_admin` の JWT でリクエストしている（tenant_id: "acme"）
  When  PUT /api/users/{userId}/roles に { roleId: 2 } を送ったとき
  Then  200 OK が返ること
  And   `tenant_acme.user_roles` のロールが更新されていること
```

---

## ルール（Example Mapping）

- **Rule 1: `tenant_admin` は自テナント内のユーザーのみ管理できる**
  - Example: ユーザー削除時に `tenant_{slug}.users` で `userId` が自テナントに存在することを確認し、他テナントのユーザーは 403 で拒否する

- **Rule 2: テナント内最後の `tenant_admin` は削除できない**
  - Example: 削除前に `tenant_{slug}.user_roles` JOIN `tenant_{slug}.roles` で `role.name = 'tenant_admin'` のユーザー数をカウントし、1 以下なら 400 を返す

- **Rule 3: ユーザー削除は Cognito と DB の両方から物理削除する**
  - Example: `AdminDisableUser` で先に無効化し、次のリクエストで 403 になることを保証してから `AdminDeleteUser` を呼び出す

- **Rule 4: `tenant_admin` が付与できるロールは `tenant_admin` / `tenant_user` のみ**
  - Example: Zod バリデーションで `role: z.enum(['tenant_admin', 'tenant_user'])` のみ受け付ける

---

## 不明点 / 質問

### `servicer_delegate` の権限チェック設計決定（PBI-SaaS-004 から引き継ぎ）

**発生状況**: PBI-SaaS-004 の実装中に判明した設計上の乖離。

**現状の実装**:

`tenantContext.ts` では `servicer_delegate` が `X-Tenant-Id` ヘッダーでテナントを指定する。
このとき `c.set('userId', serviceUser.id)` に **service スキーマの `users.id`** をセットしている。

```
service.users.id = 42  ← tenantContext がセットする userId
```

一方、`requirePermission.ts` は以下を実行する:

```sql
SELECT * FROM tenant_{slug}.user_roles ur
INNER JOIN tenant_{slug}.role_permissions rp ON ur.role_id = rp.role_id
WHERE ur.user_id = 42          -- ← service.users.id をテナント DB で使用
  AND rp.resource = 'village'
  AND rp.action = 'read'
```

`tenant_{slug}.user_roles.user_id` は `tenant_{slug}.users.id` の FK であり、
`service.users.id` とは別系統の autoincrement 値である。
このため **`servicer_delegate` は現状テナントリソースにアクセスできない**（一致する行が存在しないため 403 を返す）。

**問題**: 上記は意図的な 403 ではなく「偶然の一致による遮断」であり、堅牢な設計ではない。

**この PBI で決定が必要な設計方針**（以下のいずれかを選ぶ）:

| 案 | 内容 | トレードオフ |
|---|---|---|
| A | `servicer_delegate` はテナント DB のリソースにアクセスできない（現状追認） | シンプルだが `servicer_delegate` の用途が限定される |
| B | `servicer_delegate` 専用の権限テーブルをサービス側に持つ（`service.role_permissions`） | サービス側とテナント側で権限管理が統一できる |
| C | `servicer_delegate` がテナントにアクセスする際はテナント DB にも `user_roles` 行を持つ | 柔軟だがテナントプロビジョニング時の設定が増える |

**実装への影響**:
- 案 A: `requirePermission.ts` で `servicer_delegate` を明示的に 403 返却するか、`tenantContext.ts` の段階でブロックするコードを追加
- 案 B / C: `requirePermission.ts` に `servicer_delegate` 専用の権限確認パスを追加

この PBI の実装開始前に上記方針を決定し、`api-authz-multitenant.md` を更新すること。

---

## INVEST チェック

- **Independent**: NG — PBI-SaaS-004（Hono ミドルウェア）と PBI-SaaS-005（プロビジョニング Lambda）の完了後に着手
- **Negotiable**: OK — 削除の物理削除タイミング・招待メール再送の実装方式は交渉余地あり
- **Valuable**: OK — ユーザー管理 API なしでは管理画面が作れない
- **Estimable**: OK — フロー設計ドキュメントで手順が詳細化済み
- **Small**: OK — API エンドポイント実装のみ（フロントエンドを含まない）
- **Testable**: OK — ユニットテスト + 統合テスト（ローカル Docker MySQL + Cognito Local）で検証可能
