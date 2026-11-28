"""段階2（④整形）：音のリストと弦の割り当てを「小節 → 拍 → 音」の3段に並べる。

ここでは弦番号・押し手は数字のまま。漢字や「ヲ」「オ」への変換は to_json.py で行う。

1つの音（マスの中の1要素）の形：
  {"string": 6, "oshi": 0, "repeat": False}   音
  {"rest": True, "short": False}               ⊙ 1拍ぶんの休符・伸ばし
  {"rest": True, "short": True}                △ 1拍より短い休符・伸ばし
どの要素にも次の2つが付く：
  "pos"    拍の中で始まる位置（0＝拍の頭、0.5＝拍の真ん中）
  "tuplet" 3連符などのまとまり (番号, 何連符か)。連符でなければ None

ルール：
  - 1マス＝1拍。そのマスの中で始まる音を、時間の順に縦に並べる
  - 拍の頭から始まる音がないとき（前の音を伸ばしている・休符の途中）：
      そのマスで始まる音が何もなければ ⊙、途中から音が始まるなら先頭に △
  - 休符：拍の頭から1拍以上続くなら ⊙、それ以外（1拍より短い・拍の途中から）は △
  - 伸ばしと休みは区別しない。同じマスの中で続くときは1つの △ にまとめる
  - 音が1つも始まらない拍は ⊙（△△ のような拍も ⊙）
  - ⊙ は「、」にしない。続くときは ⊙⊙ と書く
  - 同じ弦・同じ押し手の音が3回以上続いたら、2回目から repeat（「、」）。
    2回だけなら両方そのまま書く。⊙・△（休符・伸ばし）をはさんだら数え直す
"""
import math

from .schemas import Assignment, Note

EPS = 1e-6

FULL_REST = {"rest": True, "short": False}
SHORT_REST = {"rest": True, "short": True}

# 同じ音がこの回数以上続いたときだけ「、」を使う
REPEAT_MIN = 3


def build_grid(notes: list[Note], assignments: list[Assignment | None],
               beats_per_measure: int,
               measure_count: int = 0) -> list[list[list[dict]]]:
    if len(notes) != len(assignments):
        raise ValueError("notes と assignments の長さが違います")

    # 小節の数。タイで伸ばすだけの小節は notes に出てこないので、measure_count で受け取る
    measure_count = max(measure_count, max((n.measure for n in notes), default=-1) + 1)
    # cells[小節][拍] = [(開始位置, 要素), ...]
    cells: list[list[list[tuple[float, dict]]]] = [
        [[] for _ in range(beats_per_measure)] for _ in range(measure_count)
    ]

    for note, assignment in zip(notes, assignments):
        beat = math.floor(note.offset + EPS)
        row = cells[note.measure]
        while beat >= len(row):  # 拍子より長い小節（念のため）
            row.append([])

        if note.rest:
            starts_on_beat = abs(note.offset - beat) < EPS
            full = starts_on_beat and note.beats >= 1 - EPS
            item = dict(FULL_REST if full else SHORT_REST)
        else:
            if assignment is None:
                raise ValueError("音なのに弦の割り当てがありません")
            item = {"string": assignment.string, "oshi": assignment.oshi,
                    "repeat": False}
        item["pos"] = round(note.offset - beat, 4)
        item["tuplet"] = (note.tuplet, note.tuplet_n) if note.tuplet else None
        row[beat].append((note.offset, item))

    grid = []
    for m_index, row in enumerate(cells):
        measure = []
        for b_index, cell in enumerate(row):
            items: list[dict] = []
            beat_start = b_index
            if not cell:
                items.append(_rest(FULL_REST))      # 何も始まらない拍
            else:
                if cell[0][0] > beat_start + EPS:
                    items.append(_rest(SHORT_REST)) # 拍の頭は前の音・休符の続き
                for _, item in cell:
                    if item.get("rest") and items and items[-1].get("rest"):
                        continue                    # 休符・伸ばしが続くならまとめる
                    items.append(item)
                if not any("string" in i for i in items):
                    items = [_rest(FULL_REST)]      # 音が1つも始まらない拍は ⊙
            measure.append(items)
        grid.append(measure)
    mark_repeats(grid)
    return grid


def _rest(kind: dict) -> dict:
    """拍の頭に置く休符・伸ばし（楽譜の音から作ったものではない）。"""
    return {**kind, "pos": 0.0, "tuplet": None}


def mark_repeats(grid: list[list[list[dict]]]) -> None:
    """できあがった縦譜を頭から読み、「、」にする音に repeat=True を付ける。

    同じ弦・同じ押し手の音が3回以上続いたら、2回目から「、」。
    ⊙ や △ が間に入ったら（楽譜の休符でも、伸ばしでできた ⊙ でも）数え直す。
    """
    run: list[dict] = []

    def close_run():
        if len(run) >= REPEAT_MIN:
            for it in run[1:]:
                it["repeat"] = True
        run.clear()

    for measure in grid:
        for beat in measure:
            for item in beat:
                if item.get("rest"):
                    close_run()
                    continue
                if run and (run[-1]["string"], run[-1]["oshi"]) != (item["string"], item["oshi"]):
                    close_run()
                run.append(item)
    close_run()
