---
last_updated: 2026-05-05
---

# フロントエンド スタイルガイド

## 対象読者

フロントエンド担当の開発者。Vue コンポーネント実装時・CSS 追加時に参照すること。

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

## カラーパレット

`apps/frontend/src/assets/base.css` の CSS Custom Properties を上書き・拡張する。

### ブランドカラー（意味を持つ色）

| 変数名 | 値 | 用途 |
|---|---|---|
| `--color-primary` | `#4a7c59` | 主要アクション（ボタン・リンク）。深い森の緑 |
| `--color-primary-hover` | `#3a6347` | primary のホバー状態 |
| `--color-primary-text` | `#ffffff` | primary 背景上のテキスト |
| `--color-accent` | `#c9963d` | 強調・バッジ・アイコン。金の装飾 |
| `--color-accent-text` | `#1a1008` | accent 背景上のテキスト |
| `--color-danger` | `#a63228` | 削除・エラー。赤褐色 |
| `--color-danger-hover` | `#8a2820` | danger のホバー状態 |
| `--color-danger-text` | `#ffffff` | danger 背景上のテキスト |

### 背景・サーフェス

| 変数名 | 値（ライトモード） | 値（ダークモード） | 用途 |
|---|---|---|---|
| `--color-background` | `#f5f0e8` | `#1c1a14` | ページ背景。羊皮紙のオフホワイト |
| `--color-surface` | `#fffdf7` | `#2a2720` | カード・パネル背景 |
| `--color-surface-raised` | `#ffffff` | `#343028` | モーダル・ドロップダウン |
| `--color-border` | `#d4c9b0` | `#4a4438` | 標準ボーダー |
| `--color-border-strong` | `#a89880` | `#6a5e4e` | 強調ボーダー |

### テキスト

| 変数名 | 値（ライトモード） | 値（ダークモード） | 用途 |
|---|---|---|---|
| `--color-text` | `#2c2416` | `#e8e0d0` | 本文テキスト |
| `--color-text-muted` | `#6b5e4a` | `#9a8e7a` | 補助テキスト・プレースホルダー |
| `--color-heading` | `#1a1208` | `#f0e8d8` | 見出し |

### ステータスカラー

| 変数名 | 値 | 用途 |
|---|---|---|
| `--color-success` | `#2d6e3e` | 成功メッセージ |
| `--color-success-bg` | `#eaf4ee` | 成功メッセージ背景 |
| `--color-warning` | `#8a6020` | 警告メッセージ |
| `--color-warning-bg` | `#fdf5e0` | 警告メッセージ背景 |
| `--color-error` | `#a63228` | エラーメッセージ |
| `--color-error-bg` | `#faeaea` | エラーメッセージ背景 |

---

## タイポグラフィ

### フォントファミリー

```css
--font-body:    'Inter', 'Hiragino Kaku Gothic ProN', 'Meiryo', system-ui, sans-serif;
--font-heading: 'Cinzel', 'Georgia', 'Times New Roman', serif;  /* 見出し専用 */
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;
```

`Cinzel` は Google Fonts から読み込む。見出し（h1〜h3）にのみ使用し、本文には使わない。

### スケール

| 変数名 | サイズ | ウェイト | 用途 |
|---|---|---|---|
| `--text-xs` | 12px | 400 | バッジ・ラベル・補足 |
| `--text-sm` | 14px | 400 | 補助テキスト・表のセル |
| `--text-base` | 16px | 400 | 本文（基準） |
| `--text-lg` | 18px | 500 | 強調本文・小見出し |
| `--text-xl` | 22px | 600 | セクション見出し（h3） |
| `--text-2xl` | 28px | 700 | ページ見出し（h2） |
| `--text-3xl` | 36px | 700 | 画面タイトル（h1）|

### 行間

本文: `1.7`（日本語混在のため広めに設定）
見出し: `1.3`

---

## スペーシング

8px グリッドを基準とする。

| 変数名 | 値 | 用途の例 |
|---|---|---|
| `--space-1` | 4px | アイコンとテキストの間 |
| `--space-2` | 8px | インライン要素間・パディング最小 |
| `--space-3` | 12px | フォームラベルとフィールドの間 |
| `--space-4` | 16px | コンポーネント内パディング基準 |
| `--space-6` | 24px | カード内パディング・セクション間 |
| `--space-8` | 32px | セクション間・大きな余白 |
| `--space-12` | 48px | ページセクション間 |
| `--space-16` | 64px | ページトップ余白 |

---

## ボーダーと角丸

| 変数名 | 値 | 用途 |
|---|---|---|
| `--radius-sm` | 4px | バッジ・タグ |
| `--radius-md` | 8px | ボタン・入力フィールド |
| `--radius-lg` | 12px | カード |
| `--radius-xl` | 16px | モーダル |
| `--border-width` | 1px | 標準ボーダー |

---

## コンポーネントパターン

### ボタン

```html
<!-- 主要アクション（村を作成する など） -->
<button class="btn btn-primary">村を作成する</button>

<!-- 中立アクション（キャンセル など） -->
<button class="btn btn-secondary">キャンセル</button>

<!-- 危険アクション（削除 など） -->
<button class="btn btn-danger">削除する</button>

<!-- ローディング状態 -->
<button class="btn btn-primary" disabled aria-busy="true">
  <span class="btn-spinner" aria-hidden="true"></span>
  作成中...
</button>
```

**ルール:**
- 1画面に `btn-primary` は1つまで（主アクションを明確にする）
- 送信中は `disabled` + `aria-busy="true"` を必ず付与する
- アイコンのみのボタンは `aria-label` を付与する

### フォームフィールド

```html
<div class="form-field">
  <label class="form-label" for="village-name">
    村名
    <span class="form-required" aria-label="必須">*</span>
  </label>
  <input
    id="village-name"
    class="form-input"
    type="text"
    maxlength="128"
    aria-describedby="village-name-error"
  />
  <p id="village-name-error" class="form-error" role="alert">
    村名を入力してください
  </p>
</div>
```

**ルール:**
- `label` は必ず対応する `input` の `id` を `for` で参照する
- エラーメッセージは `role="alert"` + `aria-describedby` で支援技術に伝える
- エラー状態の `input` には `aria-invalid="true"` を付与する

### カード

```html
<!-- 村カード -->
<article class="card">
  <header class="card-header">
    <h3 class="card-title">エルムの村</h3>
  </header>
  <div class="card-body">
    <p class="card-meta">作成日: 2026-05-05</p>
  </div>
  <footer class="card-footer">
    <a href="/villages/1" class="btn btn-secondary btn-sm">詳細を見る</a>
  </footer>
</article>
```

### アラート・フィードバック

```html
<!-- 成功 -->
<div class="alert alert-success" role="status">村を作成しました。</div>

<!-- エラー -->
<div class="alert alert-error" role="alert">入力内容を確認してください。</div>

<!-- 警告 -->
<div class="alert alert-warning" role="status">この操作は取り消せません。</div>
```

---

## Vue コンポーネント命名規則

| 種別 | 命名形式 | 例 |
|---|---|---|
| ページ（View） | `<名詞>View.vue` | `VillageListView.vue` |
| 機能コンポーネント | `<名詞><動作>.vue` or `<名詞><説明>.vue` | `VillageCard.vue`, `VillageCreateForm.vue` |
| 汎用UIコンポーネント | `Base<名前>.vue` | `BaseButton.vue`, `BaseInput.vue` |
| レイアウトコンポーネント | `The<名前>.vue` | `TheHeader.vue`, `TheSidebar.vue` |

**ファイル配置:**

```
src/
├── views/          # ルーターが参照するページコンポーネント
├── components/
│   ├── base/       # BaseButton.vue など汎用UI
│   ├── village/    # VillageCard.vue など機能別
│   └── layout/     # TheHeader.vue など
├── stores/         # Pinia ストア（<対象名>.ts）
├── composables/    # use<機能名>.ts
└── types/          # 型定義
```

### Props / Emits の規約

```typescript
// Props は defineProps で型定義を明示する
const props = defineProps<{
  village: Village
  isLoading?: boolean
}>()

// Emits はイベント名をケバブケースで定義する
const emit = defineEmits<{
  'village-created': [village: Village]
  'form-cancel': []
}>()
```

---

## CSS 設計方針

- グローバルスタイルは `src/assets/base.css`（変数定義）と `src/assets/main.css`（リセット・レイアウト）のみ
- コンポーネント固有のスタイルは `<style scoped>` に書く
- `scoped` の外に書く必要がある場合は `:deep()` を使用し、その理由をコメントで明記する
- クラス名は BEM に近い平易な命名を使用する（厳密な BEM でなくてよい）
- CSS Custom Properties（変数）は必ず `base.css` で定義したものを使用する。マジックナンバーの直書き禁止

---

## アクセシビリティ最低基準

- テキストと背景のコントラスト比: 本文は **4.5:1 以上**、大きな見出しは **3:1 以上**
- キーボード操作: Tab キーですべての操作ができること
- フォーカスリング: `:focus-visible` を非表示にしない
- 画像・アイコン: 意味を持つものは `alt` または `aria-label` を付与する

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成。カラーパレット・タイポグラフィ・スペーシング・コンポーネントパターン・命名規則を定義 |
