# 箏譜メーカー（仮）

五線譜の楽譜データ（MusicXML）から、弾きやすい調弦の候補3案と箏の縦譜を作るWebアプリ。
58ハッカソン2026（テーマ「ito」）作品。

## フォルダ
- `frontend/` 画面
- `backend/` 楽譜の解析・調弦の探索・弦の割り当て（Python）

## バックエンドの準備（Windows / PowerShell）
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run_local.py
```
