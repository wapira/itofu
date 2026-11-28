# itofu（糸譜変換）

五線譜の楽譜データ（MusicXML）を入れると、弾きやすい調弦の候補1〜3案と、糸譜(箏の楽譜)が自動で出てくるWebアプリ。
PDF・PNGを読み取り、原本と五線譜を見比べて修正してから糸譜へ変換する確認・編集機能も試作しています。
58ハッカソン2026（テーマ「ito」）の作品です。

- **ペルソナ**：部活でJ-POPを弾きたいけど、五線譜を箏の楽譜に書き直すのが大変な人
- **使い方**：MusicXMLをアップロード → 調弦の候補3案（そのまま／バランス／押し手ゼロ）から選ぶ → その調弦に合わせた縦譜が表示される

## 担当

| 担当 | 内容 |
|---|---|
| フロント担当 | 画面 |
| 解析担当 | ② 解析、④ 整形、API |
| アルゴリズム担当 | ③ アルゴリズム、Docker環境 |


## 全体の流れ

```
MusicXML
 → ② 解析：音のリストにする
 → ③ アルゴリズム：調弦の3案と、各音の弦・押し手を決める
 → ④ 整形：フロントと約束したJSONにする
 → API：フロントに返す
 → 画面：調弦の候補と縦譜を表示する
```

① 入口（PDF・PNG → MusicXML / 音データ）と人間による確認・編集は試作実装済みです。
実行環境・API仕様・フロント担当への共有事項は、下の「PDF・PNGの読み取りと確認・編集（試作）」を参照してください。

## 技術

- フロント：Vite + Vanilla JS。確認・編集画面ではOpenSheetMusicDisplay（五線譜描画）とPDF.js（原本PDF描画）を使用
- バックエンド：Python 3.14.8、FastAPI ＋ uvicorn、music21（MusicXMLの読み込み）
- 環境：Docker

## フォルダ構成

```
frontend/              画面（設計は frontend/README.md）
backend/
  koto/
    constants.py       箏の定数：弦名、平調子、押し手（共有）
    schemas.py         Score / Note / Candidateなどの共通データ型
    omr.py             ① 読み取り：PDF・PNG → MusicXML・曲情報・音データ
    parse.py           ② 解析：MusicXML → 音のリスト（解析担当）
    assign.py          ③ 弦の割り当て（アルゴリズム担当）
    tuning.py          ③ 調弦の探索（アルゴリズム担当）
    grid.py            ④ 整形：音を「小節 → 拍 → 音」の3段に並べる（解析担当）
    to_json.py         ④ 整形：フロントと約束したJSONを組み立てる（解析担当）
  main.py              FastAPI：MusicXML変換・PDF/PNG読み取り・確認後の糸譜変換
  run_local.py         手元での動作確認用
  requirements.txt     使うライブラリの一覧
  samples/             テスト用の楽譜（著作権の切れた曲だけ）
  private/             J-POPのデモ曲を置く場所（GitHubには上がらない）
```

Docker環境とAPIの土台として、次のファイルを追加済みです。

- `docker-compose.yml`：バックエンドの起動・ポート公開・自動リロード設定
- `backend/Dockerfile`：Python 3.14.8と依存ライブラリの環境構築
- `backend/.dockerignore`：イメージに含めないファイルの指定
- `backend/main.py`：CORS設定、動作確認、MusicXML変換、PDF/PNG読み取り、確認後の糸譜変換のAPI
- `.env.example`：環境変数の記入例

`schemas.py`、`parse.py`、`assign.py`、`tuning.py`、`grid.py`、`to_json.py`は実装済みです。
PDF・PNG認識の`omr.py`と確認・編集用APIも追加していますが、Audiveris・OCR言語データのDockerへの組み込みは未対応です。

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
- MusicXML変換：`POST /api/analyze`（`file`フィールドで送信、5MiBまで）
- PDF・PNG読み取りは追加のAudiveris環境が必要です。下の確認・編集機能の説明を参照してください。

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
APIの窓口はmain.pyです。APIの形式を変更するときはフロント担当にも共有してください。
backend/privateの曲と.envはコミットしません。privateはイメージにも含めませんが、
開発時はbackend全体を共有するため自分のコンテナからは利用できます。

## 箏の基本

- 弦は13本。奥から 一 二 三 四 五 六 七 八 九 十 斗 為 巾（一番手前が巾。番号は0〜12）
- 平調子（基本の調弦）：一を0としたときの半音差 `[0, -7, -5, -4, 0, 1, 5, 7, 8, 12, 13, 17, 19]`
- 押し手：弦を押して音を上げる。弱押し（ヲ）＝半音、強押し（オ）＝全音

## API

現在のバックエンドに実装されているAPIは次の4つです。

- `GET /api/health`：動作確認。`{"status":"ok"}` を返します。
- `POST /api/analyze`：MusicXMLを`multipart/form-data`の`file`で受け取り、調弦候補・糸譜のJSONを返します（空でない5MiB以下）。
- `POST /api/review/recognize`：PDF・PNGを読み取り、編集用のScore・MusicXML・注意事項を返します。
- `POST /api/review/convert`：確認・編集したScoreを受け取り、調弦候補・糸譜のJSONを返します。

`POST /api/omr`というURLは現在実装されていません。
フロント担当は、各APIの送受信形式と接続先・CORS設定をバックエンド担当と共有してください。

### PDF・PNGの読み取りと確認・編集（試作）

原本と読み取り結果の五線譜を見比べ、人間が修正してから糸譜に変換する機能です。
既存のMusicXML変換とは別に、次の流れで動きます。

```text
PDF / PNG
 → POST /api/review/recognize
 → Score（編集用の音データ）+ MusicXML + 未認識項目・注意事項
 → フロント：原本と五線譜を表示、人間が音・休符・タイ・文字情報を修正
 → POST /api/review/convert（編集後のScore、confirmed: true）
 → 調弦候補・糸譜のJSON
```

**担当範囲と接続する場所**

- バックエンド：`backend/main.py` がAPIの窓口。`backend/koto/omr.py` がAudiverisを呼び出して認識し、既存の `parse.py` / `tuning.py` / `assign.py` / `grid.py` / `to_json.py` で解析・変換します。
- フロントエンド：APIへファイルを送り、返ってきたデータを表示・編集し、確認後のScoreを送ります。接続の見本は `frontend/src/review.js` の `request()` と2つのAPIを呼ぶ箇所です。
- 五線譜表示用のMusicXMLは、編集するたびにフロント側でScoreから作り直します（`review-notation.js`）。描画・音符の選択は `review-staff.js`、PDF表示は `review-source.js`、編集・拍数チェックは `review-model.js` が担当します。
- 確認・編集画面は `frontend/review.html`。通常の画面は `frontend/index.html` です。通常画面の `src/api.js` は現在sample.jsonを返す仮実装のため、review画面とは接続状況が異なります。

**バックエンドの実行環境**

Python依存は `backend/requirements.txt` にあります。
PDF・PNGの認識には、それに加えて、**バックエンドと同じ実行環境にAudiverisのCLIとOCR言語データ（既定：jpn+eng）が必要**です。
`AUDIVERIS_BIN` でCLIの実行ファイルを指定できます。未指定の場合はPATH上の `audiveris` を使います。

現在のDockerfileにはAudiveris・OCR言語データを組み込んでいません。
そのため、現状のDockerだけでPDF・PNG認識が動くわけではありません。
ホストPCにインストールしたMacアプリのパスも、そのままLinuxコンテナでは使えません。
今回の試作はホストPCに導入したAudiverisを、同じPC上のPythonから呼び出して確認しています。

ホストPCで起動する例（Audiveris・OCR言語データを別途準備したうえで実行）：

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
# Mac版Audiverisを標準の場所へインストールした場合の例
export AUDIVERIS_BIN=/Applications/Audiveris.app/Contents/MacOS/Audiveris
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**フロント担当に共有する接続設定**

Viteを `frontend/` から起動するため、設定は **`frontend/.env`** に書きます。

```env
VITE_API_BASE=http://127.0.0.1:8000
```

- `VITE_API_BASE` はバックエンドの接続先です。APIの各パスがこのURLの後ろに付きます。末尾の `/` は付けません。
- 現在の手元の確認環境はバックエンド8001番・フロント5174番です。その場合は `VITE_API_BASE=http://127.0.0.1:8001` にします。8001が必須という意味ではありません。
- リポジトリ直下のCompose用 `.env` は、フロントの `frontend/.env` とは別です。Viteが直下の設定を自動で読む構成にはなっていません。
- フロントの環境変数を変更したら、Viteを再起動します。
- `127.0.0.1` / `localhost` は、ブラウザを使う人自身のPCです。別の人のバックエンドへ接続する場合は、そのPCのLAN内IPなどを指定します。
- バックエンドの `CORS_ORIGINS` には、**ブラウザで開くフロントのURL**を指定します。APIのURLではありません。標準設定では5173番を許可しています。5174番で動かす場合は、バックエンド起動時に `CORS_ORIGINS=http://127.0.0.1:5174,http://localhost:5174` などを指定します。

別のターミナルで、リポジトリ直下から起動します。

```bash
cd frontend
npm ci
npm run dev
```

Viteが表示したURLの `/review.html` を開きます（標準例：`http://localhost:5173/review.html`）。
フロントの確認・編集画面は実APIに接続します。認識済みJSONを読み込んで表示・編集だけを試すこともできます。

#### 1. 読み取りAPI

```text
POST /api/review/recognize
Content-Type: multipart/form-data
```

送信フィールドは `file`（PDFまたはPNGのファイル）です。空でない25MiB以下にしてください。
拡張子だけでなくファイル内容でPDF・PNGを判定します。PNGは4000万画素以下です。

フロントから送る例：

```js
const form = new FormData();
form.append('file', file);
const response = await fetch(`${API_BASE}/api/review/recognize`, {
  method: 'POST',
  body: form,
});
const result = await response.json();
if (!response.ok) throw new Error(result.detail || '読み取りに失敗しました');
```

FormDataの `Content-Type` はブラウザに設定させます。手動指定するとboundaryが欠けて受け取れない場合があります。

成功時（HTTP 200）のJSON例。`musicxml` の中身は例では省略していますが、実際には完全なXML文字列です。

```json
{
  "score": {
    "title": "曲名",
    "composer": "作曲者",
    "tempo": 80,
    "beats": 4,
    "beat_type": 4,
    "notes": [
      {
        "midi": 60,
        "measure": 0,
        "offset": 0,
        "beats": 4,
        "rest": false
      }
    ]
  },
  "musicxml": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>…",
  "missing_fields": [
    "tempo"
  ],
  "warnings": [
    "自動認識の結果です。元の譜面と音符・リズム・文字を照合してください。"
  ]
}
```

- `score`：編集対象の曲情報・音データ。形式は下の「ScoreとNoteの約束」を参照。
- `musicxml`：認識直後のMusicXMLの文字列。フロントでは調号・音部記号・改行位置などの取得にも使います。編集後も自動で更新される値ではありません。
- `missing_fields`：未認識の項目名の配列（`title` / `composer` / `tempo`）。すべて認識できた場合は空配列です。
- `warnings`：注意事項の文字列配列。原本との照合、未認識項目などを伝えます。
- タイトル・作曲者を認識できなかった場合は空文字です。テンポを認識できなかった場合は仮の80 BPMになり、`missing_fields` に `tempo` が入ります。80を認識結果だと決めつけず、人間が確認できるようにしてください。

#### 2. 確認後の糸譜変換API

```text
POST /api/review/convert
Content-Type: application/json
```

送信JSON例：

```json
{
  "score": {
    "title": "曲名",
    "composer": "作曲者",
    "tempo": 80,
    "beats": 4,
    "beat_type": 4,
    "notes": [
      {
        "midi": 60,
        "measure": 0,
        "offset": 0,
        "beats": 4,
        "rest": false
      }
    ]
  },
  "confirmed": true
}
```

- `score` に**人間が修正した最新のデータ**を入れます。認識直後の `musicxml` は送りません。
- `confirmed: true` は人間が原本を確認したことを示します。省略またはfalseならHTTP 400です。
- フロントの編集用ID（`_id`）や表示用の `notation` / `_notation` は送りません。
- 音・休符が1〜10,000件、音符が1件以上必要です。拍数の空白・重なりなどはバックエンドでも検査し、不備があればHTTP 422で返します。

成功時（HTTP 200）は `POST /api/analyze` と同じ最終JSONです。
具体的なJSON例・糸譜の表示規則は [frontend/README.mdの「JSONの形」](frontend/README.md#jsonの形) を参照してください。

- 最上位：`title` / `composer` / `tempo` / `time` / `candidates`。
- `time`：`{ "beats": 4, "beatType": 4 }`。**入力Scoreの `beat_type` と、出力の `beatType` は名前が異なります。**
- 各候補：`id` / `label` / `description` / `changedStrings` / `oshiCount` / `tuning` / `measures`。
- `tuning`：13本の弦の音名の配列。`measures`：小節 → 拍 → 表示要素の3段の配列。
- 表示要素には弦名 `string`、必要に応じて押し手記号 `oshi`・繰り返し `repeat`、または休符・持続 `rest`・短い休符・持続 `short` が入ります。
- 候補はA → B → Cの順です。平調子で弾けない曲にはAがなく、同じ調弦はまとめるため、**候補数は1〜3件**です。IDの連続性や3件あることを前提にしないでください。全候補を作れない場合はHTTP 422です。

#### ScoreとNoteの約束（フロント・バック共通）

Scoreの項目：

- `title` / `composer`：文字列。確認後の送信では各200文字以下。
- `tempo`：四分音符のBPM。確認後の送信では1〜4000の整数。
- `beats`：拍子の分子。1〜16の整数。
- `beat_type`：拍子の分母。1 / 2 / 4 / 8 / 16 / 32。
- `notes`：Noteの配列。

Noteの項目：

- `midi`：音高の整数0〜127。60は中央のド。休符では `null`。
- `measure`：小節番号。**0が1小節目**。確認後の送信では0〜1999。
- `offset`：小節の先頭から何拍後に始まるか。0以上、Scoreの `beats` 未満。
- `beats`：音・休符の長さ。0より大きく64拍以下。**Scoreの `beats` は拍子、Noteの `beats` は長さです。**
- `rest`：休符ならtrue、音符ならfalse。

時間の単位は拍子の分母に合わせます。4/4なら1拍＝四分音符、6/8なら1拍＝八分音符です。
テンポのBPMはこれとは別に四分音符基準です。
タイでつながった音は長さを合計した1件で、小節をまたぐこともあります。
休符の例は `{ "midi": null, "measure": 0, "offset": 0, "beats": 1, "rest": true }` です。

#### エラー・試作の範囲

通常の処理エラーはJSONの `detail` に説明を返します。

```json
{"detail": "原本と見比べて確認してから確定してください"}
```

- HTTP 400：空・サイズ超過・未対応形式の入力、確認済みフラグがない場合など。
- HTTP 422：認識失敗、拍数不足・音の重なりなどの不備、箏で弾けない場合など。
- HTTP 503：AudiverisのCLIが見つからない場合。
- JSONの型・必須項目などのリクエスト検証エラーもHTTP 422ですが、FastAPIが返す `detail` は配列になります。フロントでは文字列・配列の両方を表示できるようにしてください。
- 対象は一定拍子・先頭の1パートの単旋律です。和音は既存parse.pyと同様に一番上の音だけを扱います。
- 自動認識は誤りを含みます。拍数が合っても音高・タイなどが正しいとは限らないため、人間の原本確認を挟みます。
- 現在の五線譜表示は連符など一部の長さに未対応です。表示できないデータはテキスト編集へ案内します。歌詞・強弱記号・原本と同じ余白や段組みは再現対象外です。

API起動後、接続先の `/docs` からリクエスト形式を確認できます（標準例：`http://127.0.0.1:8000/docs`）。


## 部品の間の約束

### ② → ③ 音のリスト（1音ごと）

- `midi`：音の高さ（休符はなし）
- `measure`：何小節目か（0始まり）
- `offset`：小節の中の位置（拍単位。0, 1, 1.5 など）
- `beats`：長さ（拍単位）
- `rest`：休符かどうか

和音は一番上の音だけ。タイでつながった音は1つにまとめる。

### ③ → ④ 調弦の候補（3案）

- `id` / `label`：A そのまま、B バランス、C 押し手ゼロ（押し手0にできないときは「押し手最少」）
- `tuning`：13本それぞれの音（midi）
- `base`：基音（一の音）
- `changes`：平調子から変えた弦と、何半音動かしたか
- `changedStrings`：変えた弦の本数
- `oshiCount`：押し手の回数
- `assignments`：音のリストと同じ順番で、各音の弦番号と押し手（0なし／1弱／2強）。休符は空

### ④ → フロント

JSONの形と縦譜の描き方は [frontend/README.md](frontend/README.md) にまとめています（フロントとの約束はこちらが正）。

## ③ アルゴリズム

解き方はアルゴリズム担当にお任せ。箏のルールで分からないことは解析担当に聞く。

**弦の割り当て（assign.py）**
- 各音を、その音の弦をそのまま弾くか、半音下の弦を弱押し／全音下の弦を強押しして出す
- 押し手が少なく、手の移動（弦番号の差）が少ない弾き方が良い
- どの弦でも出せない音がある調弦は、良くない

**調弦の探索（tuning.py）**
- ルール
  - 各弦は、平調子の位置から上下1オクターブまで
  - 二〜巾は、隣の弦より低くしない（同じ高さはOK）
  - 一は例外：五と同じ音か、五の1オクターブ下
- 出してほしい3案
  - A そのまま：平調子のまま（基音だけ曲に合わせる）。その範囲で押し手が一番少ない基音
    - 平調子のままでは出せない音がある曲は、A を出さない（エラーにしない）
  - B バランス：押し手と調弦替えのバランスが良い案
  - C 押し手ゼロ：押し手が0の案
    - 押し手0にできない曲（使う音が13種類を超えるなど）は、押し手が一番少ない案を出し、`label` を「押し手最少」にする
- 調弦が同じ案は1つにまとめる（A → B → C の順で先のものを残す。例：B と C が同じなら A と B だけ）。まとめるのは to_json.py
- なので、フロントに渡る案は1〜3件
- 押し手も調弦替え（平調子から変える弦の本数）も、少ないほど良い

## ④ 整形のルール

- 1マス＝1拍。1拍の中の音はリストの順に縦に並べる（grid.py）
- 伸ばしと休みは区別しない（grid.py）
  - 音が1つも始まらない拍は ⊙（長い音の2拍目以降、1拍以上の休符）
  - 1拍より短い伸ばし・休みは △。拍をまたいで伸ばした音は、次の拍の先頭に △ を書く（例：付点4分＋8分 → `七 | △八`）
  - 同じマスで △ が続くときは1つにまとめる
- 直前の音と同じ弦・同じ押し手なら「、」にする。休符をはさんだら「、」にしない。⊙ は「、」にせず ⊙⊙ と書く（grid.py）
- 弦番号を漢字（七など）に、押し手を「ヲ」「オ」に変換する（to_json.py）

## 作る順番（当初の計画）

0. 環境（初期構築済み）：Dockerで起動すると `/docs` が開く。`main.py`にAPIの土台とCORS設定を用意済み。解析担当がAPI本体を拡張する
1. 型：`schemas.py` を作ってバックエンドの2人で確認
2. 並行して進める
   - 解析担当：`parse.py`。さくらさくらで音のリストが出る
   - アルゴリズム担当：`assign.py`。平調子に固定し、手で作った音のリストで動かす
3. つなぐ：parse → assign（平調子固定）→ grid → to_json → API。1案だけでもフロントにJSONが返る → フロントとつないでみる
4. `tuning.py`：3案が出る（アルゴリズム担当）
5. デモ曲で確認、改良、入口を入れるか判断

**当日までの目標**
- 最低限：3まで（デモ曲を入れるとJSONが返る）
- 理想：4の試作まで。フロントと一度つながっている
- 1日目15時の中間発表で「アップロード → 縦譜」を見せたい

## ルール

- 自分の担当ファイル以外は触らない
- `constants.py`、`schemas.py`、`requirements.txt` を変えるときは、Discordで一言伝えてから
- 作業前に `git pull`、区切りがついたら `commit` → `push`
- J-POPのデモ曲は `backend/private/` に置く（GitHubには上がらない）
- APIキーなどは `.env` に書く（GitHubには上がらない）

## まだ決まっていないこと

- 採点の重み：強押しと弱押しの差、調弦替え1本と押し手1回のどちらを重く見るか、手の移動の重み
- PDF・PNG認識用のAudiveris・OCR言語データをDockerへ組み込む方法
- 確認・編集の試作を通常の変換画面へ統合する範囲
