"""PDF・PNGの楽譜を元の形式のままAudiverisに渡し、曲情報と音符を取り出す。

必要なもの：
  - 既存requirements.txtのmusic21・Pillow
  - 同じ実行環境にAudiverisのCLI
  - Audiveris用のOCR言語データ（既定はjpn+eng）

使い方（backendフォルダで実行）：
  python -m koto.omr /path/to/score.pdf --audiveris /path/to/audiveris
  python -m koto.omr /path/to/score.png --languages eng

APIからはextract_pdf()・extract_png()、または自動判別のextract_score()を呼ぶ。
PDF・PNGのデータは変換せず渡す。PDF内部の画像化・認識はAudiverisが行う。
写真を使う場合のextract_photo()も残す。
譜面の対象範囲はparse.pyと同じ（1パート・単旋律）。
写真は1ページずつ。HEICは事前にJPEG/PNGに変換する。
Audiverisの出力ファイルは一時フォルダ内で作成し、処理後に削除する。
ネットワークへの写真送信、API接続、ソフトの自動インストールは行わない。

公式CLI：https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/
"""

import argparse
from dataclasses import asdict, dataclass
from io import BytesIO
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
from tempfile import TemporaryDirectory
import warnings
import xml.etree.ElementTree as ET
from zipfile import BadZipFile, ZipFile

from .schemas import Score

MAX_PDF_BYTES = 25 * 1024 * 1024
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_XML_BYTES = 20 * 1024 * 1024


class RecognitionError(RuntimeError):
    """認識ソフトの未導入、認識失敗、出力の不備など。"""


@dataclass
class ScoreExtraction:
    score: Score
    musicxml: bytes
    missing_fields: list[str]  # title / composer / tempo
    warnings: list[str]
    # score.tempoは整数の四分音符BPM。未認識時の既定値はmissing_fieldsで区別する。


# 以前の写真用APIとの互換性を維持する。
PhotoRecognitionError = RecognitionError
PhotoExtraction = ScoreExtraction


def _prepare_image(data: bytes, destination: Path, *, normalize: bool = True) -> None:
    """写真を補正。normalize=FalseならPNGを検証し、元のbytesのまま保存。"""
    from PIL import Image, ImageOps, UnidentifiedImageError

    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("写真は空でない25MiB以下の画像を指定してください")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP", "TIFF", "BMP"}:
                    raise ValueError("JPEG・PNG・WebP・TIFF・BMPの写真に対応しています")
                if getattr(image, "n_frames", 1) != 1:
                    raise ValueError("写真は1ページずつ指定してください")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise ValueError("写真は4000万画素以下にしてください")
                if not normalize:
                    if image.format != "PNG":
                        raise ValueError("PNGファイルを指定してください")
                    image.verify()
                    destination.write_bytes(data)
                    return
                normalized = ImageOps.exif_transpose(image)
                # 透明な背景は白にする（単純なRGB変換では黒くなることがある）。
                rgba = normalized.convert("RGBA")
                background = Image.new("RGBA", rgba.size, "white")
                background.alpha_composite(rgba)
                background.convert("RGB").save(destination, format="PNG", dpi=(300, 300))
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError,
            Image.DecompressionBombWarning) as error:
        raise ValueError("画像を読み込めません。鮮明なJPEGまたはPNGを指定してください") from error


def _strip_namespaces(root: ET.Element) -> ET.Element:
    for element in root.iter():
        element.tag = element.tag.rsplit("}", 1)[-1]
    return root


def _read_musicxml(path: Path) -> bytes:
    """AudiverisのXML/MusicXML/MXLを、非圧縮XMLのbytesとして返す。"""
    if path.suffix.lower() != ".mxl":
        if path.stat().st_size > MAX_XML_BYTES:
            raise RecognitionError("認識結果のMusicXMLが大きすぎます")
        return path.read_bytes()
    try:
        with ZipFile(path) as archive:
            container = archive.getinfo("META-INF/container.xml")
            if container.file_size > 64 * 1024:
                raise RecognitionError("MXLの管理情報が大きすぎます")
            root = _strip_namespaces(ET.fromstring(archive.read(container)))
            files = root.findall("./rootfiles/rootfile")
            preferred = [item for item in files
                         if item.get("media-type") == "application/vnd.recordare.musicxml+xml"]
            files = preferred or files
            if len(files) != 1 or not files[0].get("full-path"):
                raise RecognitionError("MXLの主楽譜を1つに特定できません")
            info = archive.getinfo(files[0].get("full-path"))
            if info.file_size > MAX_XML_BYTES:
                raise RecognitionError("認識結果のMusicXMLが大きすぎます")
            # ZIPをファイルシステムに展開せず、主楽譜だけを読む。
            return archive.read(info)
    except (BadZipFile, KeyError, ET.ParseError, OSError, RuntimeError) as error:
        if isinstance(error, RecognitionError):
            raise
        raise RecognitionError("Audiverisが出力したMXLを読み込めません") from error


def _text(root: ET.Element, path: str) -> str:
    return (root.findtext(path) or "").strip()


def _credit(root: ET.Element, kind: str) -> str:
    for credit in root.findall("credit"):
        if any((item.text or "").strip() == kind for item in credit.findall("credit-type")):
            return " ".join("".join(item.itertext()).strip()
                            for item in credit.findall("credit-words")).strip()
    return ""


def _positive_number(value: str | None) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) and number > 0 else None


def _metadata(root: ET.Element) -> tuple[str, str, float | None]:
    title = _text(root, "./work/work-title") or _text(root, "./movement-title") or _credit(root, "title")
    composers = ["".join(item.itertext()).strip()
                 for item in root.findall("./identification/creator")
                 if item.get("type") == "composer" and "".join(item.itertext()).strip()]
    composer = " / ".join(composers) or _credit(root, "composer")

    # 同じdirectionでは演奏用sound@tempoを優先。最初の数値指定を使う。
    units = {"whole": 4, "half": 2, "quarter": 1, "eighth": 0.5,
             "16th": 0.25, "32nd": 0.125, "64th": 0.0625}
    for direction in root.iter():
        if direction.tag == "sound":
            tempo = _positive_number(direction.get("tempo"))
            if tempo is not None:
                return title, composer, tempo
        if direction.tag != "direction":
            continue
        for sound in direction.findall("sound"):
            tempo = _positive_number(sound.get("tempo"))
            if tempo is not None:
                return title, composer, tempo
        for mark in direction.findall("./direction-type/metronome"):
            # 音価同士の等式など、数値BPMでない指定は推測しない。
            rate = _positive_number(mark.findtext("per-minute"))
            unit = units.get(mark.findtext("beat-unit"))
            if rate is not None and unit is not None:
                dots = len(mark.findall("beat-unit-dot"))
                return title, composer, rate * unit * sum(0.5 ** i for i in range(dots + 1))
    return title, composer, None


def _extract_document(
    source: str | Path | bytes, *, audiveris: str = "audiveris",
    languages: str = "jpn+eng", timeout: float = 180, input_format: str = "auto",
) -> ScoreExtraction:
    """PDFまたは写真から情報を取り出す。未認識の文字・速さを推測で埋めない。

    title/composer未認識時は空文字、tempo未認識時はparse.pyの既定BPM。
    どの項目が未認識かはmissing_fieldsに格納する。
    複数の独立した曲が検出された場合、勝手に1曲を選ばずエラーにする。
    AudiverisのPATH、OCR言語データ、music21/Pillowは実行環境に必要。
    """
    if not isinstance(timeout, (int, float)) or isinstance(timeout, bool) or not math.isfinite(timeout) or timeout <= 0:
        raise ValueError("timeoutは正の秒数で指定してください")
    if not re.fullmatch(r"[a-z]{3}(?:\+[a-z]{3})*", languages):
        raise ValueError("languagesはjpn+engなどの言語コードで指定してください")
    executable = shutil.which(audiveris)
    if executable is None:
        raise RecognitionError(
            "Audiverisが見つかりません。同じ実行環境に導入し、"
            "audiveris引数にCLIの実行ファイルのパスを指定してください"
        )
    try:
        from .parse import DEFAULT_TEMPO, parse_score
        if input_format != "pdf":
            import PIL  # noqa: F401
    except ImportError as error:
        raise RecognitionError(
            "music21とPillowが必要です。backend/requirements.txtの環境で実行してください"
        ) from error

    limit = MAX_PDF_BYTES if input_format == "pdf" else MAX_IMAGE_BYTES
    if isinstance(source, bytes):
        data = source
    else:
        path = Path(source).expanduser()
        if not path.is_file():
            raise FileNotFoundError(f"入力ファイルが見つかりません: {path}")
        if path.stat().st_size > limit:
            raise ValueError("入力ファイルは25MiB以下にしてください")
        data = path.read_bytes()

    if not data or len(data) > limit:
        raise ValueError("空でない25MiB以下のファイルを指定してください")
    if input_format == "auto":
        if data.startswith(b"%PDF-"):
            input_format = "pdf"
        elif data.startswith(b"\x89PNG\r\n\x1a\n"):
            input_format = "png"
        else:
            raise ValueError("PDFまたはPNGを指定してください。写真入力にはextract_photo()を使います")
    if input_format == "pdf" and not data.startswith(b"%PDF-"):
        raise ValueError("PDFファイルを指定してください")
    if input_format == "png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("PNGファイルを指定してください")

    with TemporaryDirectory(prefix="itofu-omr-") as temporary:
        work = Path(temporary)
        if input_format == "pdf":
            input_path = work / "score.pdf"
            input_path.write_bytes(data)
        elif input_format == "png":
            input_path = work / "score.png"
            _prepare_image(data, input_path, normalize=False)
        else:
            input_path = work / "photo.png"
            _prepare_image(data, input_path)
        output = work / "output"
        output.mkdir()
        command = [
            executable, "-batch", "-transcribe", "-export",
            "-constant", "org.audiveris.omr.text.Language.defaultSpecification=" + languages,
            "-output", str(output), "--", str(input_path),
        ]
        try:
            subprocess.run(command, check=True, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=timeout, cwd=work)
        except subprocess.TimeoutExpired as error:
            raise RecognitionError("楽譜認識が時間内に終わりませんでした") from error
        except subprocess.CalledProcessError as error:
            details = (error.stderr or error.stdout or "").strip()[-1500:]
            raise RecognitionError("Audiverisの楽譜認識に失敗しました: " + details) from error
        except OSError as error:
            raise RecognitionError("Audiverisを起動できませんでした") from error

        exported = sorted(path for path in output.rglob("*")
                          if path.is_file() and path.suffix.lower() in {".mxl", ".musicxml", ".xml"})
        if not exported:
            raise RecognitionError("MusicXMLが生成されませんでした。譜面の内容やOCR言語設定を確認してください")
        if len(exported) != 1:
            raise RecognitionError("複数の楽譜が生成されました。1曲分のPDFまたは1ページの写真で試してください")
        musicxml = _read_musicxml(exported[0])

    try:
        root = _strip_namespaces(ET.fromstring(musicxml))
        if root.tag != "score-partwise":
            raise RecognitionError("対応しているMusicXMLはscore-partwise形式です")
        score = parse_score(musicxml)
    except RecognitionError:
        raise
    except Exception as error:
        raise RecognitionError("認識結果のMusicXMLを既存の解析処理で読み込めませんでした") from error
    if not score.notes:
        raise RecognitionError("音符・休符を認識できませんでした。入力の譜面を確認してください")

    title, composer, tempo = _metadata(root)
    score.title = title
    score.composer = composer
    score.tempo = max(1, round(tempo)) if tempo is not None else DEFAULT_TEMPO
    missing = [name for name, value in (("title", title), ("composer", composer), ("tempo", tempo))
               if value is None or value == ""]
    messages = ["自動認識の結果です。元の譜面と音符・リズム・文字を照合してください。"]
    if missing:
        messages.append("未認識の項目: " + ", ".join(missing))
    if tempo is None:
        messages.append(f"テンポは未認識のため、仮の値として四分音符BPM {DEFAULT_TEMPO}を設定しています。")
    if len(root.findall("part")) > 1:
        messages.append("複数パートのうち先頭のパートだけを解析しています。")
    return ScoreExtraction(score=score, musicxml=musicxml, missing_fields=missing, warnings=messages)


def extract_pdf(
    source: str | Path | bytes, *, audiveris: str = "audiveris",
    languages: str = "jpn+eng", timeout: float = 180,
) -> ScoreExtraction:
    """主な入口：PDFを直接Audiverisに渡す。複数ページも同じ1曲なら処理する。

    PDFを文字として直接解釈する処理ではなく、Audiveris内部で画像化・認識する。
    複数の独立した曲として出力された場合はエラーになる。
    """
    return _extract_document(source, audiveris=audiveris, languages=languages,
                             timeout=timeout, input_format="pdf")


def extract_png(
    source: str | Path | bytes, *, audiveris: str = "audiveris",
    languages: str = "jpn+eng", timeout: float = 180,
) -> ScoreExtraction:
    """PNG専用：画像の形式・解像度・向きを変更せず、そのまま認識する。"""
    return _extract_document(source, audiveris=audiveris, languages=languages,
                             timeout=timeout, input_format="png")


def extract_score(
    source: str | Path | bytes, *, audiveris: str = "audiveris",
    languages: str = "jpn+eng", timeout: float = 180,
) -> ScoreExtraction:
    """PDF・PNGを内容から自動判別する。拡張子やファイル名だけでは判定しない。"""
    return _extract_document(source, audiveris=audiveris, languages=languages,
                             timeout=timeout, input_format="auto")


def extract_photo(
    source: str | Path | bytes, *, audiveris: str = "audiveris",
    languages: str = "jpn+eng", timeout: float = 180,
) -> ScoreExtraction:
    """補助の入口：従来の写真入力。向きを補正したPNGをAudiverisに渡す。"""
    return _extract_document(source, audiveris=audiveris, languages=languages,
                             timeout=timeout, input_format="image")


def main() -> None:
    parser = argparse.ArgumentParser(description="楽譜のPDF・PNGから曲情報と音符を取り出す")
    parser.add_argument("source", type=Path)
    parser.add_argument("--audiveris", default="audiveris", help="Audiveris CLIの実行ファイル")
    parser.add_argument("--languages", default="jpn+eng")
    parser.add_argument("--timeout", type=float, default=180)
    args = parser.parse_args()
    try:
        result = extract_score(args.source, audiveris=args.audiveris,
                               languages=args.languages, timeout=args.timeout)
    except (RecognitionError, ValueError, OSError) as error:
        parser.exit(1, f"認識エラー: {error}\n")
    print(json.dumps({"score": asdict(result.score), "missing_fields": result.missing_fields,
                      "warnings": result.warnings}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
