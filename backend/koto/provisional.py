"""仮の③：平調子に固定した1案（A そのまま）だけを作る。

アルゴリズム担当の tuning.py ができるまでのつなぎ。弦の割り当ては assign.py を使う。
基音（一の音）は、曲の音を全部出せるものの中から、押し手が一番少ないものを選ぶ。
同点なら E4 に近い方。
"""
from .assign import assign_notes
from .constants import HIRAJOSHI
from .schemas import Candidate, Note

DEFAULT_BASE = 64            # E4
BASE_RANGE = range(48, 77)   # 基音を探す範囲（C3〜E5）


def provisional_candidates(notes: list[Note]) -> list[Candidate]:
    best = None
    for base in BASE_RANGE:
        tuning = [base + d for d in HIRAJOSHI]
        try:
            assignments = assign_notes(notes, tuning)
        except ValueError:
            continue  # この基音では出せない音がある
        oshi = sum(1 for a in assignments if a is not None and a.oshi != 0)
        key = (oshi, abs(base - DEFAULT_BASE))
        if best is None or key < best[0]:
            best = (key, base, tuning, assignments)

    if best is None:
        raise ValueError("平調子では、どの基音でも出せない音があります")

    (oshi, _), base, tuning, assignments = best
    return [Candidate(
        id="A",
        label="そのまま",
        tuning=tuning,
        base=base,
        changes=[],
        changedStrings=0,
        oshiCount=oshi,
        assignments=assignments,
    )]
