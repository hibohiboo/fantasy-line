# 詳細設計 — 住人管理（resident）

## 対象読者

実装担当の開発者。本ドキュメントを読めば、何をどのファイルにどのように実装するかが分かる状態を目指す。

---

## 実装影響コンポーネント一覧

本 PBI で新規作成・変更が必要なファイルの一覧。

| レイヤー | 対象 | 変更種別 |
|---|---|---|
| スキーマ共有 | `packages/schema/src/resident.ts` | 新規 |
| スキーマ共有 | `packages/schema/src/index.ts` | エクスポート追加 |
| API ハンドラー | `apps/api/src/resident/createResident.ts` | 新規 |
| API ハンドラー | `apps/api/src/resident/listResidents.ts` | 新規 |
| API ハンドラー | `apps/api/src/resident/listVillageResidents.ts` | 新規 |
| DB スキーマ | `apps/api/src/db/schema.ts` | residents テーブル追加 |
| DB マイグレーション | `apps/api/drizzle/` 配下に新規 SQL | 新規 |
| インフラ | `infra/lib/infra-stack.ts` | Lambda・API Gateway リソース追加 |
| フロントエンド | `apps/frontend/src/views/ResidentListView.vue` | 新規（詳細: [画面設計・開発者向け](./screen/resident.md)） |
| フロントエンド | `apps/frontend/src/views/ResidentCreateView.vue` | 新規（詳細: [画面設計・開発者向け](./screen/resident.md)） |
| フロントエンド | `apps/frontend/src/views/VillageResidentListView.vue` | 新規（詳細: [画面設計・開発者向け](./screen/resident.md)） |
| フロントエンド | `apps/frontend/src/stores/resident.ts` | 新規 |
| フロントエンド | `apps/frontend/src/router/index.ts` | ルート追加 |

---

## 処理フロー詳細

認証・ユーザーID 取得・権限チェックの共通パターンは [api-architecture.md](../non-functional/api-architecture.md) を参照。

住人管理の各エンドポイントが使用するパターン:

| エンドポイント | 使用パターン |
|---|---|
| POST /api/residents | 代表パターン 2（認証 + 村所有権チェック + 書き込み） |
| GET /api/residents | 代表パターン 3（認証 + 読み取り）。villages INNER JOIN で `owner_id` 絞り込み |
| GET /api/villages/:id/residents | 代表パターン 2 の読み取り変形（権限チェック後に SELECT） |

---

## API 詳細

### POST /api/residents — 住人を登録する

**リクエスト**

```
Headers:
  Content-Type: application/json
  Authorization: Bearer <JWT>   ※ PBI-014 実装前はモック認証

Body:
  {
    "name": "タロウ",
    "nameKana": "タロウ",
    "birthDate": "2000-01-15",
    "villageId": 1
  }
```

**バリデーション（`packages/schema/src/resident.ts`）**

| フィールド | ルール | エラー時 |
|---|---|---|
| name | 必須・文字列 | `fieldErrors.name` に配列で返す |
| name | 1文字以上 | 同上 |
| name | 128文字以下 | 同上 |
| nameKana | 必須・文字列 | `fieldErrors.nameKana` に配列で返す |
| nameKana | 1文字以上 | 同上 |
| nameKana | 128文字以下 | 同上 |
| nameKana | 全角カタカナのみ（`/^[ァ-ヴー]+$/`） | 同上 |
| birthDate | 必須・文字列 | `fieldErrors.birthDate` に配列で返す |
| birthDate | ISO 8601 日付形式（`YYYY-MM-DD`） | 同上 |
| villageId | 必須・正の整数 | `fieldErrors.villageId` に配列で返す |

**権限チェック（APIハンドラー）**

1. `villageId` に対応する村が DB に存在するかを確認する
2. 村の `owner_id` が認証ユーザーID と一致するかを確認する
3. 一致しない場合は `403 Forbidden` を返す

**レスポンス**

| ステータス | 条件 | ボディ |
|---|---|---|
| 201 Created | 正常作成 | `{ "resident": { "id": 1, "name": "タロウ", "nameKana": "タロウ", "birthDate": "2000-01-15", "villageId": 1, "createdAt": "2026-05-06T00:00:00.000Z" } }` |
| 400 Bad Request | バリデーションエラー | `{ "error": { "fieldErrors": { "name": ["..."] } } }` |
| 400 Bad Request | JSON パース失敗 | `{ "error": "Invalid JSON" }` |
| 400 Bad Request | villageId なし | `{ "error": { "fieldErrors": { "villageId": ["..."] } } }` |
| 401 Unauthorized | 未認証 | `{ "error": "Unauthorized" }` |
| 403 Forbidden | 他ユーザーの村 | `{ "error": "Forbidden" }` |

---

### GET /api/residents — 全住人一覧を取得する

**リクエスト**

```
Headers:
  Authorization: Bearer <JWT>
```

**レスポンス**

| ステータス | 条件 | ボディ |
|---|---|---|
| 200 OK | 正常取得 | `{ "residents": [ { "id": 1, "name": "タロウ", "nameKana": "タロウ", "birthDate": "2000-01-15", "villageId": 1, "villageName": "エルムの村", "createdAt": "..." } ] }` |
| 401 Unauthorized | 未認証 | `{ "error": "Unauthorized" }` |

**取得ルール:**
- ログイン中のユーザーが `owner_id` として登録されている村の住人のみを返す
- 他ユーザーの村の住人は返さない
- 空配列も正常レスポンス（`200 OK`、`{ "residents": [] }`）
- **ソート順: `name_kana ASC`（読み昇順）**

---

### GET /api/villages/:id/residents — 村別住人一覧を取得する

**リクエスト**

```
Headers:
  Authorization: Bearer <JWT>

Path Parameters:
  id: 村ID（整数）
```

**レスポンス**

| ステータス | 条件 | ボディ |
|---|---|---|
| 200 OK | 正常取得 | `{ "residents": [ { "id": 1, "name": "タロウ", "nameKana": "タロウ", "birthDate": "2000-01-15", "villageId": 1, "createdAt": "..." } ] }` |
| 401 Unauthorized | 未認証 | `{ "error": "Unauthorized" }` |
| 403 Forbidden | 他ユーザーの村 | `{ "error": "Forbidden" }` |

**取得ルール:**
- 指定した `villageId` に所属する住人のみを返す
- 村の `owner_id` が認証ユーザーIDと一致しない場合は `403 Forbidden` を返す
- 空配列も正常レスポンス（`200 OK`、`{ "residents": [] }`）
- **ソート順: `name_kana ASC`（読み昇順）**
- レスポンスには `villageName` を含めない（単一村ビューのため不要）

---

## データモデル詳細

テーブル定義・Drizzle ORM スキーマ・マイグレーション方針・CRUD表は [データモデル](../data-model/resident.md) を参照すること。

---

## Zod スキーマ（`packages/schema/src/resident.ts` 新規作成）

```typescript
import { z } from 'zod';

const katakanaRegex = /^[ァ-ヴー]+$/;

export const CreateResidentSchema = z.object({
  name: z.string().min(1).max(128),
  nameKana: z.string().min(1).max(128).regex(katakanaRegex, '読みはカタカナで入力してください'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生年月日はYYYY-MM-DD形式で入力してください'),
  villageId: z.number().int().positive(),
});

export const ResidentSchema = z.object({
  id: z.number(),
  name: z.string(),
  nameKana: z.string(),
  birthDate: z.string(),
  villageId: z.number(),
  createdAt: z.date(),
});

export const ResidentWithVillageSchema = ResidentSchema.extend({
  villageName: z.string(),
});

export const CreateResidentResponseSchema = z.object({
  resident: ResidentSchema,
});

export const ListResidentsResponseSchema = z.object({
  residents: z.array(ResidentWithVillageSchema),
});

export const ListVillageResidentsResponseSchema = z.object({
  residents: z.array(ResidentSchema),
});

export type CreateResidentInput = z.infer<typeof CreateResidentSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type ResidentWithVillage = z.infer<typeof ResidentWithVillageSchema>;
export type CreateResidentResponse = z.infer<typeof CreateResidentResponseSchema>;
export type ListResidentsResponse = z.infer<typeof ListResidentsResponseSchema>;
export type ListVillageResidentsResponse = z.infer<typeof ListVillageResidentsResponseSchema>;
```

---

## フロントエンドコンポーネント設計

### ルーティング（`apps/frontend/src/router/index.ts`）

| パス | コンポーネント | 説明 |
|---|---|---|
| `/residents` | `ResidentListView.vue` | 全住人一覧ページ |
| `/residents/new` | `ResidentCreateView.vue` | 住人登録ページ |
| `/villages/:id/residents` | `VillageResidentListView.vue` | 村別住人一覧ページ |

認証ガード: `meta: { requiresAuth: true }` を設定する。PBI-014 実装前はモック認証で保護する。

---

### Pinia ストア（`apps/frontend/src/stores/resident.ts`）

```typescript
// 状態
const residents = ref<ResidentWithVillage[]>([])
const villageResidents = ref<Resident[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

// アクション
async function fetchResidents(): Promise<void>
async function fetchVillageResidents(villageId: number): Promise<void>
async function createResident(input: CreateResidentInput): Promise<Resident>
```

---

### ResidentListView.vue

**責務:** 全住人一覧の表示、住人登録ページへのナビゲーション

**構成:**
- `<ResidentList>` コンポーネント: 住人リストを表示する（所属村名の列あり）
  - Props: `residents: ResidentWithVillage[]`
- 「住人を追加」ボタン: `/residents/new` に遷移する
- ローディング状態の表示
- エラーメッセージの表示
- 空状態の表示（「住人が登録されていません。追加してください」）

---

### VillageResidentListView.vue

**責務:** 村別住人一覧の表示

**構成:**
- `<ResidentList>` コンポーネント: 住人リストを表示する（所属村名の列なし）
  - Props: `residents: Resident[]`, `showVillage?: boolean`（デフォルト false）
- ローディング状態の表示
- エラーメッセージの表示
- 空状態の表示（「住人が登録されていません。追加してください」）

---

### ResidentCreateView.vue

**責務:** 住人登録フォームの表示と送信

**Props:** なし

**フォーム要素:**
- 名前入力フィールド（`<v-text-field>`, maxlength="128", counter）
- 読み入力フィールド（`<v-text-field>`, maxlength="128", counter）
- 生年月日入力フィールド（`<v-text-field type="date">`）
- 所属村ドロップダウン（`<v-select>`、village ストアから村一覧を取得）
- 登録ボタン（送信中はローディング表示）
- バリデーションエラーメッセージ

**バリデーション（フロントエンド側）:**

| 条件 | メッセージ |
|---|---|
| 名前が空 | 「名前は必須です」 |
| 読みが空 | 「読みは必須です」 |
| 読みがカタカナ以外 | 「読みはカタカナで入力してください」 |
| 生年月日が未入力 | 「生年月日は必須です」 |

注: 名前の 128 文字制限はフロントでは `maxlength="128"` による入力ブロックのみ。エラーメッセージは表示しない。

**送信後の動作:**
- 成功時: `/residents` にリダイレクト
- 失敗時: APIのエラーメッセージを表示

---

## エラーハンドリング方針

| レイヤー | エラー種別 | 対応 |
|---|---|---|
| フロントエンド | バリデーションエラー | フォーム下部にエラーメッセージを表示。API呼び出しは行わない |
| フロントエンド | APIエラー (400) | `error.fieldErrors` を解析してフィールドごとに表示 |
| フロントエンド | APIエラー (401) | ログインページにリダイレクト |
| フロントエンド | APIエラー (403) | 「操作する権限がありません」を表示 |
| フロントエンド | ネットワークエラー | 「通信エラーが発生しました。再試行してください」を表示 |
| API | JSON パース失敗 | 400 `{ "error": "Invalid JSON" }` |
| API | バリデーションエラー | 400 `{ "error": { "fieldErrors": {...} } }` |
| API | 未認証 | 401 `{ "error": "Unauthorized" }` |
| API | 権限エラー（他ユーザーの村） | 403 `{ "error": "Forbidden" }` |
| API | DB エラー | 500 `{ "error": "Internal Server Error" }`（詳細はログのみ） |

---

## 実装上の注意点

### カタカナバリデーション

読みのカタカナチェックは正規表現 `/^[ァ-ヴー]+$/` で行う。
- `ァ-ヴ`（U+30A1〜U+30F4）: 全角カタカナ（小文字含む）
- `ー`（U+30FC）: 長音符
- ひらがな・英数字・記号はすべて NG

フロントエンドのバリデーションも `CreateResidentSchema.shape.nameKana.safeParse()` を使い、スキーマ駆動で行う。

### 生年月日の扱い

- DB では `DATE` 型で保存する
- Drizzle ORM の `date('birth_date', { mode: 'string' })` を使用し、DB から "YYYY-MM-DD" 文字列として取得する（`mode: 'string'` により Date オブジェクト変換を経由しないため、タイムゾーン変換の影響を受けない）
- API リクエスト / レスポンスともに "YYYY-MM-DD" 文字列で扱う
- タイムゾーン方針の全体は [api-architecture.md](../non-functional/api-architecture.md) を参照
- バリデーションは Zod でフォーマット検査のみ行う（未来日・無効日付の厳密チェックは行わない）

### 権限チェックの実装

`createResident` ハンドラーでは、住人を INSERT する前に必ず以下を確認する。
1. `villageId` に対応する村が存在するかを SELECT で確認する
2. その村の `owner_id` が認証ユーザーIDと一致するかを確認する
3. 一致しない場合は `403 Forbidden` を返す

### villageId の取得（住人登録フォーム）

住人登録フォームでは `village` ストア（既存の `fetchVillages()`）から自分の村一覧を取得し、`<v-select>` で選択させる。

### 認証との連携

- PBI-014（ログイン機能）が未実装の段階では、`owner_id` に固定値（例: `"mock-user-1"`）を使用したモック認証で開発を進める
- `X-User-Id` ヘッダーの値を使用する（`listVillages.ts` と同じパターン）

### テスト方針

**ユニットテスト（small）**

対象: `createResident.small.test.ts`, `listResidents.small.test.ts`, `listVillageResidents.small.test.ts`
- DB モックを使用
- バリデーションエラーケース（400）・権限エラーケース（403）を網羅する

**統合テスト（medium）**

対象: `createResident.medium.test.ts`, `listResidents.medium.test.ts`, `listVillageResidents.medium.test.ts`
- Testcontainers の PostgreSQL コンテナを使用
- 正常系・異常系を DB 含めて確認する

**フロントエンドテスト**

対象: `ResidentCreateView.medium.spec.ts`, `ResidentListView.medium.spec.ts`
- `@vue/test-utils` + `vitest` でコンポーネントの動作を確認する
- Pinia ストアのモックを使用する

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-003 | 2026-05-06 | 住人管理機能の初期詳細設計（登録・全体一覧・村別一覧・権限ガード） |
| PBI-019 | 2026-05-30 | ハンドラーパスを `src/handlers/` → `src/resident/` に更新（feature別フォルダ構成への移行） |
