"""手元で動作確認するためのスクリプト。

  python run_local.py                    環境の確認（Python・music21・平調子）
  python run_local.py 曲.musicxml        フロント用のJSONを出す
  python run_local.py 曲.musicxml --text 縦譜を1小節1行のテキストで見る
"""
import json
import sys

from koto.constants import HIRAJOSHI, STRING_NAMES


def check_env():
    print("Python:", sys.version.split()[0])
    try:
        import music21
        print("music21:", music21.__version__)
    except ImportError:
        print("music21 が見つかりません。pip install -r requirements.txt を実行してください")
        return
    e4 = music21.pitch.Pitch("E4")
    for s, d in zip(STRING_NAMES, HIRAJOSHI):
        print(f"  {s}: {e4.transpose(d).nameWithOctave}")


def item_text(item: dict) -> str:
    if item.get("rest"):
        return "△" if item.get("short") else "⊙"
    if item.get("repeat"):
        return "、"
    return item.get("oshi", "") + item["string"]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        check_env()
        return

    from koto.parse import parse_score
    from koto.provisional import provisional_candidates
    from koto.to_json import build_response

    score = parse_score(args[0])
    data = build_response(score, provisional_candidates(score.notes))

    if "--text" in sys.argv:
        print(f"{data['title']} / {data['composer']} / ♩={data['tempo']} / "
              f"{data['time']['beats']}/{data['time']['beatType']}")
        for c in data["candidates"]:
            print(f"\n[{c['id']} {c['label']}] {c['description']} 押し手{c['oshiCount']}回")
            print("調弦:", " ".join(f"{s}{t}" for s, t in zip(STRING_NAMES, c["tuning"])))
            for i, measure in enumerate(c["measures"], 1):
                cells = ["".join(item_text(x) for x in beat) for beat in measure]
                print(f"{i:3d} | " + " | ".join(cells))
    else:
        print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
