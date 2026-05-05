---
last_updated: 2026-05-05
---

# 画面設計 — 村管理（開発者向け）

## 対象読者

フロントエンド担当の開発者。実装前に本ドキュメントと [スタイルガイド](../style-guide.md) を合わせて確認すること。
ユーザー視点の振る舞いは [PO向け画面設計](./village.md) を参照すること。

---

## ソート順の技術仕様

`listVillages` ハンドラーのクエリに `ORDER BY created_at DESC` を付与する。

```typescript
const result = await db
  .select()
  .from(villages)
  .where(eq(villages.ownerId, ownerId))
  .orderBy(desc(villages.createdAt));
```

フロントエンド側でのソートは行わない。将来ページネーションが入った場合、フロントソートはページをまたいで正確に機能しないため。

---

## 村一覧画面（`VillageListView.vue`）

### コンポーネント構成

```
VillageListView.vue
└── v-container
    ├── v-row（ページヘッダー行）
    │   ├── v-col: <h1 class="text-headline-large">村一覧</h1>
    │   └── v-col class="text-right"
    │       └── v-btn color="primary" to="/villages/new"「村を作成する」
    ├── v-alert type="error"（isError 時のみ表示）
    ├── v-progress-circular（isLoading 時のみ表示）
    ├── v-empty-state（villages.length === 0 かつ !isLoading 時のみ表示）
    └── v-row（カードグリッド、villages.length > 0 かつ !isLoading 時のみ表示）
        └── v-col[cols="12" sm="6" md="4"] × villages.length
            └── VillageCard.vue
```

### 状態管理（Pinia ストア連携）

```typescript
// onMounted で fetchVillages を呼ぶ
const store = useVillageStore()
onMounted(() => store.fetchVillages())

const { villages, isLoading, error } = storeToRefs(store)
const isError = computed(() => error.value !== null)
```

---

## VillageCard コンポーネント（`VillageCard.vue`）

### Props

```typescript
defineProps<{ village: VillageResponse }>()
```

型 `VillageResponse` は `@repo/schema` からインポートする。

### テンプレート構成

```html
<v-card>
  <v-card-title class="text-title-large">{{ village.name }}</v-card-title>
  <v-card-subtitle class="text-body-medium text-medium-emphasis">
    作成日: {{ formattedDate }}
  </v-card-subtitle>
</v-card>
```

### 日付フォーマット

```typescript
const formattedDate = computed(() =>
  new Date(village.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
)
```

`village.createdAt` は ISO 8601 文字列（API レスポンス）であるため `new Date()` でパースする。

---

## 村作成画面（`VillageCreateView.vue`）

### コンポーネント構成

```
VillageCreateView.vue
└── v-container（style="max-width: 600px"）
    ├── <h1 class="text-headline-large">村を作成する</h1>
    ├── v-form（ref="form"）
    │   ├── v-text-field（村名入力）
    │   └── v-row
    │       ├── v-col: v-btn variant="outlined" @click="onCancel"「キャンセル」
    │       └── v-col: v-btn color="primary" :loading="isSubmitting" @click="onSubmit"「作成する」
    └── v-alert type="error" v-if="apiError"（APIエラー時のみ表示）
```

### フォームフィールド詳細

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
  required: (v: string) => !!v.trim() || '村名を入力してください',
  maxLength: (v: string) => v.length <= 128 || '村名は128文字以内で入力してください',
}
```

バリデーションルールは `packages/schema` の `CreateVillageSchema`（`z.string().min(1).max(128)`）と一致させること。

### 送信フロー

```typescript
async function onSubmit() {
  const { valid } = await form.value!.validate()
  if (!valid) return

  isSubmitting.value = true
  apiError.value = null
  try {
    await store.createVillage(villageName.value)
    router.push('/villages')
  } catch (e) {
    apiError.value = e instanceof Error ? e.message : '村の作成に失敗しました。再試行してください。'
  } finally {
    isSubmitting.value = false
  }
}
```

### エラー表示の使い分け

| エラー種別 | 表示場所 | Vuetify コンポーネント |
|---|---|---|
| 必須未入力・文字数超過 | フィールド直下 | `v-text-field` の `:rules` |
| API バリデーションエラー (400) | フォーム下部 | `v-alert type="error"` |
| ネットワークエラー・その他 | フォーム下部 | `v-alert type="error"` |

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成。村一覧・村作成の開発者向け画面設計（コンポーネント構成・Pinia 連携・バリデーション仕様） |
