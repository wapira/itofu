"""部品の間で受け渡すデータの型。

  ② parse.py  →  ③ assign.py / tuning.py  :  Score（中身は Note のリスト）
  ③ tuning.py →  ④ grid.py / to_json.py   :  Candidate のリスト（A / B / C の3案）

ここを変えるときは、アルゴリズム担当と相談してから。
"""
from dataclasses import dataclass, field


# ---------- ② → ③ ----------

@dataclass
class Note:
    """音1つ（または休符1つ）。タイでつながった音は1つにまとめてある。"""
    midi: int | None   # 音の高さ。休符なら None
    measure: int       # 何小節目か（0始まり）
    offset: float      # 小節の中の位置（拍単位。0, 1, 1.5 など）
    beats: float       # 長さ（拍単位）
    rest: bool         # 休符なら True


@dataclass
class Score:
    """楽譜1曲ぶん。notes が③に渡す「音のリスト」。"""
    title: str
    composer: str
    tempo: int          # 1分あたりの拍数
    beats: int          # 拍子の分子（4/4 の 4）
    beat_type: int      # 拍子の分母（4/4 の 4）
    notes: list[Note] = field(default_factory=list)
    measure_count: int = 0  # 小節の数（タイで伸ばすだけの小節も数える）。0なら notes から数える
    key_sharps: int = 0  # 調号の#の数（♭はマイナス。♭2つなら -2）。音名を♭で書くかに使う


# ---------- ③ → ④ ----------

@dataclass
class Assignment:
    """音1つをどう弾くか。"""
    string: int   # 弦番号（0=一 … 12=巾）
    oshi: int     # 押し手：0なし／1弱押し／2強押し


@dataclass
class Change:
    """平調子から変えた弦1本。"""
    string: int      # 弦番号（0〜12）
    semitones: int   # 何半音動かしたか（上げるとプラス、下げるとマイナス）


@dataclass
class Candidate:
    """調弦の候補1案。"""
    id: str                  # "A" / "B" / "C"
    label: str               # "そのまま" / "バランス" / "押し手ゼロ"
    tuning: list[int]        # 13本それぞれの音（midi）
    base: int                # 基音（一の音の midi）
    changes: list[Change]    # 平調子から変えた弦
    changedStrings: int      # 変えた弦の本数
    oshiCount: int           # 押し手の回数
    # Score.notes と同じ順番・同じ長さ。休符のところは None
    assignments: list[Assignment | None]
