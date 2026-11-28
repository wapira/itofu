"""糸譜変換 API。

  GET  /api/health   動作確認
  POST /api/analyze  MusicXML を受け取り、調弦の候補と縦譜のJSONを返す
"""

import os
import math
import shutil
from dataclasses import asdict

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from koto.schemas import Score

from koto.parse import parse_score
from koto.tuning import generate_candidates
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
        candidates = generate_candidates(score.notes)
    except ValueError as e:
        raise HTTPException(422, f"箏で弾けない音があります：{e}")

    return build_response(score, candidates)


# 確認・編集画面の試作用API。既存のMusicXMLアップロードAPIとは独立。
class ReviewPayload(BaseModel):
    score: Score
    confirmed: bool = False


def review_errors(score: Score) -> list[str]:
    """一定拍子・単旋律の確認用検査。小節をまたぐ持続音も含めて時間を検査する。"""
    errors = []
    if type(score.beats) is not int or not 1 <= score.beats <= 16:
        return ["拍子の分子は1〜16で指定してください"]
    if score.beat_type not in (1, 2, 4, 8, 16, 32):
        errors.append("拍子の分母を確認してください")
    if type(score.tempo) is not int or not 1 <= score.tempo <= 4000:
        errors.append("テンポは1〜4000の整数で指定してください")
    if len(score.title) > 200 or len(score.composer) > 200:
        errors.append("タイトル・作曲者は200文字までです")
    if not score.notes or len(score.notes) > 10000:
        return errors + ["音・休符は1〜10,000件で指定してください"]
    intervals = []
    for n in score.notes:
        if type(n.measure) is not int or not 0 <= n.measure < 2000:
            errors.append("小節番号を確認してください")
            continue
        if not math.isfinite(n.offset) or not 0 <= n.offset < score.beats:
            errors.append(f"{n.measure + 1}小節目の開始位置を確認してください")
            continue
        if not math.isfinite(n.beats) or not 0 < n.beats <= 64:
            errors.append(f"{n.measure + 1}小節目の長さを確認してください")
            continue
        if (n.rest and n.midi is not None) or (not n.rest and (type(n.midi) is not int or not 0 <= n.midi <= 127)):
            errors.append(f"{n.measure + 1}小節目の音名・休符を確認してください")
            continue
        start = n.measure * score.beats + n.offset
        intervals.append((start, start + n.beats))
    if errors:
        return errors
    cursor = 0.0
    for start, end in sorted(intervals):
        if start > cursor + 1e-6:
            errors.append(f"{int(cursor // score.beats) + 1}小節目付近に{start - cursor:g}拍分の空白があります")
        if start < cursor - 1e-6:
            errors.append(f"{int(start // score.beats) + 1}小節目付近で音が重なっています")
        cursor = max(cursor, end)
    end_of_measure = math.ceil((cursor - 1e-6) / score.beats) * score.beats
    if end_of_measure - cursor > 1e-6:
        errors.append(f"最後の小節に{end_of_measure - cursor:g}拍分の空白があります")
    return errors


@app.post("/api/review/recognize", tags=["review"])
def recognize_for_review(file: UploadFile = File(...)) -> dict:
    """PDF・PNGを認識し、糸譜にする前の編集可能なScoreを返す。"""
    from koto.omr import RecognitionError, extract_score

    data = file.file.read(25 * 1024 * 1024 + 1)
    if not data or len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "原本は空でない25MiB以下のPDF・PNGにしてください")
    engine = os.getenv("AUDIVERIS_BIN", "audiveris")
    if shutil.which(engine) is None:
        raise HTTPException(503, "Audiverisが見つかりません。バックエンドのAUDIVERIS_BINを設定してください")
    try:
        result = extract_score(data, audiveris=engine)
    except ValueError as error:
        raise HTTPException(400, str(error)) from error
    except RecognitionError as error:
        raise HTTPException(422, str(error)) from error
    return {
        "score": asdict(result.score),
        "musicxml": result.musicxml.decode("utf-8-sig"),
        "missing_fields": result.missing_fields,
        "warnings": result.warnings,
    }


@app.post("/api/review/convert", tags=["review"])
def convert_reviewed(payload: ReviewPayload) -> dict:
    """人間が確認した編集後のScoreを、既存の調弦計算・糸譜生成へ渡す。"""
    if not payload.confirmed:
        raise HTTPException(400, "原本と見比べて確認してから確定してください")
    score = payload.score
    errors = review_errors(score)
    if errors:
        raise HTTPException(422, " / ".join(errors[:10]))
    if not any(not n.rest for n in score.notes):
        raise HTTPException(422, "音符を1つ以上追加してください")
    score.notes.sort(key=lambda n: (n.measure, n.offset))
    try:
        return build_response(score, generate_candidates(score.notes))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
