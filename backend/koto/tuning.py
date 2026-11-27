"""段階5：固定調弦の3案を探索する（A そのまま／B バランス／C 押し手ゼロ）。

追加ライブラリは使わず、弦の音高を状態とする動的計画法で探索する。
音の出現回数を数え、弱押し・強押しともに押し手1回として評価する。
曲の途中で柱を動かすことはしない。
"""

from collections import Counter

from .assign import assign_notes
from .constants import HIRAJOSHI
from .schemas import Candidate, Change, Note

DEFAULT_BASE = 64  # 音がない場合や同点の場合の基準：一＝E4
DEFAULT_CHANGE_COST = 3  # TODO：チームで調整。弦1本の変更を押し手何回分とするか

# 状態：(押し手回数, 変更した弦数, 変更半音数の絶対値の合計, 調弦の列)
_State = tuple[int, int, int, tuple[int, ...]]


def _rank(state: _State, mode: str, change_cost: int) -> tuple:
    oshi, changed, distance, tuning = state
    if mode == "B":
        return oshi + change_cost * changed, oshi, changed, distance, tuning
    return oshi, changed, distance, tuning


def _search(
    counts: Counter[int], base: int, mode: str, change_cost: int,
) -> _State | None:
    """基音を固定し、二〜巾を順に選ぶ。その基音・評価基準での最適解を返す。

    昇順なので、直前の弦の音高が分かれば、今後出せなくなる音を検出できる。
    一の弦は先に固定し、一が出せる3音をこの検出の対象から除く。
    同じ音高まで来た状態は、以降の選択肢が同じなので最良の1件にまとめる。
    """
    # prefix[x]：MIDI x未満で、一の弦だけでは出せない音の種類数
    prefix = [0]
    for midi in range(128):
        prefix.append(prefix[-1] + int(midi in counts and not base <= midi <= base + 2))

    # -3は「二の弦をまだ選んでいない」の印。実際のMIDI音高には含まれない。
    states: dict[int, _State] = {
        -3: (sum(counts.values()) - counts[base], 0, 0, (base,))
    }
    for index in range(1, 13):
        reference = base + HIRAJOSHI[index]
        pitches = range(max(0, reference - 12), min(127, reference + 12) + 1)
        # 一は五と同音、または五の1オクターブ下。
        if index == 4:
            pitches = [pitch for pitch in (base, base + 12) if pitch in pitches]

        following: dict[int, _State] = {}
        for previous, state in states.items():
            for pitch in pitches:
                if pitch < previous:
                    continue
                # 前の弦で出せる上限(previous+2)と次の弦(pitch)の間に、
                # 未対応の音を置き去りにする調弦は除外する。
                if pitch > previous + 3 and prefix[pitch] != prefix[previous + 3]:
                    continue
                # 同じ高さの弦を重ねても、押し手なしにできる音は増えない。
                saved = counts[pitch] if pitch != previous and pitch != base else 0
                candidate: _State = (
                    state[0] - saved,
                    state[1] + int(pitch != reference),
                    state[2] + abs(pitch - reference),
                    state[3] + (pitch,),
                )
                current = following.get(pitch)
                if current is None or _rank(candidate, mode, change_cost) < _rank(current, mode, change_cost):
                    following[pitch] = candidate
        states = following
        if not states:
            return None

    feasible = [
        state for pitch, state in states.items()
        if prefix[128] == prefix[min(128, pitch + 3)]
    ]
    return min(feasible, key=lambda state: _rank(state, mode, change_cost), default=None)


def _make_candidate(
    notes: list[Note], tuning: list[int], base: int, candidate_id: str,
) -> Candidate:
    assignments = assign_notes(notes, tuning)
    changes = [
        Change(string=index, semitones=pitch - (base + HIRAJOSHI[index]))
        for index, pitch in enumerate(tuning)
        if pitch != base + HIRAJOSHI[index]
    ]
    oshi_count = sum(item is not None and item.oshi != 0 for item in assignments)
    label = {"A": "そのまま", "B": "バランス", "C": "押し手ゼロ"}[candidate_id]
    if candidate_id == "C" and oshi_count:
        label = "押し手最少"
    return Candidate(
        id=candidate_id, label=label, tuning=tuning, base=base,
        changes=changes, changedStrings=len(changes), oshiCount=oshi_count,
        assignments=assignments,
    )


def generate_candidates(
    notes: list[Note], *, change_cost: int = DEFAULT_CHANGE_COST,
) -> list[Candidate]:
    """Score.notesを受け取り、A/B/Cの順でCandidateを返す（AがなければB/C）。

    A：平調子の形を維持し、曲の全音を出せる基音から押し手最少のもの。
    B：押し手回数＋change_cost×変更弦数を最少にする。
    C：押し手回数を最少にし、同点なら変更弦数を減らす。
       0回でなければラベルを「押し手最少」にする。

    基音はMIDI 0〜127で探索。変更量は各案の基音の平調子から±12半音。
    二〜巾は昇順（同音可）。一は五と同音か、五の1オクターブ下。
    基音の移調は変更弦数に数えない。Bの重みは正の整数で指定する。
    同点は変更半音数、基準音(E4)への近さ等で決め、結果を固定する。
    A/B/Cが同じ調弦になることもある（区別のために不要な変更はしない）。

    平調子では全音を出せない曲はAだけを省略し、B/Cを返す。
    B/Cも全条件を満たす調弦がない場合はValueError。音の省略・移調はしない。
    """
    if type(change_cost) is not int or change_cost <= 0:
        raise ValueError("change_costは正の整数で指定してください")

    counts: Counter[int] = Counter()
    for index, note in enumerate(notes):
        if not isinstance(note, Note):
            raise TypeError("notesにはschemas.Noteのリストを指定してください")
        if note.rest:
            continue
        if type(note.midi) is not int or not 0 <= note.midi <= 127:
            raise ValueError(f"{index}番目の音のmidiは0〜127の整数が必要です")
        counts[note.midi] += 1

    if not counts:
        tuning = [DEFAULT_BASE + offset for offset in HIRAJOSHI]
        return [_make_candidate(notes, tuning.copy(), DEFAULT_BASE, name) for name in ("A", "B", "C")]

    # A：平調子のすべての弦がMIDI範囲に収まる基音だけを比較する。
    flats = []
    for base in range(max(0, -min(HIRAJOSHI)), min(127, 127 - max(HIRAJOSHI)) + 1):
        tuning = [base + offset for offset in HIRAJOSHI]
        playable = {pitch + oshi for pitch in tuning for oshi in (0, 1, 2)}
        if all(midi in playable for midi in counts):
            oshi = sum(count for midi, count in counts.items() if midi not in tuning)
            flats.append((oshi, abs(base - DEFAULT_BASE), base))
    result: list[Candidate] = []
    if flats:
        _, _, base_a = min(flats)
        result.append(_make_candidate(notes, [base_a + d for d in HIRAJOSHI], base_a, "A"))

    best: dict[str, tuple[tuple, int, _State]] = {}
    # 最低弦はbase-19、最高音はbase+33まで。届かない基音を先に除外。
    for base in range(max(0, max(counts) - 33), min(127, min(counts) + 19) + 1):
        for mode in ("B", "C"):
            state = _search(counts, base, mode, change_cost)
            if state is None:
                continue
            # _rankの末尾の調弦列は、基音等の比較後の最終タイブレークに使う。
            key = _rank(state, mode, change_cost)[:-1] + (abs(base - DEFAULT_BASE), base, state[3])
            if mode not in best or key < best[mode][0]:
                best[mode] = key, base, state

    if len(best) != 2:
        raise ValueError("指定された調弦の制約では、曲の全音を演奏できません")
    for mode in ("B", "C"):
        _, base, state = best[mode]
        result.append(_make_candidate(notes, list(state[3]), base, mode))
    return result
