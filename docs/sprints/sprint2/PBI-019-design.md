# PBI-019 設計ドキュメント — API フォルダ構成をfeature別に再編する

Sprint 2 / 作成日: 2026-05-30

**想定読者**: 実装担当者  
**目的**: ファイル移動とパス更新の全量を確認するリファレンス。実装フェーズ（Phase 3）の作業根拠として使う。  
**スコープ**: `apps/api` 内のソース・テストの再配置、設定ファイルの更新、CDKハンドラーパスの更新のみ。ロジック変更・機能追加は含まない。

---

## 背景と課題

`apps/api/src/handlers/` という技術レイヤー別トップレベルフォルダが存在する。
これはプロジェクト規約（`.claude/instructions/api.md §12`、`.claude/instructions/folder-structure.md §2`）が定める「機能別配置」に違反している。

また `apps/api/tests/` にテストが分離されており、「関連ファイルは近接配置する」規約（`.claude/instructions/folder-structure.md §4`）にも違反している。

本PBIはロジックを変更せず、ファイル移動とimportパスの更新のみで両規約違反を解消する。

## 変更方針

- ロジック変更なし。純粋なファイル移動と参照パスの更新のみ
- 移動後の構成: `apps/api/src/<feature>/` に handler・テスト・共通ヘルパーを近接配置する
- 横断的なユーティリティ（auth・http・logger・テストヘルパー）は `apps/api/src/shared/` に集約する

## 移動後のフォルダ構成

```
apps/api/src/
  village/
    createVillage.ts
    createVillage.small.test.ts
    createVillage.medium.test.ts
    listVillages.ts
    listVillages.medium.test.ts
    village.integration.test.ts
  resident/
    createResident.ts
    createResident.small.test.ts
    createResident.medium.test.ts
    listResidents.ts
    listResidents.medium.test.ts
    listVillageResidents.ts
    listVillageResidents.small.test.ts
    listVillageResidents.medium.test.ts
    resident.integration.test.ts
  item/
    createItem.ts
    createItem.small.test.ts
    createItem.medium.test.ts
    items.ts
    items.medium.test.ts
  echo/
    echo.ts
    echo.small.test.ts
  shared/
    auth.ts
    auth.test.ts
    http.ts
    logger.ts
    db-mock.ts
    mysql-setup.ts
    use-mysql-container.ts
  db/          （変更なし）
```

---

## ファイル移動マッピング

### ソースファイル

| 現在のパス | 移動先 |
|---|---|
| `apps/api/src/handlers/createVillage.ts` | `apps/api/src/village/createVillage.ts` |
| `apps/api/src/handlers/listVillages.ts` | `apps/api/src/village/listVillages.ts` |
| `apps/api/src/handlers/createResident.ts` | `apps/api/src/resident/createResident.ts` |
| `apps/api/src/handlers/listResidents.ts` | `apps/api/src/resident/listResidents.ts` |
| `apps/api/src/handlers/listVillageResidents.ts` | `apps/api/src/resident/listVillageResidents.ts` |
| `apps/api/src/handlers/createItem.ts` | `apps/api/src/item/createItem.ts` |
| `apps/api/src/handlers/items.ts` | `apps/api/src/item/items.ts` |
| `apps/api/src/handlers/echo.ts` | `apps/api/src/echo/echo.ts` |
| `apps/api/src/auth.ts` | `apps/api/src/shared/auth.ts` |
| `apps/api/src/http.ts` | `apps/api/src/shared/http.ts` |
| `apps/api/src/logger.ts` | `apps/api/src/shared/logger.ts` |

### テストファイル

| 現在のパス | 移動先 |
|---|---|
| `apps/api/tests/handlers/createVillage.small.test.ts` | `apps/api/src/village/createVillage.small.test.ts` |
| `apps/api/tests/handlers/createVillage.medium.test.ts` | `apps/api/src/village/createVillage.medium.test.ts` |
| `apps/api/tests/handlers/listVillages.medium.test.ts` | `apps/api/src/village/listVillages.medium.test.ts` |
| `apps/api/tests/handlers/createResident.small.test.ts` | `apps/api/src/resident/createResident.small.test.ts` |
| `apps/api/tests/handlers/createResident.medium.test.ts` | `apps/api/src/resident/createResident.medium.test.ts` |
| `apps/api/tests/handlers/listResidents.medium.test.ts` | `apps/api/src/resident/listResidents.medium.test.ts` |
| `apps/api/tests/handlers/listVillageResidents.small.test.ts` | `apps/api/src/resident/listVillageResidents.small.test.ts` |
| `apps/api/tests/handlers/listVillageResidents.medium.test.ts` | `apps/api/src/resident/listVillageResidents.medium.test.ts` |
| `apps/api/tests/handlers/createItem.small.test.ts` | `apps/api/src/item/createItem.small.test.ts` |
| `apps/api/tests/handlers/createItem.medium.test.ts` | `apps/api/src/item/createItem.medium.test.ts` |
| `apps/api/tests/handlers/items.medium.test.ts` | `apps/api/src/item/items.medium.test.ts` |
| `apps/api/tests/handlers/echo.small.test.ts` | `apps/api/src/echo/echo.small.test.ts` |
| `apps/api/tests/small/auth.test.ts` | `apps/api/src/shared/auth.test.ts` |
| `apps/api/tests/integration/village.integration.test.ts` | `apps/api/src/village/village.integration.test.ts` |
| `apps/api/tests/integration/resident.integration.test.ts` | `apps/api/src/resident/resident.integration.test.ts` |
| `apps/api/tests/helpers/db-mock.ts` | `apps/api/src/shared/db-mock.ts` |
| `apps/api/tests/helpers/mysql-setup.ts` | `apps/api/src/shared/mysql-setup.ts` |
| `apps/api/tests/helpers/use-mysql-container.ts` | `apps/api/src/shared/use-mysql-container.ts` |

---

## importパス変換ルール

### ハンドラーファイル（`src/village/`・`src/resident/`・`src/item/`・`src/echo/`）

移動前は `src/handlers/*.ts` に置かれており、共通ユーティリティへの相対パスが変わる。

| 変換前 | 変換後 |
|---|---|
| `import ... from '../auth'` | `import ... from '../shared/auth'` |
| `import ... from '../http'` | `import ... from '../shared/http'` |
| `import ... from '../logger'` | `import ... from '../shared/logger'` |
| `import ... from '../db/client'` | `import ... from '../db/client'`（変更なし） |
| `import ... from '../db/schema'` | `import ... from '../db/schema'`（変更なし） |

### テストファイル（各feature内）

テストファイルはhandlerと同じディレクトリに移動するため、handler自身への相対パスが変わる。

**village feature の例:**
- 変換前（`tests/handlers/createVillage.medium.test.ts`）: `import ... from '../../src/handlers/createVillage'`
- 変換後（`src/village/createVillage.medium.test.ts`）: `import ... from './createVillage'`

**共有ヘルパーへのパス:**
- 変換前: `import ... from '../helpers/db-mock'`
- 変換後: `import ... from '../shared/db-mock'`

---

## 設定ファイル更新

### vitest 設定ファイル（3ファイル）

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `apps/api/vitest.config.ts` | `include: ['tests/**/*.test.ts']` | `include: ['src/**/*.test.ts']` |
| `apps/api/vitest.small.config.ts` | `include: ['tests/**/*.small.test.ts']` | `include: ['src/**/*.small.test.ts']` |
| `apps/api/vitest.medium.config.ts` | `include: ['tests/**/*.medium.test.ts']` | `include: ['src/**/*.medium.test.ts']` |

### tsconfig.json

`tests/` ディレクトリが不要になるため `include` から削除する。

| ファイル | 変更前 | 変更後 |
|---|---|---|
| `apps/api/tsconfig.json` | `"include": ["src", "tests"]` | `"include": ["src"]` |

---

## CDKハンドラーパス更新

`infra/lib/infra-stack.ts` 内のLambda handler参照パスを7箇所更新する。

| 変換前 | 変換後 |
|---|---|
| `src/handlers/echo.ts` | `src/echo/echo.ts` |
| `src/handlers/items.ts` | `src/item/items.ts` |
| `src/handlers/createVillage.ts` | `src/village/createVillage.ts` |
| `src/handlers/listVillages.ts` | `src/village/listVillages.ts` |
| `src/handlers/createResident.ts` | `src/resident/createResident.ts` |
| `src/handlers/listResidents.ts` | `src/resident/listResidents.ts` |
| `src/handlers/listVillageResidents.ts` | `src/resident/listVillageResidents.ts` |

---

## 受け入れ条件

以下をすべて満たすことで完了とする。

1. `npm run test`（`apps/api` ディレクトリ）で全テスト通過
2. `npm run lint`（`apps/api` ディレクトリ）でエラー0件
3. `cd infra && npm run build` でビルドエラー0件

---

## 変更履歴

| 日付 | 版 | 変更内容 | 担当 |
|---|---|---|---|
| 2026-05-30 | 1.0 | 初版作成 | — |
