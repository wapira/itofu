"""④整形：フロントと約束したJSON（dict）を組み立てる。

  - 弦番号 → 漢字（七など）、押し手 → 「ヲ」「オ」
  - 調弦の13本を音名（オクターブなし）にする。♭系の調の曲は♭で書く
  - 調弦の説明文を changes から作る（例：平調子（一＝E）より六を全音上げる）
  - 同じ調弦の案は1つにまとめる
"""
from .constants import OSHI, STRING_NAMES
from .grid import build_grid
from .schemas import Candidate, Change, Score

# 音名。調号が#系・調号なしなら#で、♭系なら♭で書く
SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"]

# 変える弦がこの本数を超えたら、1本ずつ書かずに本数だけ書く（調弦は表で見られるため）
MAX_LISTED_CHANGES = 3


def pitch_name(midi: int, flats: bool = False) -> str:
    return (FLAT_NAMES if flats else SHARP_NAMES)[midi % 12]


def describe(base: int, changes: list[Change], flats: bool = False) -> str:
    """調弦の説明文。"""
    text = f"平調子（一＝{pitch_name(base, flats)}）"
    if not changes:
        return text
    if len(changes) > MAX_LISTED_CHANGES:
        return text + f"より{len(changes)}本の弦を変える"
    parts = []
    for c in changes:
        size = {1: "半音", 2: "全音"}.get(abs(c.semitones), f"{abs(c.semitones)}半音")
        direction = "上げ" if c.semitones > 0 else "下げ"
        parts.append(f"{STRING_NAMES[c.string]}を{size}{direction}")
    return text + "より" + "、".join(parts) + "る"


def _item_to_json(item: dict) -> dict:
    """grid.py の1要素を、フロント用の形にする。

    pos（拍の中の位置）は 0 のときは書かない。
    tuplet は {"id": まとまりの番号, "n": 何連符か}。
    """
    if item.get("rest"):
        out = {"rest": True, "short": True} if item["short"] else {"rest": True}
    else:
        out = {"string": STRING_NAMES[item["string"]]}
        if item["oshi"]:
            out["oshi"] = OSHI[item["oshi"]]
        if item["repeat"]:
            out["repeat"] = True
    if item.get("pos"):
        out["pos"] = item["pos"]
    if item.get("tuplet"):
        out["tuplet"] = {"id": item["tuplet"][0], "n": item["tuplet"][1]}
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
    flats = score.key_sharps < 0
    return {
        "title": score.title,
        "composer": score.composer,
        "tempo": score.tempo,
        "time": {"beats": score.beats, "beatType": score.beat_type},
        "candidates": [
            {
                "id": c.id,
                "label": c.label,
                "description": describe(c.base, c.changes, flats),
                "changedStrings": c.changedStrings,
                "oshiCount": c.oshiCount,
                "tuning": [pitch_name(m, flats) for m in c.tuning],
                "measures": [
                    [[_item_to_json(i) for i in beat] for beat in measure]
                    for measure in build_grid(score.notes, c.assignments, score.beats,
                                              score.measure_count)
                ],
            }
            for c in candidates
        ],
    }
