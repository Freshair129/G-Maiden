"""
Local OCR feasibility test for G-Maiden — read Dota 2 scoreboard / HUD numbers
with RapidOCR (PP-OCRv5 ONNX, CPU). Proves whether the lightweight on-device OCR
can extract per-player gold / level / KDA (and net worth in the NW view) fast
enough to feed G-Master, without touching the GPU budget.

Usage:
  python read_scoreboard.py <image.png>            # OCR the whole image
  python read_scoreboard.py <image.png> L T R B    # OCR a crop (left top right bottom, px)

Outputs every detected text box + confidence, and the wall-clock latency — the
number that decides if this can run on-demand during a match.
"""
import sys, time
from rapidocr_onnxruntime import RapidOCR
from PIL import Image

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    if len(sys.argv) < 2:
        print("usage: python read_scoreboard.py <image.png> [L T R B]")
        return 2
    path = sys.argv[1]
    img = Image.open(path).convert("RGB")
    if len(sys.argv) >= 6:
        l, t, r, b = (int(x) for x in sys.argv[2:6])
        img = img.crop((l, t, r, b))
        print(f"cropped to ({l},{t},{r},{b}) -> {img.size}")

    ocr = RapidOCR()  # downloads the tiny det+rec ONNX models on first run
    import numpy as np
    arr = np.array(img)

    t0 = time.perf_counter()
    result, _ = ocr(arr)
    dt = (time.perf_counter() - t0) * 1000

    print(f"\n=== OCR result ({dt:.0f} ms on CPU) ===")
    if not result:
        print("(no text detected)")
        return 0
    # sort top-to-bottom, left-to-right so rows read naturally
    rows = sorted(result, key=lambda r: (round(r[0][0][1] / 14), r[0][0][0]))
    for box, text, conf in rows:
        x, y = int(box[0][0]), int(box[0][1])
        try:
            cf = f"{float(conf):.2f}"
        except (TypeError, ValueError):
            cf = str(conf)
        print(f"  ({x:4d},{y:4d})  conf={cf}  {text!r}")
    # quick numeric extraction (gold/NW candidates)
    nums = [t for _, t, _ in result if t.replace(",", "").replace(".", "").isdigit()]
    print(f"\nnumeric tokens ({len(nums)}): {nums}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
