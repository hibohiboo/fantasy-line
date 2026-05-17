---
last_updated: 2026-05-06
---

# 画面設計 — 住人管理（開発者向け）

## 対象読者

フロントエンド担当の開発者。実装前に本ドキュメントと [スタイルガイド](../../style-guide.md) を合わせて確認すること。
ユーザー視点の振る舞いは [PO向け画面設計](../../screen/resident.md) を参照すること。

---

## ソート順の技術仕様

すべての住人一覧は `name_kana ASC` でソートする。
APIハンドラーのクエリに `ORDER BY name_kana ASC` を付与する。

```typescript
const result = await db
  .select()
  .from(residents)
  .where(eq(residents.villageId, villageId))
  .orderBy(asc(residents.nameKana));
```

フロントエンド側でのソートは行わない。将来ページネーションが入った場合、フロントソートはページをまたいで正確に機能しないため。

---

## 住人一覧画面（`ResidentListView.vue`）

### コンポーネント構成

```
ResidentListView.vue
└── v-container
    ├── v-row（ページヘッダー行）
    │   ├── v-col: <h1 class="text-headline-large">住人一覧</h1>
    │   └── v-col class="text-right"
    │       └── v-btn color="primary" to="/residents/new"「住人を追加する」
    ├── v-alert type="error"（isError 時のみ表示）
    ├── v-progress-circular（isLoading 時のみ表示）
    ├── v-empty-state（residents.length === 0 かつ !isLoading 時のみ表示）
    └── v-table（residents.length > 0 かつ !isLoading 時のみ表示）
        └── thead / tbody
            └── tr × residents.length
```

### テーブルヘッダー

| カラム | 対応フィールド | スマホ表示 |
|---|---|---|
| 名前 | `name` | 表示 |
| 読み | `nameKana` | 非表示（`d-none d-sm-table-cell`） |
| 生年月日 | `birthDate` | 非表示（`d-none d-sm-table-cell`） |
| 所属村 | `villageName` | 非表示（`d-none d-sm-table-cell`） |

### 状態管理（Pinia ストア連携）

```typescript
// onMounted で fetchResidents を呼ぶ
const store = useResidentStore()
onMounted(() => store.fetchResidents())

const { residents, isLoading, error } = storeToRefs(store)
const isError = computed(() => error.value !== null)
```

### 空状態

```html
<v-empty-state
  icon="mdi-account-group"
  title="住人が登録されていません"
  text="追加してください。"
>
  <template #actions>
    <v-btn color="primary" to="/residents/new">住人を追加する</v-btn>
  </template>
</v-empty-state>
```

---

## 村別住人一覧画面（`VillageResidentListView.vue`）

### コンポーネント構成

```
VillageResidentListView.vue
└── v-container
    ├── v-row（ページヘッダー行）
    │   ├── v-col: <h1 class="text-headline-large">{{ villageName }} の住人一覧</h1>
    │   └── v-col class="text-right"
    │       └── v-btn color="primary" :to="`/residents/new?villageId=${villageId}`"「住人を追加する」
    ├── v-alert type="error"（isError 時のみ表示）
    ├── v-progress-circular（isLoading 時のみ表示）
    ├── v-empty-state（residents.length === 0 かつ !isLoading 時のみ表示）
    └── v-table（residents.length > 0 かつ !isLoading 時のみ表示）
        └── thead / tbody
            └── tr × residents.length（所属村カラムなし）
```

### ルートパラメータ取得

```typescript
const route = useRoute()
const villageId = computed(() => Number(route.params.id))
```

### 状態管理（Pinia ストア連携）

```typescript
const store = useResidentStore()
onMounted(() => store.fetchVillageResidents(villageId.value))

const { villageResidents, isLoading, error } = storeToRefs(store)
const isError = computed(() => error.value !== null)
```

---

## 住人登録画面（`ResidentCreateView.vue`）

### コンポーネント構成

```
ResidentCreateView.vue
└── v-container（style="max-width: 600px"）
    ├── <h1 class="text-headline-large">住人を登録する</h1>
    ├── v-form（ref="form"）
    │   ├── v-text-field（名前入力）
    │   ├── v-text-field（読み入力）
    │   ├── v-text-field（生年月日入力）
    │   ├── v-select（所属村選択）
    │   └── v-row
    │       ├── v-col: v-btn variant="outlined" @click="onCancel"「キャンセル」
    │       └── v-col: v-btn color="primary" :loading="isSubmitting" @click="onSubmit"「登録する」
    └── v-alert type="error" v-if="apiError"（APIエラー時のみ表示）
```

### フォームフィールド詳細

**名前フィールド**

```html
<v-text-field
  v-model="name"
  label="名前"
  :rules="[validateName]"
  maxlength="128"
  counter
  required
/>
```

```typescript
import { CreateResidentSchema } from '@repo/schema'

const nameSchema = CreateResidentSchema.shape.name

function validateName(v: string): true | string {
  const result = nameSchema.safeParse(v)
  if (result.success) return true
  const code = result.error.issues[0]?.code
  if (code === 'too_small') return '名前は必須です'
  return '入力内容を確認してください'
}
```

**読みフィールド**

```html
<v-text-field
  v-model="nameKana"
  label="読み"
  hint="カタカナで入力してください"
  persistent-hint
  :rules="[validateNameKana]"
  maxlength="128"
  counter
  required
/>
```

```typescript
const nameKanaSchema = CreateResidentSchema.shape.nameKana

function validateNameKana(v: string): true | string {
  const result = nameKanaSchema.safeParse(v)
  if (result.success) return true
  const issue = result.error.issues[0]
  if (issue?.code === 'too_small') return '読みは必須です'
  if (issue?.code === 'invalid_string') return '読みはカタカナで入力してください'
  return '入力内容を確認してください'
}
```

**生年月日フィールド**

```html
<v-text-field
  v-model="birthDate"
  label="生年月日"
  type="date"
  :rules="[validateBirthDate]"
  required
/>
```

```typescript
const birthDateSchema = CreateResidentSchema.shape.birthDate

function validateBirthDate(v: string): true | string {
  const result = birthDateSchema.safeParse(v)
  if (result.success) return true
  return '生年月日は必須です'
}
```

**所属村ドロップダウン**

```html
<v-select
  v-model="villageId"
  label="所属村"
  :items="villages"
  item-title="name"
  item-value="id"
  :rules="[validateVillageId]"
  required
/>
```

```typescript
// village ストアから村一覧を取得する
const villageStore = useVillageStore()
onMounted(() => villageStore.fetchVillages())
const { villages } = storeToRefs(villageStore)

function validateVillageId(v: number | null): true | string {
  if (v === null || v === undefined) return '所属村を選択してください'
  return true
}
```

### 送信フロー

```typescript
async function onSubmit() {
  const { valid } = await form.value!.validate()
  if (!valid) return

  isSubmitting.value = true
  apiError.value = null
  try {
    await store.createResident({
      name: name.value,
      nameKana: nameKana.value,
      birthDate: birthDate.value,
      villageId: villageId.value!,
    })
    router.push('/residents')
  } catch (e) {
    apiError.value = e instanceof Error ? e.message : '住人の登録に失敗しました。再試行してください。'
  } finally {
    isSubmitting.value = false
  }
}
```

### エラー表示の使い分け

| エラー種別 | 表示場所 | Vuetify コンポーネント |
|---|---|---|
| 必須未入力 | フィールド直下 | `v-text-field` / `v-select` の `:rules` |
| カタカナ形式エラー | フィールド直下（読みフィールド） | `v-text-field` の `:rules` |
| API バリデーションエラー (400) | フォーム下部 | `v-alert type="error"` |
| 権限エラー (403) | フォーム下部 | `v-alert type="error"` |
| ネットワークエラー・その他 | フォーム下部 | `v-alert type="error"` |

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-003 | 2026-05-06 | 初版作成。住人一覧・村別住人一覧・住人登録の開発者向け画面設計（コンポーネント構成・Pinia 連携・バリデーション仕様） |
