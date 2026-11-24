# 糸譜変換（仮）

五線譜の楽譜データ（MusicXML）から、弾きやすい調弦の候補3案と箏の縦譜を作るWebアプリ。

## フォルダ
- `frontend/` 画面
- `backend/` 楽譜の解析・調弦の探索・弦の割り当て（Python）


## Dockerでバックエンドを開発する

必要なもの：Git、起動済みのDocker Desktop（またはDocker EngineとCompose）。
ホストPCへのPythonのインストールは不要です。
Python 3.14.8を使い、ベースイメージもダイジェストで固定しています。
直接使うライブラリとその依存ライブラリのバージョンをbackend/requirements.txtで固定しています。
動作確認済みのプラットフォームはLinux ARM64（Apple SiliconのDocker）です。

### 初回の起動

リポジトリをcloneし、itofuフォルダで実行します。

```bash
docker compose up --build
```

- APIドキュメント：http://localhost:8000/docs
- 動作確認：http://localhost:8000/api/health （`{"status":"ok"}`を返す）
- まだ楽譜変換のAPIは実装していません。main.pyはAPI担当者が拡張する土台です。

backendフォルダをコンテナの/appと共有しています。Pythonコードを保存するとuvicornの
--reloadでAPIが再起動します。requirements.txtやDockerfileを変えた場合は、ライブラリを
追加したことをチームに伝えたうえで、`docker compose up --build`で作り直してください。
リロード設定は開発用です。本番公開時は別の起動設定を用意してください。

### 動作確認用スクリプト

API起動中なら、別のターミナルで実行します。

```bash
docker compose exec backend python run_local.py
```

### 停止・再起動・ログ

起動中のターミナルでCtrl+Cを押すと停止します。

```bash
docker compose down
docker compose up
docker compose logs --tail=100 backend
```

`docker compose up`はフォアグラウンドで動くので、以降のコマンドは別のターミナルで実行します。

### 環境変数とフロント接続

標準設定では.envなしで起動できます。変更する場合は、リポジトリ直下で次を実行します。

```bash
cp .env.example .env
```

.envはGit管理しません。APIキーなどの秘密情報は.env.exampleに書かないでください。
Compose用の.envの値がすべて自動的にコンテナへ渡るわけではありません。
将来APIキーを追加する場合は、必要な項目だけComposeのenvironmentで渡してください。

同じPCのフロントはhttp://localhost:8000に接続します。
CORS_ORIGINSは許可するフロントのURL（スキーム・ホスト・ポート）をカンマで区切って指定します。
標準ではlocalhostと127.0.0.1の3000番・5173番を許可しています。

別のPCから同じWi-Fi経由で使う場合：

1. APIを動かすPCの.envでBACKEND_BIND_ADDRESS=0.0.0.0に変更します。
2. CORS_ORIGINSに、ブラウザで開くフロント画面のURLを追加します。
3. `docker compose up -d --build`で起動設定を反映します。
4. フロントのAPI接続先をhttp://APIを動かすPCのLAN内IPアドレス:8000に変更します。

0.0.0.0は待ち受け用の指定です。ブラウザの接続先にはLAN内IPアドレスを使います。
APIを動かすPCは起動したままにします。Wi-Fiの端末間通信制限やファイアウォールで接続できない場合があります。
この構成は開発用で、インターネットへの本番公開用ではありません。
ポートが使用中なら.envのBACKEND_PORTを8001などに変更し、接続URLのポートも合わせます。

### Gitでの共同開発

各自のPCでDockerを動かし、コードは作業用ブランチとプルリクエストで共有します。
constants.py、schemas.py、requirements.txtの変更は計画どおりDiscordで一言伝えてください。
requirements.txtにDocker起動用ライブラリを追加し、main.pyに最小のAPI土台を置いています。
API担当者はこのmain.pyを引き継いでください。
backend/privateの曲と.envはコミットしません。privateはイメージにも含めませんが、
開発時はbackend全体を共有するため自分のコンテナからは利用できます。
