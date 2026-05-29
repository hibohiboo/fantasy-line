---
name: frontend-patterns
description: SSR 前提のフロントエンドにおけるコンポーネント設計、状態管理、データ取得、アクセシビリティの実務パターン
---

# フロントエンド パターン Skill

このプロジェクトは SSR 前提のアプリである。

---

## 目的

- 規模に合った、堅実なフロントエンド構成を持つ
- 機能フォルダ構成を崩さない
- アクセシビリティと安全性を確保する

## 使用するタイミング

- 新しいページ・機能を追加するとき
- 既存コンポーネントの責務分割を見直すとき
- 状態管理の選択に迷うとき
- VRT / E2E の対象を増減するとき

## 手順

### 1. ページとデータ取得の責務を分ける

- ページコンポーネント（ルート）は構造とレイアウトに集中する
- データの取得・整形・検証は機能フォルダ内の純粋関数に分離する

例（`apps/frontend/src/features/popular-posts/`）:

```ts
// fetchPopularPosts.ts
import { popularPostSchema } from './popularPostsSchema';

export async function fetchPopularPosts(): Promise<PopularPost[]> {
  const res = await fetch('/popular-posts.json');
  if (!res.ok) throw new Error('Failed to load popular posts');
  const json: unknown = await res.json();
  return popularPostSchema.array().parse(json);
}
```

### 2. コンポーネント設計

- props は `interface` / `type` で明示
- コンポジション優先（`slots` を活かす、props でモード分岐に頼りすぎない）

### 3. 状態管理

- グローバルストアは「複数機能でまたぐ状態が出てから」導入する

### 4. パフォーマンス

- リストの仮想化は「明らかに長くなる」場合のみ導入

### 5. アクセシビリティ

- フォーカス可視を消さない
- 主要操作はキーボードでも実行できる
- 画像 alt は意味のある内容を入れる（装飾は `alt=""`）
- フォームには `<label>` を結びつける

### 6. VRT / E2E

- 代表ページに限って Playwright + reg-suit で VRT
- 全記事 VRT は行わない
- E2E はナビゲーション、主要導線に絞る

## チェックリスト

新しい UI を作るとき、または PR 提出前に確認する。

- [ ] SSR で配信できる前提を崩していないか
- [ ] ページコンポーネントが薄く、データ整形を機能フォルダに移しているか
- [ ] zod でデータを検証してから UI に渡しているか
- [ ] 機能フォルダ内に関連ファイル（コンポーネント・型・フック・テスト）が揃っているか
- [ ] アクセシビリティ（キーボード・alt・見出し階層）を確認したか
- [ ] パフォーマンス最適化を「計測してから」入れているか
- [ ] VRT 対象が肥大していないか（代表ページのみか）
- [ ] 生 HTML 注入がないか

## 禁止事項

- ページコンポーネントに大量の fetch / 整形ロジックを詰め込む
- 1 機能のためだけに `shared/` を肥大化させる
- 全記事 VRT を導入する
- アクセシビリティ機能（フォーカス可視・スクリーンリーダー対応）を CSS / JS で潰す
