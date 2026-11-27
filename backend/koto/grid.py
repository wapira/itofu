"""段階2（④整形）：音のリストと弦の割り当てを「小節 → 拍 → 音」の3段に並べる。

ここでは弦番号・押し手は数字のまま。漢字や「ヲ」「オ」への変換は to_json.py で行う。

1つの音（マスの中の1要素）の形：
  {"string": 6, "oshi": 0, "repeat": False}   音
  {"rest": True, "short": False}               ⊙ 1拍ぶんの休符・伸ばし
  {"rest": True, "short": True}                △ 1拍より短い休符・伸ばし

ルール：
  - 1マス＝1拍。そのマスの中で始まる音を、時間の順に縦に並べる
  - 拍の頭から始まる音がないとき（前の音を伸ばしている・休符の途中）：
      そのマスで始まる音が何もなければ ⊙、途中から音が始まるなら先頭に △
  - 休符：拍の頭から1拍以上続くなら ⊙、それ以外（1拍より短い・拍の途中から）は △
  - 伸ばしと休みは区別しない。同じマスの中で続くときは1つの △ にまとめる
  - 音が1つも始まらない拍は ⊙（△△ のような拍も ⊙）
  - ⊙ は「、」にしない。続くときは ⊙⊙ と書く
  - 直前の音と同じ弦・同じ押し手なら repeat（「、」）。休符をはさんだらリセット
"""
import math

from .schemas import Assignment, Note

EPS = 1e-6

FULL_REST = {"rest": True, "short": False}
SHORT_REST = {"rest": True, "short": True}


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

    previous: Assignment | None = None  # 「、」判定用：直前に弾いた音
    for note, assignment in zip(notes, assignments):
        beat = math.floor(note.offset + EPS)
        row = cells[note.measure]
        while beat >= len(row):  # 拍子より長い小節（念のため）
            row.append([])

        if note.rest:
            starts_on_beat = abs(note.offset - beat) < EPS
            full = starts_on_beat and note.beats >= 1 - EPS
            item = dict(FULL_REST if full else SHORT_REST)
            previous = None
        else:
            if assignment is None:
                raise ValueError("音なのに弦の割り当てがありません")
            repeat = (previous is not None
                      and previous.string == assignment.string
                      and previous.oshi == assignment.oshi)
            item = {"string": assignment.string, "oshi": assignment.oshi,
                    "repeat": repeat}
            previous = assignment
        row[beat].append((note.offset, item))

    grid = []
    for m_index, row in enumerate(cells):
        measure = []
        for b_index, cell in enumerate(row):
            items: list[dict] = []
            beat_start = b_index
            if not cell:
                items.append(dict(FULL_REST))       # 何も始まらない拍
            else:
                if cell[0][0] > beat_start + EPS:
                    items.append(dict(SHORT_REST))  # 拍の頭は前の音・休符の続き
                for _, item in cell:
                    if item.get("rest") and items and items[-1].get("rest"):
                        continue                    # 休符・伸ばしが続くならまとめる
                    items.append(item)
                if not any("string" in i for i in items):
                    items = [dict(FULL_REST)]       # 音が1つも始まらない拍は ⊙
            measure.append(items)
        grid.append(measure)
    return grid
