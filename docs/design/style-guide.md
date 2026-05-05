---
last_updated: 2026-05-05
---

# フロントエンド スタイルガイド

## 対象読者

フロントエンド担当の開発者。Vue コンポーネント実装時・Vuetify コンポーネント選定時に参照すること。

---

## デザインコンセプト

**「ファンタジー世界の管理台帳」**

fantasy-line は「村を生きたシミュレーションとして体験する」サービスである。
UIは世界観を感じさせつつも、管理ツールとして情報が読みやすく操作しやすい状態を保つこと。

| 軸 | 方針 |
|---|---|
| 世界観 | 中世ファンタジーを想起させる落ち着いたアースカラー |
| 実用性 | テキストコントラストを優先し、長時間使用しても疲れない配色 |
| 複雑さ | 装飾は最小限。情報の階層をタイポグラフィとスペーシングで表現する |

---

## Vuetify 採用方針

UI フレームワークとして **Vuetify 4**（最新安定版: 4.0.6）を使用する。

- **Material Design 3（MD3）** がデフォルト。MD2 への戻しは行わない
- テーマシステムでアースカラーを定義し、MD3 のデフォルト配色を上書きする
- Vuetify に存在するコンポーネントは自作しない
- Vuetify のコンポーネントで対応できない場合のみ `scoped` CSS で追加スタイルを当てる

### インストール

```bash
npm install vuetify vite-plugin-vuetify
```

### Vite 設定（`vite.config.ts`）

```typescript
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),  // コンポーネントの自動インポートを有効化
  ],
})
```

---

## カラーパレット

Vuetify のテーマシステムで定義する。`main.ts` の `createVuetify()` に以下を設定すること。

### Vuetify テーマ設定（実装起点）

```typescript
// apps/frontend/src/main.ts
import { createVuetify } from 'vuetify'
import 'vuetify/styles'

const vuetify = createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        colors: {
          primary:    '#4a7c59',  // 深い森の緑 — 主要アクション
          secondary:  '#c9963d',  // 金の装飾 — アクセント・強調
          error:      '#a63228',  // 赤褐色 — 削除・エラー
          success:    '#2d6e3e',  // 成功
          warning:    '#8a6020',  // 警告
          background: '#f5f0e8',  // 羊皮紙のオフホワイト
          surface:    '#fffdf7',  // カード・パネル背景
        },
      },
      dark: {
        colors: {
          primary:    '#4a7c59',
          secondary:  '#c9963d',
          error:      '#a63228',
          success:    '#2d6e3e',
          warning:    '#8a6020',
          background: '#1c1a14',
          surface:    '#2a2720',
        },
      },
    },
  },
})
```

### カラーの意味と用途

| Vuetify カラー名 | 値 | 用途 |
|---|---|---|
| `primary` | `#4a7c59` | 主要アクションボタン・リンク・フォーカスリング |
| `secondary` | `#c9963d` | バッジ・強調ラベル・アイコンアクセント |
| `error` | `#a63228` | 削除ボタン・エラーメッセージ・バリデーションエラー |
| `success` | `#2d6e3e` | 成功通知 |
| `warning` | `#8a6020` | 警告通知 |
| `background` | `#f5f0e8` | ページ背景 |
| `surface` | `#fffdf7` | カード・ダイアログ背景 |

---

## タイポグラフィ

### フォントファミリー

```css
/* apps/frontend/src/assets/main.css に追加 */
@import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap');

:root {
  --font-heading: 'Cinzel', 'Georgia', serif;
}

h1, h2, h3 {
  font-family: var(--font-heading);
}
```

`Cinzel` は見出し（h1〜h3）のみ使用する。本文・UI テキストは Vuetify のデフォルト（Roboto / システムフォント）を使用する。

### Vuetify タイポグラフィクラス（MD3）

Vuetify 4 は MD3 のタイポグラフィスケールを使用する。コンポーネント内でのテキスト装飾には以下の utility クラスを使用する。

| クラス | サイズ目安 | 用途 |
|---|---|---|
| `text-display-small` | 36px | 画面タイトル（h1 相当） |
| `text-headline-large` | 32px | ページ見出し（h2 相当） |
| `text-headline-medium` | 28px | セクション見出し（h3 相当） |
| `text-title-large` | 22px | カードタイトル・強調 |
| `text-title-medium` | 16px | 小見出し |
| `text-body-large` | 16px | 本文（基準） |
| `text-body-medium` | 14px | 補助テキスト・表のセル |
| `text-body-small` | 12px | 注釈 |
| `text-label-large` | 14px | ボタンラベル・フォームラベル |
| `text-label-small` | 11px | バッジ・タグ |
| `font-weight-bold` | — | 太字 |
| `text-medium-emphasis` | — | 補助テキストの色（muted） |
| `text-disabled` | — | 無効状態のテキスト |

---

## スペーシング

Vuetify の spacing utility（`ma-*` / `pa-*`）を使用する。1単位 = 4px。

| クラス例 | 値 | 用途の例 |
|---|---|---|
| `pa-1` / `ma-1` | 4px | アイコンとテキストの隙間 |
| `pa-2` / `ma-2` | 8px | 密集したリスト項目 |
| `pa-4` / `ma-4` | 16px | カード内パディング基準 |
| `pa-6` / `ma-6` | 24px | セクション間の余白 |
| `pa-8` / `ma-8` | 32px | ページ上部の余白 |

方向指定: `mt-` (top)、`mb-` (bottom)、`ml-` (left)、`mr-` (right)、`mx-` (水平)、`my-` (垂直)

---

## コンポーネントパターン

### ボタン

```html
<!-- 主要アクション（1画面に1つまで） -->
<v-btn color="primary" @click="onCreate">村を作成する</v-btn>

<!-- 中立アクション -->
<v-btn variant="outlined" @click="onCancel">キャンセル</v-btn>

<!-- 危険アクション -->
<v-btn color="error" @click="onDelete">削除する</v-btn>

<!-- ローディング状態 -->
<v-btn color="primary" :loading="isSubmitting" @click="onCreate">
  村を作成する
</v-btn>
```

**ルール:**
- 1画面に `color="primary"` のボタンは1つまで
- ローディング中は `:loading="true"` を使用する（`disabled` の手動設定は不要）
- アイコンのみのボタンは `aria-label` を付与する
- Vuetify 4 では `v-btn` のデフォルト `text-transform: uppercase` が廃止済み。大文字化が必要な場合は明示的に CSS を当てる

### フォームフィールド

```html
<v-text-field
  v-model="villageName"
  label="村名"
  :rules="[rules.required, rules.maxLength]"
  maxlength="128"
  counter
  required
/>
```

```typescript
const rules = {
  required: (v: string) => !!v || '村名を入力してください',
  maxLength: (v: string) => v.length <= 128 || '村名は128文字以内で入力してください',
}
```

**ルール:**
- バリデーションルールは `packages/schema` の Zod スキーマと一致させる
- `counter` を付与して文字数を視覚的にフィードバックする
- フィールドのエラーメッセージは Vuetify の `:rules` に委ねる（独自 `<p>` タグは使わない）

### カード

```html
<v-card>
  <v-card-title>エルムの村</v-card-title>
  <v-card-subtitle>作成日: 2026-05-05</v-card-subtitle>
  <v-card-actions>
    <v-btn variant="text" color="primary" :to="`/villages/${village.id}`">
      詳細を見る
    </v-btn>
  </v-card-actions>
</v-card>
```

### アラート・スナックバー

```html
<!-- ページ内固定アラート（フォームエラーなど） -->
<v-alert type="error" variant="tonal">入力内容を確認してください。</v-alert>
<v-alert type="success" variant="tonal">村を作成しました。</v-alert>

<!-- 一時的な通知はスナックバーを使用 -->
<v-snackbar v-model="showSnackbar" color="success">
  村を作成しました。
</v-snackbar>
```

**ルール:**
- フォームのエラーサマリーは `v-alert type="error"`
- 操作完了の一時通知は `v-snackbar`
- 警告確認ダイアログは `v-dialog` + `v-card` で構成する

### リスト・テーブル

```html
<!-- 村一覧（カードグリッド） -->
<v-container>
  <v-row>
    <v-col v-for="village in villages" :key="village.id" cols="12" sm="6" md="4">
      <VillageCard :village="village" />
    </v-col>
  </v-row>
</v-container>

<!-- 空状態 -->
<v-empty-state
  icon="mdi-castle"
  title="村がありません"
  text="最初の村を作成しましょう。"
>
  <template #actions>
    <v-btn color="primary" to="/villages/new">村を作成する</v-btn>
  </template>
</v-empty-state>
```

---

## Vue コンポーネント命名規則

| 種別 | 命名形式 | 例 |
|---|---|---|
| ページ（View） | `<名詞>View.vue` | `VillageListView.vue` |
| 機能コンポーネント | `<名詞><説明>.vue` | `VillageCard.vue`, `VillageCreateForm.vue` |
| 汎用UIコンポーネント | `Base<名前>.vue` | `BaseConfirmDialog.vue`（Vuetify にない独自UIのみ） |
| レイアウトコンポーネント | `The<名前>.vue` | `TheHeader.vue`, `TheNavigation.vue` |

**ファイル配置:**

```
src/
├── views/          # ルーターが参照するページコンポーネント
├── components/
│   ├── village/    # VillageCard.vue など機能別
│   ├── base/       # BaseConfirmDialog.vue など Vuetify にない独自UI のみ
│   └── layout/     # TheHeader.vue など
├── stores/         # Pinia ストア（<対象名>.ts）
├── composables/    # use<機能名>.ts
└── types/          # 型定義
```

Vuetify のコンポーネント（`v-btn`、`v-text-field` など）は `base/` に再ラップしない。
直接使用する。

### Props / Emits の規約

```typescript
const props = defineProps<{
  village: Village
  isLoading?: boolean
}>()

const emit = defineEmits<{
  'village-created': [village: Village]
  'form-cancel': []
}>()
```

---

## CSS 設計方針

- **Vuetify のコンポーネントを優先する。** スタイルを当てるために独自コンポーネントを作らない
- **追加 CSS は最小限に。** Vuetify の props・variant・color で解決できるものは CSS を書かない
- **コンポーネント固有の追加スタイルは `<style scoped>` に書く**
- **`scoped` の外へのスタイル適用が必要な場合は `:deep()` を使い、その理由をコメントで明記する**
- **テーマカラー外の色のハードコード禁止。** 必ず `color="primary"` 等の Vuetify カラー名を使用する
- **グローバル CSS は `src/assets/main.css` のみ。** 見出しフォント(`Cinzel`)の適用もここで行う

---

## アクセシビリティ

Vuetify は ARIA 属性をコンポーネントに組み込んでいるが、以下は開発者が責任を持つこと。

- テキストと背景のコントラスト比: 本文 **4.5:1 以上**、大見出し **3:1 以上**
- アイコンのみのボタン: `aria-label` を必ず付与する（`<v-btn icon aria-label="削除">` 等）
- フォームの `:rules` エラーは Vuetify が `aria-describedby` を自動設定するため、独自エラー要素を重複追加しない

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成（Vuetify 4 / MD3 採用。カラーパレット・タイポグラフィ・コンポーネントパターン・命名規則を定義） |
