"""段階1（②解析）：MusicXML を読み込み、Score（音のリスト＋曲の情報）にする。

対象：1パート・単旋律。
  - パートが複数あるときは1つ目だけ使う
  - 和音は一番上の音だけ使う
  - 1小節に声部（voice）が複数あるときは1つ目だけ使う
  - タイでつながった音は1つにまとめる（始まりの小節・位置に置き、長さを足す）
  - 装飾音（長さ0の音）は無視する

拍の単位は拍子の分母（4/4 なら4分音符、6/8 なら8分音符が1拍）。
"""
from pathlib import Path

from music21 import chord, converter, meter, stream, tempo

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
    for index, measure in enumerate(part.getElementsByClass(stream.Measure)):
        voices = measure.voices
        source_stream = voices[0] if voices else measure
        for el in source_stream.notesAndRests:
            if el.duration.isGrace:
                continue
            offset = float(el.offset) * to_beats
            length = float(el.quarterLength) * to_beats
            if el.isRest:
                notes.append(Note(midi=None, measure=index, offset=offset,
                                  beats=length, rest=True))
            else:
                if isinstance(el, chord.Chord):
                    midi = max(p.midi for p in el.pitches)  # 和音は一番上
                else:
                    midi = el.pitch.midi
                notes.append(Note(midi=midi, measure=index, offset=offset,
                                  beats=length, rest=False))

    md = s.metadata
    return Score(
        title=(md.bestTitle if md else None) or "",
        composer=(md.composer if md else None) or "",
        tempo=_tempo(s),
        beats=beats,
        beat_type=beat_type,
        notes=notes,
    )


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
