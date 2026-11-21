"""手元で動作確認するためのスクリプト。

今（段階0）：環境が整っているかを確認するだけ。
あとで：  python run_local.py 曲.musicxml  →  JSONを出力する形に育てる。
"""
import sys

from koto.constants import HIRAJOSHI, STRING_NAMES


def main():
    print("Python:", sys.version.split()[0])

    try:
        import music21
        print("music21:", music21.__version__)
    except ImportError:
        print("music21 が見つかりません。pip install -r requirements.txt を実行してください")
        return

    # 平調子（一＝E4）の各弦の音名を出して、constants.py が読めているか確認
    e4 = music21.pitch.Pitch("E4")
    names = [e4.transpose(d).nameWithOctave for d in HIRAJOSHI]
    for s, n in zip(STRING_NAMES, names):
        print(f"  {s}: {n}")


if __name__ == "__main__":
    main()
