"""糸譜変換 API。

  GET  /api/health   動作確認
  POST /api/analyze  MusicXML を受け取り、調弦の候補と縦譜のJSONを返す
"""

import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from koto.parse import parse_score
from koto.provisional import provisional_candidates
from koto.to_json import build_response

MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5MB

DEFAULT_CORS_ORIGINS = (
    "http://localhost:3000,http://127.0.0.1:3000,"
    "http://localhost:5173,http://127.0.0.1:5173"
)

app = FastAPI(title="糸譜変換 API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
        if origin.strip()
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/analyze", tags=["analyze"])
def analyze(file: UploadFile = File(..., description="MusicXML（.musicxml / .xml）")) -> dict:
    """MusicXML を解析して、フロント用のJSONを返す。

    エラーのときは {"detail": "メッセージ"} を返す。
      400：ファイルが空・大きすぎる・MusicXML として読めない・音がない
      422：箏で出せない音がある
    """
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(400, "ファイルが空です")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(400, "ファイルが大きすぎます（5MBまで）")

    try:
        score = parse_score(data)
    except Exception:
        raise HTTPException(
            400, "MusicXMLとして読み込めませんでした（.musicxml / .xml の非圧縮形式で書き出してください）"
        )
    if not any(not n.rest for n in score.notes):
        raise HTTPException(400, "楽譜に音が見つかりませんでした")

    try:
        # TODO: tuning.py ができたら、3案を出す処理に差し替える
        candidates = provisional_candidates(score.notes)
    except ValueError as e:
        raise HTTPException(422, f"箏で弾けない音があります：{e}")

    return build_response(score, candidates)
