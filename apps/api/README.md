# @fantasy-life/api

Lambda ハンドラー群と Drizzle ORM による MySQL アクセス層。

## テスト

[Google のテストサイズ定義](https://testing.googleblog.com/2010/12/test-sizes.html) に基づいてテストを分類しています。

### テストサイズ定義

| サイズ | ディレクトリ | スクリプト | 目安時間 |
|--------|-------------|-----------|---------|
| Small  | `tests/small/`  | `npm run test:small`  | ミリ秒単位 |
| Medium | `tests/medium/` | `npm run test:medium` | 数秒〜数十秒 |
| Large  | *(未実装)*      | —                     | 数分      |

```
tests/
  small/        # Small テスト
  medium/       # Medium テスト
    test/
      mysql-setup.ts  # testcontainers セットアップヘルパー
```

### Small テスト

外部リソースに依存しないテスト。

**条件（すべて満たすこと）**
- DB・ネットワーク・ファイルシステムへのアクセスなし
- 単一プロセス内で完結
- モックによる依存関係の代替は可

**対象例**
- バリデーションロジック
- レスポンス形式の検証
- 純粋関数

### Medium テスト

ローカルリソースを使うテスト。

**条件**
- testcontainers による Docker コンテナ上の DB への接続を伴う
- ネットワーク通信はローカル（localhost）のみ
- Lambda ハンドラーと DB の統合動作を検証する

**規約**
- `tests/medium/test/mysql-setup.ts` の `setupMysqlContainer()` でコンテナを起動する
- `vi.doMock` + `vi.resetModules()` + 動的 `import` で DB クライアントを注入する
- テスト間のデータ干渉を防ぐため `beforeEach` でテーブルをクリアする

### Large テスト

実際の外部サービス（AWS, 本番 DB など）を使う E2E テスト。現時点では未実装。

## テストの実行

```bash
# 全テスト
npm run test

# Small のみ（Docker 不要・高速）
npm run test:small

# Medium のみ（要 Docker）
npm run test:medium
```
