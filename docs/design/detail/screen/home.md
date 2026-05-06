---
last_updated: 2026-05-06
---

# 画面設計 — トップページ（開発者向け）

## 対象読者

フロントエンド担当の開発者。実装前に本ドキュメントと [スタイルガイド](../../style-guide.md) を合わせて確認すること。
ユーザー視点の振る舞いは [PO向け画面設計](../../screen/home.md) を参照すること。

---

## トップページ（`HomeView.vue`）

### コンポーネント構成

```
HomeView.vue
└── v-container（max-width: 480px）
    └── div.text-center.py-16
        ├── h1.text-display-small「ファンタジーライン」
        ├── p.text-body-large.text-medium-emphasis（説明文）
        ├── [未ログイン時]
        │   ├── v-text-field（ユーザー名入力）
        │   └── v-btn color="primary"「始める」
        └── [ログイン済み時]
            ├── p.text-body-medium.text-medium-emphasis（おかえりなさいメッセージ）
            └── v-btn color="primary" to="/villages"「村一覧を見る」
```

### 認証状態の判定

`localStorage.getItem('userId')` の有無で未ログイン／ログイン済みを切り替える。

```typescript
const userId = ref(localStorage.getItem('userId'))
```

`userId` が `null` → 未ログイン表示（ユーザー名入力フォーム）
`userId` が文字列 → ログイン済み表示（「村一覧を見る」ボタン）

### 「始める」ボタンの処理

```typescript
function start() {
  if (!inputName.value.trim()) return
  localStorage.setItem('userId', inputName.value.trim())
  userId.value = inputName.value.trim()
  router.push('/villages')
}
```

1. ユーザー名を `localStorage` に `userId` キーで保存する
2. ルーターで `/villages` に遷移する

### バリデーション

- ユーザー名が空（空文字・スペースのみ）の場合、「始める」ボタンを `:disabled="!inputName.trim()"` で無効化する
- `:rules` による Vuetify バリデーションは使用しない（シンプルなボタン制御で十分）

---

## アプリケーションレイアウト（`App.vue`）

### 構成

```
App.vue
└── v-app
    ├── v-app-bar color="primary" flat elevation="1"
    │   ├── v-app-bar-title: RouterLink to="/"「ファンタジーライン」
    │   └── [append slot]: v-btn to="/villages" variant="text" color="white"「村一覧」
    └── v-main
        └── RouterView
```

### ナビゲーション

- ヘッダーに「村一覧」リンクを常時表示する
- 未ログイン状態でクリックした場合、ルーターガード（`router.beforeEach`）が `/` にリダイレクトする

---

## 変更履歴

| PBI | 変更日 | 変更内容 |
|---|---|---|
| PBI-001 | 2026-05-06 | 初版作成。トップページ・アプリレイアウトの開発者向け画面設計 |
