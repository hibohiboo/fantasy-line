-- ローカル開発用: testuser に全スキーマへの CREATE/DROP 権限を付与する
-- 本番環境では各スキーマに必要な最小権限のみを IAM / SecretsManager で管理すること
GRANT ALL PRIVILEGES ON *.* TO 'testuser'@'%';
FLUSH PRIVILEGES;
