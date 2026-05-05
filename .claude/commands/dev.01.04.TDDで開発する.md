実装計画チェックリストに従い、TDDで開発します。

# タスク

1. `docs/plan/` の実装計画チェックリストを読み込む
2. 未完了（`[ ]`）の項目を1つ選ぶ
3. **Red → Green → Refactor** の順で実装する
4. 完了したらチェックリストを `[x]` に更新する
   - 実装中に計画外の変更が生じた場合（スキーマ追加・手順変更など）も計画に反映する
5. **フェーズ（Phase）の最後の項目を完了したら、次フェーズに進む前に必ず人間に確認する**
   - チェックリストの現在の状態を示し、次フェーズでやることを箇条書きで提示する
   - 人間の「進めてください」を受けてから次フェーズに着手する
6. 未完了項目がなくなるまで 2〜5 を繰り返す

# テストサイズ分類

テストコードは以下の3サイズに分けて記述し、ファイルも分けて管理する。

| サイズ | 対象 | 実行速度 | 依存 | 配置例 |
|---|---|---|---|---|
| **Small** | 単一関数・クラスの単体テスト | 高速（msオーダー） | 外部依存なし（モック可） | `tests/small/` |
| **Medium** | 複数モジュール・DBを含む統合テスト | 中速（秒オーダー） | DB・ファイルI/O許容 | `tests/medium/` |
| **Large** | APIエンドポイント・E2Eシナリオ | 低速（秒〜分） | 実サービス・ブラウザ使用 | `tests/large/` |

テストを書く際は、対象コードの責務に応じて適切なサイズを選ぶこと。

---

# TDDサイクル

## Red（テスト作成）
- 失敗するテストを先に書く
- テストは受け入れ条件（Gherkin）を満たすように書く
- 上記のサイズ分類に従い、適切なディレクトリに配置する
  - ロジックの検証 → Small
  - DB・複数モジュールの結合確認 → Medium
  - APIエンドポイント・ユースケース全体の確認 → Large
- **テストを書く前に確認すること**: このテストが検証しようとしているロジックは、すでに別レイヤーのテストでカバーされていないか？カバーされている場合は「その結果を受けて正しく動く代表1ケース」だけに絞る（詳細: `docs/design/non-functional/testing.md`）
- **スタブを先に作成すること**: テスト対象のファイルが存在しない場合は、固定値を返す最小スタブ（例: 常に 200 を返すハンドラー）を先に作成する。「ファイルが存在しない」ことで失敗するのは Red ではない。**「振る舞いが間違い」で失敗する**のが正しい Red
- `npm run test` で失敗を確認する

## Green（実装）
- テストが通る最小限のコードを書く
- `npm run test` で通過を確認する

## Refactor（リファクタリング）
**プロダクションコードとテストコードの両方をリファクタリング対象とする。**

### プロダクションコードのリファクタリング
- **人間の可読性を向上させること**を目的とする。重複の除去・責務の分離・命名の改善はすべてその手段である

### テストコードのリファクタリング
- テストの意図が読んでわかる命名・構造になっているか見直す
- 同じセットアップが繰り返されている場合はヘルパーに切り出す
- Small/Medium/Large の分類が適切かを再確認し、必要なら移動する
- テスト自体が壊れやすい（実装詳細に依存している）場合は抽象度を上げる
- **レスポンスのスキーマ検証**: レスポンスボディをパースするテストは `JSON.parse()` 後に `XXXResponseSchema.parse()` を通すこと。フィールドの個別アサートだけではスキーマ変更を検知できない（詳細: `docs/design/non-functional/testing.md`）

`npm run test` で引き続き通過を確認してからリファクタリングを完了とする。
`npm run lint` でlintを確認する。

# 共有スキーマ（packages/schema）を実装する場合

`packages/schema` にスキーマを追加・変更するときは以下を必ず確認すること。

1. **OpenAPI との整合性確認**: `docs/design/openapi/openapi.yaml` を読み、フィールド名・型・必須有無が一致しているか確認する
2. **DB スキーマとレスポンス スキーマを分ける**: 日付型などは DB レイヤー（`z.date()`）と API レスポンス（`z.string()`）で型が異なる。`XxxSchema`（DB 用）と `XxxResponseSchema`（JSON レスポンス用）を別に定義すること
3. **レスポンス スキーマの命名**: API レスポンスとして JSON.parse されるものは `XxxResponseSchema` / `XxxResponseType` とし、`CreateXxxResponseSchema` / `ListXxxResponseSchema` に組み込む

---

# フロントエンドコンポーネントを実装する場合

実装対象にUI（Vue コンポーネント・HTML/CSS）が含まれる場合は、`.claude/skills/frontend-design/SKILL.md` を読み込み、そのガイドラインに従って実装すること。

## フォームバリデーション

フロントエンドのバリデーションルールは **`packages/schema` の Zod スキーマを `safeParse()` で直接使う**こと。マジックナンバー（`min(1)` や `max(128)` などの定数）をフロントエンドに重複定義しない。

```typescript
// ✅ 良い例：スキーマを safeParse() で直接使う
import { CreateVillageSchema } from '@repo/schema'
const nameSchema = CreateVillageSchema.shape.name
function validateName(v: string): true | string {
  const result = nameSchema.safeParse(v)
  if (result.success) return true
  const code = result.error.issues[0]?.code
  if (code === 'too_small') return '村名を入力してください'
  if (code === 'too_big') return '村名は128文字以内で入力してください'
  return '入力内容を確認してください'
}

// ❌ 悪い例：マジックナンバーの重複定義
const rules = {
  required: (v: string) => !!v || '村名を入力してください',
  maxLength: (v: string) => v.length <= 128 || '村名は128文字以内で入力してください',
}
```

スキーマの制約（`min` / `max` の値）が変わった場合にフロントエンドが自動的に追従できる。

# 考慮不足が判明した場合

- 実装計画チェックリストに追加項目を記載する
- 設計ドキュメントを更新する

# 完了条件

- 全チェックリスト項目が `[x]` になっていること
- `npm run test` が全件通過していること
- **E2E 受け入れテスト**（`e2e/*.spec.ts`）が全 Gherkin シナリオを網羅し、全件 GREEN であること
  - E2E が通っていなければ「実装完了」とみなさない
  - E2E テストが Gherkin シナリオと 1 対 1 で対応していることを確認する
- `npm run lint` がエラーなしで完了していること
- 完了後は「TDD開発完了」とチャットに書き込むこと
