"""④整形：フロントと約束したJSON（dict）を組み立てる。

  - 弦番号 → 漢字（七など）、押し手 → 「ヲ」「オ」
  - 調弦の13本を音名（オクターブなし）にする
  - 調弦の説明文を changes から作る（例：平調子（一＝E）より六を全音上げる）
  - 同じ調弦の案は1つにまとめる
"""
from .constants import OSHI, STRING_NAMES
from .grid import build_grid
from .schemas import Candidate, Change, Score

# 音名は♯で書く（C, C#, D, ...）
PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def pitch_name(midi: int) -> str:
    return PITCH_NAMES[midi % 12]


def describe(base: int, changes: list[Change]) -> str:
    """調弦の説明文。"""
    text = f"平調子（一＝{pitch_name(base)}）"
    if not changes:
        return text
    parts = []
    for c in changes:
        size = {1: "半音", 2: "全音"}.get(abs(c.semitones), f"{abs(c.semitones)}半音")
        direction = "上げ" if c.semitones > 0 else "下げ"
        parts.append(f"{STRING_NAMES[c.string]}を{size}{direction}")
    return text + "より" + "、".join(parts) + "る"


def _item_to_json(item: dict) -> dict:
    """grid.py の1要素を、フロント用の形にする。"""
    if item.get("rest"):
        return {"rest": True, "short": True} if item["short"] else {"rest": True}
    out = {"string": STRING_NAMES[item["string"]]}
    if item["oshi"]:
        out["oshi"] = OSHI[item["oshi"]]
    if item["repeat"]:
        out["repeat"] = True
    return out


def unique_candidates(candidates: list[Candidate]) -> list[Candidate]:
    """同じ調弦の案は、先に出てきた1つだけ残す（A → B → C の順）。

    調弦が同じなら弦の割り当ても同じになるので、調弦だけで比べる。
    例：B と C が同じなら A と B だけ、3つとも同じなら A だけ。
    """
    seen: set[tuple[int, ...]] = set()
    result = []
    for c in candidates:
        key = tuple(c.tuning)
        if key in seen:
            continue
        seen.add(key)
        result.append(c)
    return result


def build_response(score: Score, candidates: list[Candidate]) -> dict:
    candidates = unique_candidates(candidates)
    return {
        "title": score.title,
        "composer": score.composer,
        "tempo": score.tempo,
        "time": {"beats": score.beats, "beatType": score.beat_type},
        "candidates": [
            {
                "id": c.id,
                "label": c.label,
                "description": describe(c.base, c.changes),
                "changedStrings": c.changedStrings,
                "oshiCount": c.oshiCount,
                "tuning": [pitch_name(m) for m in c.tuning],
                "measures": [
                    [[_item_to_json(i) for i in beat] for beat in measure]
                    for measure in build_grid(score.notes, c.assignments, score.beats)
                ],
            }
            for c in candidates
        ],
    }
