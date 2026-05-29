# TypeScript 指針

このファイルは TypeScript（および TypeScript 型情報を持つ `.vue`）固有の追加ルールを扱う。
共通コーディング指針は `.claude/instructions/coding.md` を満たすこと。

---

## 1. strict 前提

- 全パッケージで TypeScript strict を有効にする
- `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess` を有効化推奨
- `tsconfig.base.json` を継承し、各パッケージで個別緩和をしない

## 2. 型・インターフェイス

- 公開関数（`export` した関数）の引数・戻り値には必ず明示的な型を付ける
- ローカル変数の自明な型は推論に任せる
- オブジェクト形状: 拡張・実装される可能性があれば `interface`、それ以外で
  union / intersection / mapped を使うときは `type`
- 文字列リテラル union を `enum` より優先する。`enum` は外部互換のためだけに使う

```ts
// 良い例
export interface Article {
  slug: string;
  title: string;
  publishedAt: string;
}

export type ArticleStatus = 'draft' | 'published' | 'archived';
```

## 3. `any` の扱い

- アプリケーションコードで `any` は原則禁止
- 外部入力は `unknown` で受け、`zod` などで明示的に絞り込む
- `as` キャストは「直前にバリデーション済」でなければ使わない
- ジェネリクスで表現できる箇所では `any` を使わない

```ts
function parseError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unexpected error';
}
```

## 4. Zod による schema validation

- API 入力 / S3 JSON / 設定ファイル / 環境変数など信頼できない境界で利用する
- スキーマから `z.infer` で型を導出し、二重定義を避ける
- 大量にネストしすぎるスキーマは小さい部品に分割して `extend` する

```ts
import { z } from 'zod';

export const popularPostSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  views: z.number().int().min(0),
});

export type PopularPost = z.infer<typeof popularPostSchema>;
```

## 5. 非同期処理

- `async / await` を基本とし、独立したタスクは `Promise.all` で並列化する
- `try-catch` で受けたエラーは `unknown` 型で扱い、必要に応じて narrow する
- 失敗時の挙動（再送・既定値・null 返し）を関数シグネチャで読み取れるようにする
- `void` を返す async は基本作らない（呼び出し側がエラーを取りこぼす）

## 6. 不変性

- スプレッド構文で新しい値を返す
- `Readonly<T>` / `ReadonlyArray<T>` を引数で活用する
- mutation を避ける。性能上必要な場合はコメントで理由を明示する

## 7. import / export

- ESM を前提として、`require` / `module.exports` は使わない
- 相対パスは 2 階層を上限の目安にし、深くなる場合はパスエイリアスを使う
- 公開 API は `index.ts` から名前付きで再エクスポートする

## 8. ログ

- 本番コードに `console.log` を残さない
- 必要であれば軽量ロガーを `packages/shared` に置き、構造化ログとして出す
- 機微情報（トークン・パスワード・PII）はログに出さない

## 9. 禁止事項

- `// @ts-ignore` / `// @ts-expect-error` の安易な追加（理由コメント必須）
- 失敗握りつぶし: `catch (e) {}`
- ファイル末尾の `export {}` ダミーエクスポート（必要な箇所以外）
- 機能をまたぐ無計画な型導出（型がコピペで増殖する状態）

---

## 10. モジュール解決とインポートパス

このプロジェクトの全パッケージは `moduleResolution: Bundler` を使用する。
バンドラー（Vite）が拡張子を解決するため、インポートパスに拡張子を付けない。

**ルール:**

- 相対インポート（`./` / `../`）に `.js` / `.ts` 拡張子を付けない
- `@/` エイリアス経由のインポートも同様
- 新規パッケージの `tsconfig.json` には必ず `"moduleResolution": "Bundler"` を明示する
- `NodeNext` / `Node16` モードを採用する場合は ADR で理由を残してから変更する

```ts
// 良い例
import { loadArticles } from './loadArticles';
import { getArticles } from '@/features/articles/getArticles';

// 悪い例（ESLint で自動検出される）
import { loadArticles } from './loadArticles.js'; // 禁止
import { getArticles } from '@/features/articles/getArticles.js'; // 禁止
```

---

## 11. TSDoc

エクスポートされた関数・クラスには TSDoc コメントを記述する。
型情報は TypeScript が保証するため、`@param {string}` のような型注釈は省略する。

### 必須対象

- `export` している関数・非同期関数

### 任意対象（書くことを推奨）

- `export` している型・インターフェース（型名だけでは意図が分からない場合）
- 内部ヘルパー関数（処理が非自明な場合）

### 省略可

- Vue コンポーネント（Props 型と関数名で仕様が読めるため）
- `z.object(...)` の zod スキーマ定義（フィールド名が自明な場合）

### 最小構成

```ts
/**
 * 記事ディレクトリ配下の Markdown ファイルを読み込み、新着順で返す。
 * draft: true の記事は除外する。
 *
 * @param postsDir - 記事ディレクトリの絶対パス
 * @returns 新着順（date 降順）でソートされた記事配列
 */
export async function loadArticles(postsDir: string): Promise<Article[]> {
```

### 記述ルール

- 1 行目は「〜する。」形式で処理の概要を書く
- `@param` は引数の型が自明でも、**意味・制約**が名前から読み取れない場合は書く
- `@returns` は戻り値の内容が関数名から明確でない場合に書く
- `@throws` は例外を意図的に投げる関数に書く
- `@example` は呼び出し方が非自明な場合に書く
- 自明な内容の繰り返しは書かない（`// string を返す` など）
