# PBI-SaaS-004b 全ハンドラー Hono 移行 + 旧スキーマ廃止 + エラーコード統一

親エピック: [PBI-SaaS-001](PBI-SaaS-001.md) / 作成日: 2026-06-21

---

## ユーザーストーリー

As a バックエンド開発者  
I want 残存する旧スタイルハンドラー（createVillage / createResident / listResidents 等）を Hono + ミドルウェアパターンに移行したい  
So that 全 API ハンドラーが `tenantContext` + `requirePermission` を通じてテナント境界を守る一貫した実装になる

---

## 背景 / 目的

PBI-SaaS-004 で `listVillages` のみ Hono パターンへ移行した。
残りの 6 ハンドラーが旧 `getOwnerId(event)` パターンのまま残っており、
`apps/api/src/db/schema.ts`（旧シングルテナントスキーマ）と `apps/api/drizzle/`（旧マイグレーション履歴）も削除できていない。

加えて PBI-SaaS-004 のセキュリティレビューで以下の MEDIUM 指摘が残っている：
- `tenantContext` の 503 レスポンスがテナントスラッグの存在有無を推測可能にしている（servicer 経路の列挙攻撃対策）

本 PBI でこれらをすべて解消し、旧スキーマを完全廃止する。

---

## スコープ

### 含む

- 以下の旧ハンドラーを Hono パターンに移行する
  - `apps/api/src/village/createVillage.ts`
  - `apps/api/src/resident/createResident.ts`
  - `apps/api/src/resident/listResidents.ts`
  - `apps/api/src/resident/listVillageResidents.ts`
  - `apps/api/src/item/createItem.ts`
  - `apps/api/src/item/items.ts`（listItems）
- 上記ハンドラーの既存ユニットテスト・統合テストを Hono パターンに更新する
- 各ハンドラーに対応する **`-lambda.ts` エントリファイルを作成する**（CloudWatch ログ分離のため API ごとに Lambda を分けている設計を維持する）
- `apps/api/src/hono/app.ts` に上記ハンドラーのルーティングを追加する（統合テスト専用）
- **`infra/lib/infra-stack.ts` の Lambda Function エントリを `-lambda.ts` に更新する**（下記「CDK 更新」参照）
- 旧スキーマ・旧マイグレーションの削除
  - `apps/api/src/db/schema.ts`
  - `apps/api/drizzle/`
  - `apps/api/src/shared/mysql-setup.ts`（旧 testdb 用）
  - `apps/api/src/shared/use-mysql-container.ts`（旧 testdb 用）
- エラーコード統一（MEDIUM 指摘対応）
  - `tenantContext.ts` の servicer 経路における 503 レスポンスを 404 Not Found に変更し、スラッグ存在有無を推測させないようにする
  - `api-authz-multitenant.md` のエラー一覧を更新する
  - `openapi.yaml` のエラーレスポンス定義を更新する

### 含まない

- `servicer_delegate` の権限チェック設計（→ PBI-SaaS-006 で設計決定後に対応）
- フロントエンド（→ PBI-SaaS-007）
- 新規 API エンドポイントの追加

---

## CDK 更新（`infra/lib/infra-stack.ts`）

### 背景

CloudWatch ログから API 呼び出しを追跡しやすくするため、API エンドポイントごとに Lambda Function を分けている設計を維持する。
PBI-SaaS-004 で `listVillages.ts` が `listVillagesHandler` を export するよう変更されたため、`listVillages-lambda.ts` エントリファイルを作成し CDK を修正済み（PBI-SaaS-004 完了時点）。

本 PBI では残る 6 ハンドラーについて同様の対応を行う。

### `-lambda.ts` エントリファイルのパターン

```ts
// apps/api/src/village/createVillage-lambda.ts（例）
import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { AppBindings, HonoVariables } from '../hono/types';
import { tenantContext } from '../shared/middleware/tenantContext';
import { requirePermission } from '../shared/middleware/requirePermission';
import { createVillageHandler } from './createVillage';

const app = new Hono<{ Variables: HonoVariables; Bindings: AppBindings }>();
app.use('*', tenantContext);
app.post('*', requirePermission('village', 'create'), createVillageHandler);

export const handler = handle(app);
```

### 作成する `-lambda.ts` ファイル一覧

| Lambda Function（CDK） | エントリファイル（作成） | HTTP メソッド |
|---|---|---|
| `CreateVillageFunction` | `village/createVillage-lambda.ts` | POST |
| `CreateResidentFunction` | `resident/createResident-lambda.ts` | POST |
| `ListResidentsFunction` | `resident/listResidents-lambda.ts` | GET |
| `ListVillageResidentsFunction` | `resident/listVillageResidents-lambda.ts` | GET |
| `ItemsFunction` | `item/items-lambda.ts` | GET |
| `CreateItemFunction`（新設） | `item/createItem-lambda.ts` | POST |

> **Note**: `createItem.ts` は既存 CDK に Lambda Function がないため、本 PBI で `CreateItemFunction` を新設する。

### `migrationFunction` の更新

`afterBundling` で `apps/api/drizzle/` をコピーしているが、本 PBI で `drizzle/` を削除するため更新が必要。

**変更前**:
```ts
`node -e "...cpSync(join('${src}','apps','api','drizzle'),join('${dst}','migrations'),...)"`
```

**変更後**: 2 系統のマイグレーションを別フォルダにコピーする
```ts
`node -e "...cpSync(join('${src}','apps','api','drizzle-service'),join('${dst}','migrations-service'),...)"`
`node -e "...cpSync(join('${src}','apps','api','drizzle-tenant'),join('${dst}','migrations-tenant'),...)"`
```

`apps/api/src/db/migration.ts` もこれに合わせて更新すること。

### `hono` のバンドル方針

`hono` は Lambda Layer（`infra/layer/`）に含めず、esbuild がバンドルする（約 50 KB、許容範囲）。
`lambdaDefaults.bundling.externalModules` に追加しないこと。

---

## 移行対象ハンドラーの一覧

| ハンドラーファイル | 現在のパターン | 移行後のパターン | `requirePermission` 引数 |
|---|---|---|---|
| `createVillage.ts` | `getOwnerId` + `villages`（旧） | `c.get('userId')` + `tenantVillages` | `requirePermission('village', 'create')` |
| `createResident.ts` | `getOwnerId` + `residents`（旧） | `c.get('userId')` + `tenantResidents` | `requirePermission('resident', 'create')` |
| `listResidents.ts` | `getOwnerId` + `residents`（旧） | `c.get('userId')` + `tenantResidents` | `requirePermission('resident', 'read')` |
| `listVillageResidents.ts` | `getOwnerId` + `residents`（旧） | `c.get('userId')` + `tenantResidents` | `requirePermission('resident', 'read')` |
| `createItem.ts` | `getOwnerId` + `items`（旧） | `c.get('userId')` + `tenantItems` | `requirePermission('item', 'create')` |
| `items.ts` | `getOwnerId` + `items`（旧） | `c.get('userId')` + `tenantItems` | `requirePermission('item', 'read')` |

---

## エラーコード統一の詳細

### 変更対象: `tenantContext.ts` の servicer 経路 503 → 404

**現状**: `service.tenants` でスラッグが存在しない / `status !== 'active'` のとき 503 を返している。

**問題**: `servicer_*` ユーザーは任意の `X-Tenant-Id` を送れるため、503 が返るかどうかでスラッグが登録済みかを列挙できる。

**変更後**:
- テナントが存在しない場合 → 404 Not Found
- テナントが `suspended` / `deleted` の場合 → 403 Forbidden（「存在するが許可されていない」を表現）
- テナントスキーマ接続エラー（インフラ起因） → 503 Service Unavailable（この 1 ケースのみ 503 を残す）

**影響ドキュメント**:
- `docs/design/non-functional/api-authz-multitenant.md` のエラー一覧表
- `docs/design/openapi/openapi.yaml` の responses（`404 Not Found` コンポーネント追加）

---

## 受け入れ条件

```gherkin
Scenario 1: 全ての移行済みハンドラーが tenantContext + requirePermission を通じて動作すること
  Given 認証済み tenant_user のリクエストがある
  When  POST /api/villages にリクエストを送ったとき
  Then  201 Created でそのテナントの村が作成されること

Scenario 2: 旧スキーマファイルが削除されていること
  Given apps/api ディレクトリを確認する
  Then  src/db/schema.ts が存在しないこと
  And   drizzle/ フォルダが存在しないこと

Scenario 3: 存在しないテナントスラッグへのアクセスが 404 を返すこと
  Given servicer_admin の JWT でリクエストしている
  And   リクエストヘッダーに X-Tenant-Id: unknown-slug がある
  When  tenantContext ミドルウェアが実行されたとき
  Then  404 Not Found が返ること（503 ではないこと）

Scenario 4: 停止中テナントへのアクセスが 403 を返すこと
  Given servicer_admin の JWT でリクエストしている
  And   X-Tenant-Id: suspended-tenant のテナントが status='suspended' である
  When  tenantContext ミドルウェアが実行されたとき
  Then  403 Forbidden が返ること
```

---

## 不明点 / 質問

- `createVillage` の `ownerId` が旧スキーマでは `string`（X-User-Id）だったが、テナントスキーマでは `bigint`（`tenantUsers.id`）になる。既存の createVillage 統合テストのシードデータを更新すること。

---

## INVEST チェック

- **Independent**: NG — PBI-SaaS-004 完了後に着手
- **Negotiable**: OK — 移行順序・削除タイミングは調整余地あり
- **Valuable**: OK — 旧スキーマの二重管理解消と全ハンドラーのテナント対応完了
- **Estimable**: OK — 移行パターンは PBI-SaaS-004 で確立済み
- **Small**: 要注意 — 6 ハンドラー + スキーマ削除 + エラーコード統一。TDD で 1 ハンドラーずつ進める
- **Testable**: OK — 各ハンドラーの統合テストで検証可能
