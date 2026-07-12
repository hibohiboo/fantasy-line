/* eslint-disable sonarjs/no-hardcoded-passwords -- Amplify UI i18n dictionary keys, not passwords */
export const translations = {
  ja: {
    // サインイン画面
    'Sign In': 'サインイン',
    'Sign in': 'サインイン',
    Email: 'メールアドレス',
    Password: 'パスワード',
    'Enter your Email': 'メールアドレスを入力',
    'Enter your Password': 'パスワードを入力',
    'Forgot your password?': 'パスワードをお忘れですか？',

    // パスワードリセット
    'Reset your password': 'パスワードをリセット',
    'Send code': 'コードを送信',
    'Back to Sign In': 'サインインに戻る',
    Code: '確認コード',
    'Confirmation Code': '確認コード',
    'Enter your code': '確認コードを入力',
    'New password': '新しいパスワード',
    'Enter your new password': '新しいパスワードを入力',
    'Confirm Password': 'パスワードを確認',
    Submit: '送信',
    Confirm: '確認する',

    // パスワード変更（初回ログイン）
    'Change Password': 'パスワードを変更',

    // エラーメッセージ（詳細を明かさない方針に従い、区別しない）
    'Incorrect username or password.': 'メールアドレスまたはパスワードが違います。',
    'User does not exist.': 'メールアドレスまたはパスワードが違います。',
    'Password attempts exceeded':
      'ログイン試行回数が上限に達しました。しばらくしてから再試行してください。',
    'Temporary password has expired and must be reset by an administrator.':
      '仮パスワードの有効期限が切れています。管理者にお問い合わせください。',
    'Password did not conform with policy: Password not long enough':
      'パスワードは8文字以上で設定してください。',
    'An account with the given email already exists.':
      '入力されたメールアドレスのアカウントはすでに存在しています。',
  },
} as const
/* eslint-enable sonarjs/no-hardcoded-passwords */
