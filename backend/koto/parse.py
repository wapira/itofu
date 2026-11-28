"""段階1（②解析）：MusicXML を読み込み、Score（音のリスト＋曲の情報）にする。

対象：1パート・単旋律。
  - パートが複数あるときは1つ目だけ使う
  - 和音は一番上の音だけ使う
  - 1小節に声部（voice）が複数あるときは1つ目だけ使う
  - タイでつながった音は1つにまとめる（始まりの小節・位置に置き、長さを足す）
  - 装飾音（長さ0の音）は無視する
  - 3連符などの連符は、まとまりごとに番号（tuplet）と何連符か（tuplet_n）を付ける
  - 曲の最後に続く空の小節（休符だけの小節）は取り除く

拍の単位は拍子の分母（4/4 なら4分音符、6/8 なら8分音符が1拍）。
"""
from pathlib import Path

import math

from music21 import chord, converter, key, meter, stream, tempo

from .schemas import Note, Score

DEFAULT_TEMPO = 80          # 楽譜にテンポがないときの値
DEFAULT_TIME = (4, 4)       # 楽譜に拍子がないときの値


def parse_score(source: str | Path | bytes) -> Score:
    """MusicXML（ファイルのパス、または中身のバイト列）から Score を作る。"""
    if isinstance(source, bytes):
        s = converter.parseData(source, format="musicxml")
    else:
        s = converter.parse(str(source), format="musicxml")

    part = s.parts[0] if s.parts else s
    part = part.stripTies()  # タイをまとめた新しいストリームを返す

    beats, beat_type = _time_signature(part)
    to_beats = beat_type / 4  # 4分音符の長さ → 拍数 に直す倍率

    notes: list[Note] = []
    tuplet_count = 0        # これまでに出てきた連符のまとまりの数
    for index, measure in enumerate(part.getElementsByClass(stream.Measure)):
        voices = measure.voices
        source_stream = voices[0] if voices else measure
        group = 0           # いま続いている連符のまとまりの番号（0＝連符の外）
        group_left = 0.0    # そのまとまりの残りの長さ（4分音符単位）
        for el in source_stream.notesAndRests:
            if el.duration.isGrace:
                continue
            offset = float(el.offset) * to_beats
            length = float(el.quarterLength) * to_beats

            # 連符：まとまりの長さ（3連符の8分なら4分音符1つぶん）が埋まるまで同じ番号
            tuplet_n = 0
            tuplets = el.duration.tuplets
            if tuplets:
                t = tuplets[0]
                if not group:
                    tuplet_count += 1
                    group = tuplet_count
                    group_left = float(t.totalTupletLength())
                tuplet_n = t.numberNotesActual
                group_left -= float(el.quarterLength)
            tuplet = group
            if not tuplets or group_left <= 1e-6:
                group = 0
            if not tuplets:
                tuplet = 0

            if el.isRest:
                notes.append(Note(midi=None, measure=index, offset=offset,
                                  beats=length, rest=True,
                                  tuplet=tuplet, tuplet_n=tuplet_n))
            else:
                if isinstance(el, chord.Chord):
                    midi = max(p.midi for p in el.pitches)  # 和音は一番上
                else:
                    midi = el.pitch.midi
                notes.append(Note(midi=midi, measure=index, offset=offset,
                                  beats=length, rest=False,
                                  tuplet=tuplet, tuplet_n=tuplet_n))

    measure_count = _last_sounding_measure(notes, beats)
    if measure_count:
        notes = [n for n in notes if n.measure < measure_count]

    md = s.metadata
    return Score(
        title=(md.bestTitle if md else None) or "",
        composer=(md.composer if md else None) or "",
        tempo=_tempo(s),
        beats=beats,
        beat_type=beat_type,
        notes=notes,
        measure_count=measure_count,
        key_sharps=_key_sharps(part),
    )


def _last_sounding_measure(notes: list[Note], beats: int) -> int:
    """最後の音が鳴り終わる小節までの小節数。音が1つもなければ 0。

    これより後ろの小節（休符だけの小節）は取り除く。MuseScore で楽譜を作ると、
    使っていない小節が全休符のまま残ることがあるため。
    タイで次の小節まで伸びている音は、伸ばしている小節まで数える。
    """
    ends = [n.measure * beats + n.offset + n.beats for n in notes if not n.rest]
    if not ends:
        return 0
    return math.ceil(max(ends) / beats - 1e-6)


def _key_sharps(part) -> int:
    """最初の調号の#の数（♭ならマイナス）。調号がなければ 0。"""
    found = part.recurse().getElementsByClass(key.KeySignature).first()
    return found.sharps if found is not None else 0


def _time_signature(part) -> tuple[int, int]:
    """最初の拍子を返す（途中で拍子が変わる曲は今は考えない）。"""
    found = part.recurse().getElementsByClass(meter.TimeSignature).first()
    if found is None:
        return DEFAULT_TIME
    return found.numerator, found.denominator


def _tempo(s) -> int:
    """最初のテンポ記号の数字（♩=いくつ）。なければ DEFAULT_TEMPO。"""
    for mark in s.recurse().getElementsByClass(tempo.MetronomeMark):
        if mark.number is not None:
            return round(mark.number)
    return DEFAULT_TEMPO
