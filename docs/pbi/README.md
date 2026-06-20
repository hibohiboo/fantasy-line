# PBI 一覧

> このプロダクトのPBIは「CRUD」ではなく「時間変化」を中心に設計する

## 一言コンセプト

**「設定を入力すると、世界が勝手に動き出す」**

---

## エピック構成

| # | エピック | PBI | MVP |
|---|---|---|---|
| 0 | [認証](00-authentication/) | PBI-014 | ✅ 前提 |
| 1 | [村の管理](01-village-management/) | PBI-001, 002 | ✅ |
| 2 | [住人の管理](02-resident-management/) | PBI-003, 004, 015 | ✅ / Phase 2 |
| 3 | [職業・生活リズム](03-job-schedule/) | PBI-005, 006 | ✅ |
| 4 | [1日シミュレーション](04-daily-simulation/) | PBI-007, 008 | ✅ 最重要 |
| 5 | [可視化・統計](05-visualization/) | PBI-009, 010 | Phase 2 |
| 6 | [魔力システム](06-mana-system/) | PBI-011, 012, 013 | Phase 2-3 |
| — | [インフラ・基盤](00-infrastructure/) | PBI-016 | Phase 2 |
| 7 | [マルチテナント SaaS](07-multitenant-saas/) | PBI-SaaS-001a〜d | Phase 2 |

---

## PBI 一覧

### エピック 0 — 認証

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-014](00-authentication/PBI-014.md) | ログインする | MVP（前提）✅ |
| [PBI-018](00-authentication/PBI-018.md) | モックログイン E2E テストのフレーキーを修正する | 低 |

### エピック 1 — 村の管理

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-001](01-village-management/PBI-001.md) | 村を作成する | MVP |
| [PBI-002](01-village-management/PBI-002.md) | 村の基本設定を編集する | MVP |
| [PBI-017](01-village-management/PBI-017.md) | 村作成フォームのフロントエンドテストを修正する | Phase 2 |

### エピック 2 — 住人の管理

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-003](02-resident-management/PBI-003.md) | 住人を登録する | MVP |
| [PBI-004](02-resident-management/PBI-004.md) | 住人の詳細情報を編集する | MVP |
| [PBI-015](02-resident-management/PBI-015.md) | 住人を削除する | Phase 2 |

### エピック 3 — 職業・生活リズム

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-005](03-job-schedule/PBI-005.md) | 職業を定義する | MVP |
| [PBI-006](03-job-schedule/PBI-006.md) | 生活リズムテンプレートを設定する | MVP |

### エピック 4 — 1日シミュレーション

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-007](04-daily-simulation/PBI-007.md) | 住人の1日を生成する | **MVP 最重要** |
| [PBI-008](04-daily-simulation/PBI-008.md) | 村全体の1日を生成する | MVP |

### エピック 5 — 可視化・統計

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-009](05-visualization/PBI-009.md) | 起床・就寝の分布を表示する | Phase 2 |
| [PBI-010](05-visualization/PBI-010.md) | 行動ヒートマップを表示する | Phase 2 |

### エピック 6 — 魔力システム

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-011](06-mana-system/PBI-011.md) | 家ごとの魔力消費を定義する | Phase 2 |
| [PBI-012](06-mana-system/PBI-012.md) | 魔力消費をシミュレーションする | Phase 2 |
| [PBI-013](06-mana-system/PBI-013.md) | 魔力消費の統計を可視化する | Phase 3 |

### インフラ・基盤

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-016](00-infrastructure/PBI-016.md) | villages・residents の ID を UUID v7 に移行する | Phase 2 |
| [PBI-024](00-infrastructure/PBI-024.md) | プロジェクトのテスト戦略を策定する | 中 |
| [PBI-025](00-infrastructure/PBI-025.md) | MCP サーバー（Serena / context7）の採用可否を判断する | ✅ 完了 |

### エピック 7 — マルチテナント SaaS

| PBI | タイトル | 優先度 |
|---|---|---|
| [PBI-SaaS-001](07-multitenant-saas/PBI-SaaS-001.md) | マルチテナント SaaS 化 — エピック概要 | — |
| [PBI-SaaS-001a](07-multitenant-saas/PBI-SaaS-001a.md) | Cognito 設計（claim 定義・グループ構成） | Phase 2 ✅ 設計完了 |
| [PBI-SaaS-001b](07-multitenant-saas/PBI-SaaS-001b.md) | DB スキーマ per テナント設計（命名規則・接続切替・認可テーブル） | Phase 2 ✅ 設計完了 |
| [PBI-SaaS-001c](07-multitenant-saas/PBI-SaaS-001c.md) | テナントプロビジョニング・ユーザー管理フロー設計 | Phase 2 ✅ 設計完了 |
| [PBI-SaaS-001d](07-multitenant-saas/PBI-SaaS-001d.md) | API 認可パターン設計 + 既存ドキュメント横断更新 | Phase 2 ✅ 設計完了 |
| [PBI-SaaS-002](07-multitenant-saas/PBI-SaaS-002.md) | Cognito User Pool CDK 実装 | Phase 2 |
| [PBI-SaaS-003](07-multitenant-saas/PBI-SaaS-003.md) | DB スキーマ per テナント マイグレーション実装 | Phase 2 ✅ 完了 |
| [PBI-SaaS-004](07-multitenant-saas/PBI-SaaS-004.md) | Hono + tenantContext + requirePermission ミドルウェア実装 | Phase 2 |
| [PBI-SaaS-005](07-multitenant-saas/PBI-SaaS-005.md) | テナントプロビジョニング Lambda 実装 | Phase 2 |
| [PBI-SaaS-006](07-multitenant-saas/PBI-SaaS-006.md) | テナント内ユーザー管理 API 実装 | Phase 2 |
| [PBI-SaaS-007](07-multitenant-saas/PBI-SaaS-007.md) | ユーザー管理画面（フロントエンド）実装 | Phase 2 |

---

## MVP 優先順

「世界が1日動く」体験を最速で出すことを最優先とする。

```
PBI-014 → PBI-001 → PBI-003 → PBI-005 → PBI-007 → PBI-008
（認証）   （村）    （住人）   （職業）   （1日生成）  （村全体）
```

---

## 将来PBI（差別化強化）

| タイトル | 内容 |
|---|---|
| NPCが1日の出来事を語る | 「今日は忙しかった」と理由付きで説明 |
| 村の出来事ログ生成 | 1日の出来事をストーリー文章として出力 |
| NPC人格モデル | 性格・価値観に基づいた行動判断 |
