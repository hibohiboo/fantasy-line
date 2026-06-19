---
last_updated: 2026-05-05
---

# テスト方針

## 対象読者

実装担当の開発者。テストコードを書くすべての場面で参照すること。

---

## 基本原則：テストは責務が生まれた場所でのみ行う

**ある処理のテストは、その処理を定義しているレイヤーで1回だけ行う。**

上位レイヤーは「下位レイヤーの結果を正しく受け取って処理している」ことを確認するだけでよく、
下位レイヤーの仕様を再テストする必要はない。

### 良い例

```
Zod スキーマ（village.ts）
  └── ✅ name が空のとき失敗する
  └── ✅ name が 128 文字のとき成功する
  └── ✅ name が 129 文字のとき失敗する

createVillage ハンドラー
  └── ✅ バリデーションエラー時に 400 を返す（代表ケース 1 つで十分）
  └── ✅ 未認証（X-User-Id ヘッダーなし）のとき 401 を返す
  └── ✅ JSON パース失敗のとき 400 を返す
  └── ✅ 正常ケースで 201 を返す
```

### 悪い例（重複）

```
createVillage ハンドラー
  └── ❌ name が空のとき 400 を返す    ← Zod スキーマで確認済み
  └── ❌ name が 129 文字のとき 400 を返す ← 同上
  └── ❌ name が未指定のとき 400 を返す   ← 同上
```

---

## レイヤー別テスト責務

| レイヤー | テストで確認すること | テストしないこと |
|---|---|---|
| Zod スキーマ（`packages/schema`） | 全バリデーションルールの境界値・正常値・異常値 | ハンドラーの HTTP ステータス |
| API ハンドラー（Small） | スキーマが使われた結果を受けて正しい HTTP ステータスを返す（代表1ケース）、認証チェック、JSON パース失敗 | スキーマの全バリデーション詳細 |
| API ハンドラー（Medium） | DB を含む正常系・主要異常系のエンドツーエンド | ユニット層で確認済みの細かいバリデーション分岐 |
| フロントエンドコンポーネント | UI の表示・ユーザー操作・イベント発火 | API の内部ロジック・DB の動作 |
| Pinia ストア | アクションの呼び出し・ステートの更新（API はモック） | API レスポンスのバリデーション詳細 |

---

## レスポンスのスキーマ検証

API ハンドラーのテストでレスポンスボディをパースする際は、`JSON.parse()` 後に `XXXResponseSchema.parse()` を通すこと。
フィールドを個別に `expect` するだけでは、フィールドの追加・削除・型変更をテストが検知できない。

```typescript
// ✅ 良い例（echo.small.test.ts のパターン）
const parsed = CreateVillageResponseSchema.parse(JSON.parse(result.body));
expect(parsed.village.name).toBe('勇者の村');

// ❌ 悪い例（スキーマ変更を検知できない）
const { village } = JSON.parse(result.body);
expect(village.name).toBe('勇者の村');
```

スキーマのパースが失敗した時点でテストが落ちるため、API レスポンスとフロントエンドの型の乖離を早期に検出できる。

---

## DB スキーマと API レスポンス スキーマの分離

DB 行の型と JSON レスポンスの型は一致しない場合がある。代表例が日付型：

| レイヤー | `createdAt` の型 | 理由 |
|---|---|---|
| Drizzle 返却値（DB） | `Date` オブジェクト | MySQL の timestamp は Date に変換される |
| JSON レスポンス（API） | `string`（ISO 8601） | `JSON.stringify` が Date を文字列に変換する |
| OpenAPI 定義 | `string` / `format: date-time` | JSON の仕様に従う |

`packages/schema` でスキーマを定義するときは **DB 用** と **レスポンス用** を分けること。

```typescript
// DB 行用（Drizzle の返却値）
export const VillageSchema = z.object({
  createdAt: z.date(),   // Date オブジェクト
});

// API レスポンス用（JSON.parse 後、フロントエンドが受け取る値）
export const VillageResponseSchema = z.object({
  createdAt: z.string(), // ISO 8601 文字列（OpenAPI の string/format:date-time に対応）
});
```

**新しいリソースのスキーマを作成するときは必ず `docs/design/openapi/openapi.yaml` を確認し、フィールド型を合わせること。**

---

## テスト種別と受け入れ条件の確認方法

Gherkin シナリオは**ユーザーの操作**を記述している。そのため受け入れ条件の最終確認はブラウザを通じた E2E テストで行う。

### テスト種別と目的

| 種別 | 目的 | ツール | 配置 |
|---|---|---|---|
| ユニット（Small） | 単一関数・クラスが仕様どおりに動く | vitest | `src/<feature>/*.small.test.ts` |
| 統合（Medium） | 複数モジュール・DB を含む連携が正しい | vitest + Testcontainers | `src/<feature>/*.medium.test.ts`・`src/<feature>/*.integration.test.ts` |
| **E2E 受け入れ（Large）** | **Gherkin シナリオをユーザー操作で満たす** | **Playwright** | **`e2e/*.large.test.ts`** |

### E2E 受け入れテストのルール

- ファイル名は `<機能名>.spec.ts`（Playwright 規約）
- 各テストの `test()` 名は対応する Gherkin シナリオを明記する（例: `'Scenario 1: 正常に村を作成できる'`）
- 実装計画では**フロントエンド・ルーター完成後・lint 前**に配置する
- E2E テストが全件 GREEN = PBI の受け入れ条件を満たした = レビュー可能な状態

### API 統合テストとの役割分担

| テスト | 確認すること |
|---|---|
| API 統合テスト（Medium） | API 単体として正しく動くか・複数ハンドラーの連携 |
| E2E 受け入れテスト（Large） | ユーザーが UI を通じて価値を得られるか |

API 統合テストが通っていても E2E が通っていなければ PBI 完了とみなさない。

---

## テストサイズ分類

### バックエンド（apps/api）

| サイズ | 対象 | 実行速度 | 依存 | 配置・命名 |
|---|---|---|---|---|
| **Small** | 単一ハンドラー（DB モック） | 高速（ms） | 外部依存なし | `src/<feature>/*.small.test.ts` |
| **Medium** | ハンドラー + 実 DB（Testcontainers） | 中速（秒） | DB 必要 | `src/<feature>/*.medium.test.ts` |
| **Large** | 複数ハンドラーを跨ぐ統合 / E2E | 低速（秒〜分） | 実サービス・ブラウザ | `src/<feature>/*.integration.test.ts` / `e2e/` |

### フロントエンド（apps/frontend）

| サイズ | 対象 | 実行速度 | 依存 | 配置・命名 |
|---|---|---|---|---|
| **Small** | 単一コンポーネント・単一ストア（API モック） | 高速（ms） | 外部依存なし（fetch モック） | `src/**/__tests__/*.small.spec.ts` |
| **Medium** | View レベルの結合テスト（複数コンポーネント＋ストア連携、API モック） | 中速（秒） | fetch モック | `src/**/__tests__/*.medium.spec.ts` |
| **Large** | E2E（Playwright、実ブラウザ＋実 API） | 低速（秒〜分） | 実サービス・ブラウザ | `e2e/*.spec.ts` |

#### フロントエンド分類の判断基準

- **Small**: テスト対象が 1 コンポーネント or 1 ストアのみ。`mount()` するコンポーネントが 1 つで、子コンポーネントは `stubs` にするか描画しない
- **Medium**: View を `mount()` し、実際の子コンポーネント（VillageCard など）も描画する。Pinia ストアも実物を使い、fetch のみモック
- **Large**: Playwright で実ブラウザを操作する E2E テスト（`e2e/` 配下）

---

## E2E テストでのバリデーション確認方針

### UI が入力をブロックする場合（maxlength など）

入力フォームに `maxlength` などの HTML 属性や UI コンポーネントの制約がある場合、
**「ユーザーがその文字数を入力できないこと」自体が受け入れ条件を満たしている**。

そのため E2E テストでは「制約を超えた値をブラウザの制限を回避して強制入力し、エラーメッセージを確認する」ことは行わない。

| 確認方法 | 適切か | 理由 |
|---|---|---|
| fill() で 130 文字入力 → `inputValue()` が 128 以下であることを確認 | ✅ | ユーザーが実際に経験するブロック動作を確認している |
| evaluate() でネイティブ API を使い強制的に 129 文字をセット → エラーメッセージ確認 | ❌ | 実ユーザーは行えない操作。バックエンドスキーマのテスト（Small）と重複 |

**判断の根拠**: バリデーション詳細（129 文字で失敗すること）は Zod スキーマテストが担保している。
E2E レイヤーでは「UI がユーザーに正しいフィードバックを提供しているか」だけを確認すればよい。

---

## 実装計画でのテスト項目の書き方

テスト項目を実装計画に書くとき、以下の確認をすること。

**書く前のチェック:**
- このテストが確認しようとしているロジックは、すでに別レイヤーのテストでカバーされていないか？
- カバーされている場合、このレイヤーでは「そのレイヤーの結果を受けて正しく動く代表1ケース」だけに絞れないか？

---

## フロントエンドのモック開発（MSW）

フロントエンド単体でバックエンドなしに動作確認するには MSW（Mock Service Worker）を使用する。

### 起動方法

```bash
cd apps/frontend
npm run dev:mock   # ✅ 正しい（vite --mode mock）
npm run mock:dev   # ❌ 存在しないスクリプト名
```

`dev:mock` スクリプトは `vite --mode mock` を実行し、`.env.mock` を読み込む。
`.env.mock` に `VITE_USE_MOCK=true` が設定されているため、`main.ts` が MSW ワーカーを起動する。

### しくみ

```
ブラウザ
  └── Service Worker（mockServiceWorker.js）
        ├── ハンドラーが一致 → モックレスポンスを返す
        └── 一致しない → 実ネットワークへ（onUnhandledRequest: 'bypass'）
```

- `public/mockServiceWorker.js` が存在しないと MSW は動かない（`npx msw init public/` で生成）
- MSW がインターセプトしたリクエストは DevTools の Network タブで **XHR/Fetch ではなく Service Worker** として表示される。フィルタを「All」にして確認すること

### ハンドラー（`src/mocks/handlers.ts`）を書くときの注意

- モックデータの `ownerId` はストア側の `getUserId()` デフォルト値（`'mock-user-1'`）と一致させる
- ルートガードが `localStorage.getItem('userId')` を確認するため、`/villages` などの `requiresAuth: true` ルートはログイン（HomeView の「始める」ボタン）を経由しないとアクセスできない。ブラウザコンソールで `localStorage.setItem('userId', 'mock-user-1')` を実行することでもバイパス可能

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-05 | 初版作成。「責務が生まれた場所でテスト」の原則・レイヤー別責務表・実装計画への適用方法を定義 |
| PBI-001 | 2026-05-05 | レスポンスのスキーマ検証パターン（`XXXResponseSchema.parse()`）と DB スキーマ・API レスポンス スキーマの分離方針を追加 |
| PBI-001 | 2026-05-06 | フロントエンドの Small / Medium / Large 分類基準を追加（Small: 単一コンポーネント・ストア、Medium: View 結合テスト、Large: Playwright E2E） |
| PBI-001 | 2026-05-06 | E2E テストでの `maxlength` 制約確認方針を追加。HTML 制約を無効化した強制入力はしない。バリデーション詳細は Small（Zod スキーマ）テストの責務。 |
| PBI-001 | 2026-05-06 | MSW を使ったフロントエンドモック開発の起動手順・しくみ・ハンドラー注意事項を追加 |
| PBI-019 | 2026-05-30 | テスト配置を `tests/handlers/` / `tests/integration/` → `src/<feature>/` に更新（feature別近接配置への移行） |
