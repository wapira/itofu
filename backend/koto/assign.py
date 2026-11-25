"""段階3：固定された調弦で、曲全体の弦と押し手を決める。"""


from .schemas import Assignment, Note


def find_candidates(midi: int, tuning: list[int]) -> list[Assignment]:
    """その音を出せる「弦番号・押し手」をすべて返す。"""
    return [
        Assignment(string=index, oshi=midi - pitch)
        for index, pitch in enumerate(tuning)
        if midi - pitch in (0, 1, 2)
    ]


def assign_notes(notes: list[Note], tuning: list[int]) -> list[Assignment | None]:
    """音と同じ順番で、弦番号・押し手を返す。休符はNone。

    notes: schemas.pyのNoteのリスト（通常はScore.notes）。
    tuning: 13本のMIDI音高。曲の途中で調弦は変えない。
    弦番号は0〜12、oshiは0（なし）/1（弱）/2（強）。

    選択の優先順位（上位の条件を犠牲にして下位を改善しない）：
      1. 押し手の総回数（弱・強ともに1回）
      2. 隣り合う発音の弦番号の差の絶対値の合計
      3. 強押しの総回数
      4. 先頭から比較した弦番号の列が小さい方

    休符を挟んでも、前後の発音の間の移動を数える。
    音の長さ・テンポ・押したままの状態は評価しない。
    出せない音はValueError。tuning.py側でその調弦を除外する想定。
    """
    if len(tuning) != 13:
        raise ValueError("調弦は13本分指定してください")
    if any(type(pitch) is not int or not 0 <= pitch <= 127 for pitch in tuning):
        raise ValueError("調弦には0〜127の整数のMIDI音高を指定してください")

    assignments: list[Assignment | None] = [None] * len(notes)
    positions: list[int] = []
    layers: list[list[Assignment]] = []
    for note_index, note in enumerate(notes):
        if note.rest:
            continue
        midi = note.midi
        if type(midi) is not int or not 0 <= midi <= 127:
            raise ValueError(f"{note_index}番目の音のmidiは0〜127の整数が必要です")
        candidates = find_candidates(midi, tuning)
        if not candidates:
            raise ValueError(
                f"{note_index}番目の音（MIDI {midi}）をこの調弦では出せません"
            )
        positions.append(note_index)
        layers.append(candidates)

    if not layers:
        return assignments

    # DP：各候補から曲の終わりまでの最小コストを、後ろから計算する。
    # コストは（押し手回数, 移動量, 強押し回数）。タプルを優先順位順に比較。
    costs: list[list[tuple[int, int, int]]] = [[] for _ in layers]
    for i in range(len(layers) - 1, -1, -1):
        costs[i] = []
        for candidate in layers[i]:
            oshi = candidate.oshi
            if i == len(layers) - 1:
                best = (int(oshi != 0), 0, int(oshi == 2))
            else:
                best = min(
                    (
                        suffix[0] + int(oshi != 0),
                        suffix[1] + abs(candidate.string - following.string),
                        suffix[2] + int(oshi == 2),
                    )
                    for following, suffix in zip(layers[i + 1], costs[i + 1])
                )
            costs[i].append(best)

    # 最適な経路だけを先頭からたどる。同点なら現在の弦番号が小さい方。
    # これで「最初に違う箇所の弦番号が小さい経路」が確定する。
    previous_string = None
    for position, candidates, suffix_costs in zip(positions, layers, costs):
        def priority(index):
            candidate = candidates[index]
            oshi_count, movement, strong_count = suffix_costs[index]
            if previous_string is not None:
                movement += abs(candidate.string - previous_string)
            return oshi_count, movement, strong_count, candidate.string

        chosen = candidates[min(range(len(candidates)), key=priority)]
        assignments[position] = chosen
        previous_string = chosen.string

    return assignments
