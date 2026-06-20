# PBI-SaaS-004b 作業計画 — 全ハンドラー Hono 移行 + 旧スキーマ廃止 + エラーコード統一

Sprint 3 / 作成日: 2026-06-21

**想定読者**: 実装 SubAgent・実装担当者  
**目的**: PBI-SaaS-004b 実装で必要なファイル配置・変更箇所・SubAgent 割り当て・完了条件を記録する。  
**スコープ**: 旧 `getOwnerId` パターンのハンドラーを全て Hono ミドルウェアパターンに移行し、旧スキーマ・旧マイグレーション・旧テストヘルパーを削除する。servicer 経路のエラーコードを修正する。

設計の根拠は [api-authz-multitenant.md](../../design/non-functional/api-authz-multitenant.md) を参照。  
移行パターンの参照実装は [listVillages.ts](../../../apps/api/src/village/listVillages.ts) および [listVillages.medium.test.ts](../../../apps/api/src/village/listVillages.medium.test.ts)。

---

## 前提・依存関係

- **PBI-SaaS-004 完了が前提**: `hono/app.ts` / `hono/lambda.ts` / `tenantContext.ts` / `requirePermission.ts` / `listVillages.ts` が実装済みであること
- `tenant-template-schema.ts` に `tenantVillages` / `tenantResidents` / `tenantItems` テーブルが定義済みであること
- `drizzle-tenant/` にテナントスキーマのマイグレーション SQL が存在すること
- Docker MySQL が `tools/docker/docker-compose.yml` で起動できること

---

## エラーコード修正の仕様（サブタスク 1）

### 対象ファイル

`apps/api/src/shared/middleware/tenantContext.ts` — `handleServicerUser` 関数

### 現状と変更後

| 状況 | 現状 | 変更後 |
|---|---|---|
| `serviceTenants` にスラッグが存在しない | 503 Service Unavailable | **404 Not Found** |
| テナントの `status` が `'active'` 以外（suspended / deleted など） | 503 Service Unavailable | **403 Forbidden** |
| テナントスキーマ接続エラー（インフラ起因） | 発生時は未処理 | **503 Service Unavailable**（try-catch で明示的に処理） |

### 変更する関数のロジック（handleServicerUser）

```
1. スラッグ取得・バリデーション（400）
2. service.tenants でテナントを検索
   - 存在しない（rows が空）       → 404 Not Found
   - status !== 'active'             → 403 Forbidden
   - 存在し active                   → 続行
3. service_users・user_tenant_roles でアクセス確認（403）
4. getTenantDb(slug) を try-catch で呼ぶ（接続失敗 → 503）
5. c.set(...) してから next()
```

### `handleTenantUser` は変更しない

tenant_user 経路の `custom:tenant_id` はユーザー制御できない（JWT 発行時に固定される）ため、
列挙攻撃のリスクが低く、受け入れ条件にも含まれていない。既存 503 の挙動を維持する。

### 更新が必要な既存テスト

`apps/api/src/shared/middleware/tenantContext.small.test.ts` に以下の変更が必要：

| 既存テスト | 変更内容 |
|---|---|
| `servicer_admin が X-Tenant-Id ヘッダー付きでアクセスするとき` — 正常系 | servicer 経路で `getTenantDb` の try-catch をモックに反映（変更不要の可能性あり） |
| servicer 経路でテナントが存在しないケースのテスト（未実装） | **新規追加**: スラッグ不在 → 404、status 非 active → 403 |

---

## 移行対象ハンドラーの仕様

### 参照パターン（`listVillages.ts` 移行済み）

```typescript
import type { Handler } from 'hono';
import type { HonoVariables } from '../hono/types';

export const listVillagesHandler: Handler<{ Variables: HonoVariables }> = async (c) => {
  const tenantDb = c.get('tenantDb');
  const userId = c.get('userId');
  // tenantDb を使ってテナントスキーマ内のみ操作する
  return c.json({ villages: result });
};
```

### createVillage（サブタスク 2）

**旧ファイル**: `apps/api/src/village/createVillage.ts`（既存を上書き）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `createVillageHandler` |
| ルーティング | 独立 Lambda | `POST /api/villages` |
| ownerId 型 | `string`（X-User-Id ヘッダー） | `number`（`c.get('userId')`、`bigint` → number） |
| テーブル | `villages`（旧 schema） | `tenantVillages` |
| スキーマ参照 | `import { villages } from '../db/schema'` | `import { tenantVillages } from '../db/tenant-template-schema'` |
| `requirePermission` | なし | `requirePermission('village', 'create')` |

**`app.ts` 追記**: `app.post('/api/villages', requirePermission('village', 'create'), createVillageHandler);`

**テスト変更**:
- `createVillage.small.test.ts`: Hono テスト用に書き換え（`app.request` 方式）
- `createVillage.medium.test.ts`: `use-mysql-container` 依存を削除。`listVillages.medium.test.ts` と同じ testcontainers パターンへ変更。`ownerId` の期待値を `number`（bigint）に変更

### createResident（サブタスク 3）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `createResidentHandler` |
| ルーティング | 独立 Lambda | `POST /api/residents` |
| 村の所有確認 | `village.ownerId !== ownerId`（string 比較） | `requirePermission` に委ねる（テナント境界はミドルウェアが保証） |
| テーブル | `residents`（旧 schema） | `tenantResidents` |
| villageId 参照 | `villages`（旧 schema） でオーナー確認 | `tenantVillages` で確認（テナントスキーマ内なのでクロスアクセスは発生しない） |
| `requirePermission` | なし | `requirePermission('resident', 'create')` |

**`app.ts` 追記**: `app.post('/api/residents', requirePermission('resident', 'create'), createResidentHandler);`

**テスト変更**:
- `createResident.small.test.ts`: Hono テスト用に書き換え
- `createResident.medium.test.ts`: testcontainers パターンへ変更。`resident.integration.test.ts` との重複を確認し統合または削除

### listResidents（サブタスク 3 続き）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `listResidentsHandler` |
| ルーティング | 独立 Lambda | `GET /api/residents` |
| テーブル | `residents` JOIN `villages`（旧 schema） | `tenantResidents` JOIN `tenantVillages` |
| `requirePermission` | なし | `requirePermission('resident', 'read')` |

**`app.ts` 追記**: `app.get('/api/residents', requirePermission('resident', 'read'), listResidentsHandler);`

**テスト変更**:
- `listResidents.medium.test.ts`: testcontainers パターンへ変更

### listVillageResidents（サブタスク 3 続き）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `listVillageResidentsHandler` |
| ルーティング | 独立 Lambda | `GET /api/villages/:id/residents` |
| パスパラメータ | `event.pathParameters?.id` | `c.req.param('id')` |
| 村の所有確認 | `village.ownerId !== ownerId` で 403 | テナント境界はミドルウェア保証。自テナント内の村のみアクセス可能なため村の存在確認のみ行う |
| テーブル | `residents`・`villages`（旧 schema） | `tenantResidents`・`tenantVillages` |
| `requirePermission` | なし | `requirePermission('resident', 'read')` |

**`app.ts` 追記**: `app.get('/api/villages/:id/residents', requirePermission('resident', 'read'), listVillageResidentsHandler);`

**テスト変更**:
- `listVillageResidents.small.test.ts`: Hono テスト用に書き換え
- `listVillageResidents.medium.test.ts`: testcontainers パターンへ変更
- `resident.integration.test.ts`: Hono パターンのテストと役割が重複する場合は統合または削除

### createItem（サブタスク 4）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `createItemHandler` |
| ルーティング | 独立 Lambda | `POST /api/items` |
| ownerId | なし（旧スキーマに `ownerId` フィールドなし） | `c.get('userId')` をセット（`tenantItems` は `ownerId` 必須） |
| テーブル | `items`（旧 schema） | `tenantItems` |
| `requirePermission` | なし | `requirePermission('item', 'create')` |

**注意**: 旧 `items` テーブルには `ownerId` がない（`createItem.ts` コメント「ユーザー所有リソースでないため認証チェック不要」）。新 `tenantItems` には `ownerId`（FK to `tenantUsers.id`）があるため、`c.get('userId')` で埋める。

**`app.ts` 追記**: `app.post('/api/items', requirePermission('item', 'create'), createItemHandler);`

**テスト変更**:
- `createItem.small.test.ts`: Hono テスト用に書き換え
- `createItem.medium.test.ts`: testcontainers パターンへ変更

### items.ts（listItems）（サブタスク 4 続き）

| 項目 | 変更前 | 変更後 |
|---|---|---|
| 関数名 | `handler` | `listItemsHandler` |
| ルーティング | 独立 Lambda | `GET /api/items` |
| フィルタ | 全件取得（所有者フィルタなし） | `tenantItems` を `userId` でフィルタ |
| テーブル | `items`（旧 schema） | `tenantItems` |
| `requirePermission` | なし | `requirePermission('item', 'read')` |

**`app.ts` 追記**: `app.get('/api/items', requirePermission('item', 'read'), listItemsHandler);`

**テスト変更**:
- `items.medium.test.ts`: testcontainers パターンへ変更

---

## 削除対象ファイル（サブタスク 5）

全ハンドラーの移行が完了してから削除すること。

| ファイル / フォルダ | 削除理由 |
|---|---|
| `apps/api/src/db/schema.ts` | 旧シングルテナントスキーマ。移行後は全ハンドラーが `tenant-template-schema.ts` を使用 |
| `apps/api/drizzle/` | 旧マイグレーション履歴。テナントスキーマには `drizzle-tenant/` を使用 |
| `apps/api/src/shared/mysql-setup.ts` | 旧 testdb 用ヘルパー。新テストは testcontainers 直接使用 |
| `apps/api/src/shared/use-mysql-container.ts` | 旧 testdb 用ヘルパー。新テストは testcontainers 直接使用 |

削除前に以下を確認すること:
- `grep -r "from.*db/schema" apps/api/src/` でインポートが 0 件になっていること
- `grep -r "use-mysql-container\|mysql-setup" apps/api/src/` でインポートが 0 件になっていること

---

## ドキュメント更新（サブタスク 6）

### `api-authz-multitenant.md`

エラー一覧テーブルの servicer 経路該当行を更新する。変更履歴テーブルに PBI-SaaS-004b エントリを追加する。

### `openapi.yaml`

テナントコンテキスト解決に失敗するエンドポイント（全認証済みエンドポイント）に `404 Not Found` レスポンスを追加する。

`components/responses` に `NotFound` コンポーネントを追加し、各パスで `$ref: '#/components/responses/NotFound'` を参照する。

---

## 変更ファイル一覧

| 操作 | ファイルパス | 内容 |
|---|---|---|
| 更新 | `apps/api/src/shared/middleware/tenantContext.ts` | servicer 経路エラーコード修正（503 → 404/403/503 分割） |
| 更新 | `apps/api/src/shared/middleware/tenantContext.small.test.ts` | servicer 経路の 404/403 テストを追加・既存 503 テストを修正 |
| 更新 | `apps/api/src/village/createVillage.ts` | Hono パターンに移行（`handler` → `createVillageHandler`） |
| 更新 | `apps/api/src/village/createVillage.small.test.ts` | Hono テスト形式に書き換え |
| 更新 | `apps/api/src/village/createVillage.medium.test.ts` | testcontainers パターンに書き換え |
| 更新 | `apps/api/src/resident/createResident.ts` | Hono パターンに移行 |
| 更新 | `apps/api/src/resident/createResident.small.test.ts` | Hono テスト形式に書き換え |
| 更新 | `apps/api/src/resident/createResident.medium.test.ts` | testcontainers パターンに書き換え |
| 更新 | `apps/api/src/resident/listResidents.ts` | Hono パターンに移行 |
| 更新 | `apps/api/src/resident/listResidents.medium.test.ts` | testcontainers パターンに書き換え |
| 更新 | `apps/api/src/resident/listVillageResidents.ts` | Hono パターンに移行（パスパラメータ変更） |
| 更新 | `apps/api/src/resident/listVillageResidents.small.test.ts` | Hono テスト形式に書き換え |
| 更新 | `apps/api/src/resident/listVillageResidents.medium.test.ts` | testcontainers パターンに書き換え |
| 確認・削除 | `apps/api/src/resident/resident.integration.test.ts` | Hono パターンとの重複を確認し、不要なら削除 |
| 更新 | `apps/api/src/item/createItem.ts` | Hono パターンに移行（`ownerId` 追加） |
| 更新 | `apps/api/src/item/createItem.small.test.ts` | Hono テスト形式に書き換え |
| 更新 | `apps/api/src/item/createItem.medium.test.ts` | testcontainers パターンに書き換え |
| 更新 | `apps/api/src/item/items.ts` | Hono パターンに移行（`listItemsHandler` に改名） |
| 更新 | `apps/api/src/item/items.medium.test.ts` | testcontainers パターンに書き換え |
| 更新 | `apps/api/src/hono/app.ts` | 全ハンドラーのルーティングを追加 |
| 削除 | `apps/api/src/db/schema.ts` | 旧シングルテナントスキーマ |
| 削除 | `apps/api/drizzle/` | 旧マイグレーション履歴フォルダ |
| 削除 | `apps/api/src/shared/mysql-setup.ts` | 旧 testdb ヘルパー |
| 削除 | `apps/api/src/shared/use-mysql-container.ts` | 旧 testdb ヘルパー |
| 更新 | `docs/design/non-functional/api-authz-multitenant.md` | servicer 経路エラー一覧更新・変更履歴追加 |
| 更新 | `docs/design/openapi/openapi.yaml` | `NotFound` レスポンスコンポーネント追加・各パスに追記 |

---

## SubAgent 割り当て表

| # | サブタスク | SubAgent | 依存 |
|---|---|---|---|
| 1 | `tenantContext.ts` servicer 経路エラーコード修正 + テスト更新（TDD） | `tdd-implementer` | なし |
| 2 | `createVillage.ts` Hono 移行 + テスト更新 + `app.ts` ルーティング追加 | `tdd-implementer` | サブタスク 1 |
| 3 | `createResident.ts` / `listResidents.ts` / `listVillageResidents.ts` Hono 移行 + テスト更新 | `tdd-implementer` | サブタスク 2 |
| 4 | `createItem.ts` / `items.ts` Hono 移行 + テスト更新 | `tdd-implementer` | サブタスク 3 |
| 5 | 旧ファイル削除（`schema.ts` / `drizzle/` / `mysql-setup.ts` / `use-mysql-container.ts`） | `backend-engineer` | サブタスク 4 |
| 6 | `api-authz-multitenant.md` + `openapi.yaml` 更新 | `documentation-coauthor` | サブタスク 1（エラーコード仕様確定後） |

---

## medium テストのパターン（移行後の共通形式）

新規および移行後の medium テストは `listVillages.medium.test.ts` と同じ以下のパターンに従う。

```typescript
// テストファイルの共通構造
import { vi, describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import { GenericContainer, Wait } from 'testcontainers';
import * as serviceSchema from '../db/service-schema';
import * as tenantSchema from '../db/tenant-template-schema';

vi.mock('../db/client', () => ({
  getDb: vi.fn(),
  getTenantDb: vi.fn(),
}));

import { getDb, getTenantDb } from '../db/client';
import { app } from '../hono/app'; // Hono アプリを直接テスト対象にする

// testcontainers で MySQL を起動し、service / tenant_test スキーマを作成する
// → drizzle-service / drizzle-tenant でマイグレーションを適用する
// → vi.fn でモックを実 DB インスタンスに差し替える
// → テストデータを挿入してから app.request() でリクエストを送る
```

テナントDB の権限シードは各テストに必要な `resource:action` のみを `tenantRolePermissions` に登録する。

---

## 完了条件チェックリスト

- [ ] `tenantContext.ts` の servicer 経路: スラッグ不在 → 404、非 active → 403 に変更されている
- [ ] `tenantContext.small.test.ts`: servicer 経路の 404/403 テストが追加されている
- [ ] `createVillage.ts` が Hono パターンに移行されている（`createVillageHandler` として export）
- [ ] `createVillage.medium.test.ts` が testcontainers パターンに更新されている（`use-mysql-container` 依存なし）
- [ ] `createResident.ts` が Hono パターンに移行されている
- [ ] `listResidents.ts` が Hono パターンに移行されている
- [ ] `listVillageResidents.ts` が Hono パターンに移行されている
- [ ] `createItem.ts` が Hono パターンに移行されている（`ownerId` に `userId` をセット）
- [ ] `items.ts` が Hono パターンに移行されている（`listItemsHandler` として export）
- [ ] `apps/api/src/hono/app.ts` に全 7 エンドポイントのルーティングが登録されている
- [ ] `apps/api/src/db/schema.ts` が削除されている
- [ ] `apps/api/drizzle/` が削除されている
- [ ] `apps/api/src/shared/mysql-setup.ts` が削除されている
- [ ] `apps/api/src/shared/use-mysql-container.ts` が削除されている
- [ ] `grep -r "from.*db/schema" apps/api/src/` が 0 件であること
- [ ] `grep -r "use-mysql-container\|mysql-setup" apps/api/src/` が 0 件であること
- [ ] `api-authz-multitenant.md` のエラー一覧が更新されている
- [ ] `openapi.yaml` に `NotFound` レスポンスコンポーネントが追加されている
- [ ] `npm run lint`（`apps/api`）が通過している
- [ ] `npm run test`（`apps/api`）が全テスト通過している（small・medium 全件）
- [ ] `docs/pbi/README.md` の該当 PBI を `✅ 完了` に更新すること
- [ ] ユーザーの承認を得てから完了とすること
