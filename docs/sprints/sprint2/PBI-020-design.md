# PBI-020 設計ドキュメント — フロントエンドフォルダ構成を features 別に再編する

Sprint 2 / 作成日: 2026-05-30

**想定読者**: 実装担当者  
**目的**: ファイル移動とパス更新の全量を確認するリファレンス。実装フェーズ（Phase 3）の作業根拠として使う。  
**スコープ**: `apps/frontend/src` 内のソース・テストの再配置と import パス更新のみ。ロジック変更・機能追加は含まない。

---

## 背景と課題

`apps/frontend/src/` が技術レイヤー別フォルダ構成になっている。

```
src/
  components/village/  components/resident/
  views/               stores/
  composables/
```

これは `.claude/instructions/frontend.md §11`（`src/features/<機能>/` に UI・データ取得・型・schema をまとめる）および `.claude/instructions/folder-structure.md §2`（アプリ内部は機能別）に違反している。

また以下の scaffold 残骸ファイルが本番コードと混在している。

- `components/HelloWorld.vue` / `TheWelcome.vue` / `WelcomeItem.vue` / `icons/`
- `components/__tests__/HelloWorld.spec.ts`
- `stores/counter.ts`

本 PBI はロジックを変更せず、ファイル移動・パス更新・scaffold 削除のみで規約違反を解消する。

---

## 変更方針

- ロジック変更なし。純粋なファイル移動と import パスの更新のみ
- 移動後の構成: `src/features/<機能>/` に View・コンポーネント・ストア・テストを近接配置する
- 横断的ユーティリティは `src/shared/lib/`、サイト共通 UI は `src/shared/ui/` に集約する
- 未使用の scaffold ファイルは削除する

---

## 移動後のフォルダ構成

```
apps/frontend/src/
  features/
    village/
      VillageListView.vue
      VillageCreateView.vue
      VillageCard.vue
      villageStore.ts
      VillageCard.small.spec.ts
      VillageListView.medium.spec.ts
      VillageCreateView.medium.spec.ts
      villageStore.small.spec.ts
    resident/
      ResidentListView.vue
      ResidentCreateView.vue
      VillageResidentListView.vue
      ResidentList.vue
      residentStore.ts
      ResidentListView.medium.spec.ts
      ResidentCreateView.medium.spec.ts
      VillageResidentListView.medium.spec.ts
      residentStore.small.spec.ts
  shared/
    lib/
      useApiState.ts
    ui/
      HomeView.vue
      AboutView.vue
  router/
    index.ts           （維持 — import パスのみ更新）
  mocks/               （維持）
  assets/              （維持）
  main.ts
  App.vue
```

---

## ファイル移動マッピング

### village 機能

| 現在のパス | 移動先 |
|---|---|
| `src/components/village/VillageCard.vue` | `src/features/village/VillageCard.vue` |
| `src/components/village/__tests__/VillageCard.small.spec.ts` | `src/features/village/VillageCard.small.spec.ts` |
| `src/views/VillageListView.vue` | `src/features/village/VillageListView.vue` |
| `src/views/VillageCreateView.vue` | `src/features/village/VillageCreateView.vue` |
| `src/views/__tests__/VillageListView.medium.spec.ts` | `src/features/village/VillageListView.medium.spec.ts` |
| `src/views/__tests__/VillageCreateView.medium.spec.ts` | `src/features/village/VillageCreateView.medium.spec.ts` |
| `src/stores/village.ts` | `src/features/village/villageStore.ts` ★ファイル名変更 |
| `src/stores/__tests__/village.small.spec.ts` | `src/features/village/villageStore.small.spec.ts` |

### resident 機能

| 現在のパス | 移動先 |
|---|---|
| `src/components/resident/ResidentList.vue` | `src/features/resident/ResidentList.vue` |
| `src/views/ResidentListView.vue` | `src/features/resident/ResidentListView.vue` |
| `src/views/ResidentCreateView.vue` | `src/features/resident/ResidentCreateView.vue` |
| `src/views/VillageResidentListView.vue` | `src/features/resident/VillageResidentListView.vue` |
| `src/views/__tests__/ResidentListView.medium.spec.ts` | `src/features/resident/ResidentListView.medium.spec.ts` |
| `src/views/__tests__/ResidentCreateView.medium.spec.ts` | `src/features/resident/ResidentCreateView.medium.spec.ts` |
| `src/views/__tests__/VillageResidentListView.medium.spec.ts` | `src/features/resident/VillageResidentListView.medium.spec.ts` |
| `src/stores/resident.ts` | `src/features/resident/residentStore.ts` ★ファイル名変更 |
| `src/stores/__tests__/resident.small.spec.ts` | `src/features/resident/residentStore.small.spec.ts` |

### shared 整理

| 現在のパス | 移動先 |
|---|---|
| `src/composables/useApiState.ts` | `src/shared/lib/useApiState.ts` |
| `src/views/HomeView.vue` | `src/shared/ui/HomeView.vue` |
| `src/views/AboutView.vue` | `src/shared/ui/AboutView.vue` |

### scaffold 削除（ロジックなし・未参照）

| 削除対象 |
|---|
| `src/components/HelloWorld.vue` |
| `src/components/TheWelcome.vue` |
| `src/components/WelcomeItem.vue` |
| `src/components/icons/` （ディレクトリごと） |
| `src/components/__tests__/HelloWorld.spec.ts` |
| `src/stores/counter.ts` |

---

## import パス変換ルール

### villageStore.ts（旧 `stores/village.ts`）

| 変換前 | 変換後 |
|---|---|
| `'../composables/useApiState'` | `'@/shared/lib/useApiState'` |

### residentStore.ts（旧 `stores/resident.ts`）

| 変換前 | 変換後 |
|---|---|
| `'../composables/useApiState'` | `'@/shared/lib/useApiState'` |

### village 機能の View・コンポーネント（`@/` エイリアス）

| 変換前 | 変換後 |
|---|---|
| `@/stores/village` | `@/features/village/villageStore` |
| `@/components/village/VillageCard.vue` | `@/features/village/VillageCard.vue` |

### resident 機能の View・コンポーネント（`@/` エイリアス）

| 変換前 | 変換後 |
|---|---|
| `@/stores/resident` | `@/features/resident/residentStore` |
| `@/components/resident/ResidentList.vue` | `@/features/resident/ResidentList.vue` |

### router/index.ts（相対パス）

| 変換前 | 変換後 |
|---|---|
| `'../views/HomeView.vue'` | `'../shared/ui/HomeView.vue'` |
| `'../views/AboutView.vue'` | `'../shared/ui/AboutView.vue'` |
| `'../views/VillageListView.vue'` | `'../features/village/VillageListView.vue'` |
| `'../views/VillageCreateView.vue'` | `'../features/village/VillageCreateView.vue'` |
| `'../views/ResidentListView.vue'` | `'../features/resident/ResidentListView.vue'` |
| `'../views/ResidentCreateView.vue'` | `'../features/resident/ResidentCreateView.vue'` |
| `'../views/VillageResidentListView.vue'` | `'../features/resident/VillageResidentListView.vue'` |

### テストファイル内の import（移動後の相対パスが変わるもの）

各テストファイルは実装ファイルと同一ディレクトリに移動するため、以下のパターンで相対パスが変わる。

**village テスト（旧 `views/__tests__/` or `stores/__tests__/`）:**

| 変換前 | 変換後 |
|---|---|
| `@/stores/village` | `@/features/village/villageStore` |
| `@/components/village/VillageCard.vue` | `@/features/village/VillageCard.vue` |
| `@/views/VillageListView.vue` 等（存在する場合） | `@/features/village/VillageListView.vue` |

**resident テスト:**

| 変換前 | 変換後 |
|---|---|
| `@/stores/resident` | `@/features/resident/residentStore` |
| `@/components/resident/ResidentList.vue` | `@/features/resident/ResidentList.vue` |
| `@/views/ResidentListView.vue` 等（存在する場合） | `@/features/resident/ResidentListView.vue` |

---

## 設定ファイル確認

### vitest.config.ts

`@/` エイリアスは `src/` を指すため変更不要。ファイルの include パターンがワイルドカード（`src/**`）であれば変更不要。

### tsconfig.json

`@/` エイリアスは `src/` を指すため変更不要。

---

## 受け入れ条件

以下をすべて満たすことで完了とする（PBI-020 の Gherkin に対応）。

1. `cd apps/frontend && npm run test` で全テスト通過（スキップ中の PBI-017 対象を除く）
2. `cd apps/frontend && npm run lint` でエラー 0 件
3. `cd apps/frontend && npm run build` でビルドエラー 0 件
4. `npm run test:e2e` で全シナリオ通過

---

## 変更履歴

| 日付 | 版 | 変更内容 | 担当 |
|---|---|---|---|
| 2026-05-30 | 1.0 | 初版作成 | — |
