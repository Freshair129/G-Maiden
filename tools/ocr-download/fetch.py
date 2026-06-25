"""
Download PP-OCRv5 mobile ONNX models for the in-app OCR pipeline (src/ocr.rs).

We don't bundle the models in the installer (det.onnx is ~84 MB; a separate
download keeps the installer small and lets us rev models without re-releasing
the app). Run this once after installing G-Maiden; it drops the three files
into the right folder so the next launch picks them up.

Models source: huggingface.co/monkt/paddleocr-onnx — community ONNX exports
of Baidu's PP-OCRv5, hosted publicly. Dictionary is the full v5 character set
(supports Chinese / English / digits — sufficient for Dota scoreboard text).

Usage:
    pip install requests
    python tools/ocr-download/fetch.py            # default install location
    python tools/ocr-download/fetch.py --dev      # repo-relative (models/ocr/)
"""
import argparse
import os
import sys
from pathlib import Path
from urllib.request import urlretrieve

# Public mirrors of the PP-OCRv5 mobile exports.
DET_URL  = "https://huggingface.co/monkt/paddleocr-onnx/resolve/main/detection/v5/det.onnx"
REC_URL  = "https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/english/rec.onnx"
DICT_URL = "https://huggingface.co/monkt/paddleocr-onnx/resolve/main/languages/english/ppocrv5_dict.txt"

FILES = [
    ("det.onnx", DET_URL),
    ("rec.onnx", REC_URL),
    ("ppocrv5_dict.txt", DICT_URL),
]


def default_dest() -> Path:
    """Drop models next to the installed exe so ocr.rs's lookup finds them."""
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA")
        if local:
            return Path(local) / "Programs" / "G-Maiden" / "models" / "ocr"
    return Path.home() / ".g-maiden" / "models" / "ocr"


def progress(blocks: int, block_size: int, total: int) -> None:
    if total > 0:
        pct = min(100, int(blocks * block_size * 100 / total))
        print(f"\r  {pct:3d}%", end="", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Download PP-OCRv5 models for G-Maiden")
    ap.add_argument("--dev", action="store_true", help="install into repo's models/ocr/ instead of LOCALAPPDATA")
    ap.add_argument("--dest", type=Path, default=None, help="custom destination directory")
    args = ap.parse_args()

    if args.dest:
        dest = args.dest
    elif args.dev:
        repo_root = Path(__file__).resolve().parents[2]
        dest = repo_root / "models" / "ocr"
    else:
        dest = default_dest()

    dest.mkdir(parents=True, exist_ok=True)
    print(f"→ {dest}\n")

    for name, url in FILES:
        out = dest / name
        if out.exists() and out.stat().st_size > 0:
            print(f"  ✓ {name}  ({out.stat().st_size // 1024} KB, already present)")
            continue
        print(f"  ↓ {name}")
        try:
            urlretrieve(url, out, progress)
            print(f"\r  ✓ {name}  ({out.stat().st_size // 1024} KB)        ")
        except Exception as e:
            print(f"\n  ✗ {name}: {e}")
            return 1
    print("\nready — restart G-Maiden to enable scoreboard OCR.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
