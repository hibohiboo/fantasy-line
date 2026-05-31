[sam local api](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/using-sam-cli-local-start-api.html)

# 接続

## Endpoint IDを確認

```
aws ec2 describe-instance-connect-endpoints --query 'InstanceConnectEndpoints[0].InstanceConnectEndpointId' --output text
```

## Aurora クラスターエンドポイントのIP を確認

```
aws rds describe-db-clusters --query 'DBClusters[0].Endpoint' --output text
```

Aurora エンドポイントを IP に解決(powershell)

```powershell
Resolve-DnsName <上記コマンドの結果（xxx.northeast-1.rds.amazonaws.com）>
```

Aurora はフェイルオーバー時に IP が変わる可能性がある。
接続できなくなったら再度Resolve-DnsName で IP を取り直す必要がある。

## トンネルを開く

```
aws ec2-instance-connect open-tunnel \
  --instance-connect-endpoint-id eice-xxxxxxxxxxxxxxxxx \
  --remote-port 3389 \
  --local-port 13306 \
  --private-ip-address <Aurora クラスターエンドポイントのIP>
```

## SecretMangerに格納されているAuroraパスワードの確認

```

aws secretsmanager get-secret-value \
  --secret-id $(aws secretsmanager list-secrets --query 'SecretList[?contains(Name, `AuroraCluster`)].Name' --output text) \
  --query 'SecretString' --output text | jq -r '.password'
```

## amdminユーザで接続

| 項目     | 設定値                    |
| -------- | ------------------------- |
| ユーザ   | admin                     |
| host     | 127.0.0.1                 |
| port     | 13306                     |
| password | 取得したAauroraパスワード |
| database | myapp                     |
