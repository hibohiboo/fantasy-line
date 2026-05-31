# テスト指針

このファイルはテストコード全般の常時ルールを扱う。
TDD の進め方は `.claude/skills/tdd-workflow/SKILL.md`、
Web アプリ E2E は `.claude/skills/webapp-testing/SKILL.md` を参照する。

---

## 1. テストフレームワーク

- 単体・結合: **Vitest**
- E2E / VRT: **Playwright**（reg-suit を併用）
- 静的解析や VRT の差分検出は CI で実行する

## 2. テストの種類と置き場所

| 種類                            | フレームワーク        | 配置                        |
| ------------------------------- | --------------------- | --------------------------- |
| 単体（純粋関数）                | Vitest                | 機能フォルダ内 `*.test.ts`  |
| 結合（Lambda handler、IO 含む） | Vitest                | 機能フォルダ内 `*.test.ts`  |
| E2E（ユーザー操作）             | Playwright            | `apps/frontend/playwright/` |
| VRT（見た目の差分検出）         | Playwright + reg-suit | `apps/frontend/playwright/` |

「実装ファイルの隣にテストを置く」を既定にする。

## 3. AAA パターンと構造化

```ts
test('日付の新しい順でソートされること', () => {
  // Arrange: テスト対象の入力と前提条件
  const input = [
    { slug: 'a', date: '2024-01-01' },
    { slug: 'b', date: '2025-01-01' },
  ];

  // Act: テスト対象の関数を実行
  const result = sortByDateDesc(input);

  // Assert: 期待する結果を検証
  expect(result[0].slug).toBe('b');
  expect(result[1].slug).toBe('a');
});
```

### テスト構造のルール

- **1 テスト 1 振る舞い**: テスト名で「何が起きるか」を読めるようにする
- **Arrange-Act-Assert の明確な分離**: 空行でセクションを区切り、コメント付きで意図を示す
- **テスト名は述語形で統一**: 「〜すること」「〜であること」「〜が返却されること」など一貫性を保つ
- **セットアップは関数化**: 複雑な初期化は `beforeEach` や factory 関数で整理する

### 可読性向上の工夫

```ts
// 悪い例：変数が何なのか不明、セクション分けなし
test('タイトルが表示されること', () => {
  const a = { title: 'Test', author: 'John' };
  expect(renderArticle(a).title).toBe('Test');
});

// 良い例：明確な構造、意図がわかりやすい
test('記事のタイトルが表示されること', () => {
  // Arrange
  const article = createArticle({ title: 'Learn TypeScript' });

  // Act
  const rendered = renderArticle(article);

  // Assert
  expect(rendered.title).toHaveTextContent('Learn TypeScript');
});
```

- 複数行の入力データは改行・インデントで見やすくする
- 結果を複数検証するときは各 expect を明確に分ける
- ローカル変数名は `a`, `b` ではなく、目的を表す名前を使う

### describe でテストを整理

```ts
describe('sortByDateDesc', () => {
  describe('複数記事が入力されたとき', () => {
    test('新しい日付の記事が先頭に来ること', () => { ... })
    test('同じ日付の記事は元の順序を保つこと', () => { ... })
  })

  describe('空配列が入力されたとき', () => {
    test('空配列が返ること', () => { ... })
  })
})
```

- 機能単位で `describe` でグループ化する
- 「〜が入力されたとき」「〜の場合」で条件を明示する
- ネストを 2-3 階層に留める（深すぎないように）

## 4. ローカル再現性を最優先

- CI で再現する不具合は、まず手元で再現できる状態を作る
- ランダム値・現在時刻・外部 API 等の外乱を最小化する
  - 必要なら `vi.useFakeTimers()` / 固定 seed を使う
- 環境差で壊れるテストは即修正する。スキップで放置しない

## 5. fixture の利用

- 反復するテストデータは `tools/fixtures/` または機能フォルダ内 `__fixtures__/`
  にまとめる
- fixture は最小限・読みやすさ優先で作る
- 「実データの匿名化版」を fixture にする場合は PII を確実に除く

## 6. モックと外部依存

- 外部依存（AWS SDK、ネットワーク、DB）は handler やリポジトリ層で抽象化し、
  テストでは fake / stub を差し替える
- グローバルな `vi.mock` の濫用を避ける（テストの独立性を損なう）
- HTTP 通信が避けられない E2E では `tools/fixtures/` のローカルサーバを利用する

## 7. VRT は代表ページに限定

- 全記事 VRT は行わない（コスト・時間・メンテ性の観点）
- スナップショット差分はレビューで必ず人が確認する（無条件に承認しない）

## 8. CI とローカルの一致

- CI が走らせるコマンドはルート `package.json` の script で定義する
- 例: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run vrt`
- Playwright のブラウザバージョンは固定する（Lock）

## 9. カバレッジ

- 機械的なしきい値（80% 等）は目安にとどめ、
  「重要パスがテストされているか」を優先する
- 「テストなし変更を避ける」ことを最優先指針とする

## 10. 反パターン

- 内部状態やプライベート関数を直接検証する
- CSS クラス名で要素を探す E2E（壊れやすいため避ける）
- セットアップ・クリーンアップを暗黙的に共有するテスト
- 「flaky だから retry」で逃げる（原因を特定して直す）
- スキップが残ったまま放置される
- **テスト名が曖昧で何をテストしているか不明**（例：`test('it works')`、`test('エラーハンドリング')`）
- **Arrange / Act / Assert の分離なく、読み込むのに時間がかかるテスト**
- **単一の test に複数の振る舞いを詰め込む**（条件分岐が多くなり、失敗時にどこが原因かわからない）
- **describe なし、またはテストが平たく並んでいる**（数が増えると目的が不明確になる）

## 11. やってはいけないこと

- テストコードでのみ `any` を多用する（テストでも型は守る）
- 失敗するテストをコメントアウトして Commit する
- VRT のベースライン画像を中身を確認せず一括更新する
