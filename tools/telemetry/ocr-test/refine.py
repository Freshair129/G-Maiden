import sys, time
from rapidocr_onnxruntime import RapidOCR
from PIL import Image
img = Image.open("real.png").convert("RGB")
# crop the Radiant GOLD column (full-image coords) + upscale 3x to help single digits
crop = img.crop((448, 95, 548, 415)).resize((300, 960), Image.LANCZOS)
crop.save("gold_col.png")
ocr = RapidOCR()
import numpy as np
t=time.perf_counter(); res,_=ocr(np.array(crop)); dt=(time.perf_counter()-t)*1000
print(f"=== GOLD column OCR ({dt:.0f}ms) ===")
nums=[]
for box,text,conf in sorted(res or [], key=lambda r:r[0][0][1]):
    print(f"  y={int(box[0][1]):4d} conf={float(conf):.2f}  {text!r}")
    if text.replace(',','').isdigit(): nums.append(text)
print("gold read:", nums, " (expect 23, 5, 183, 588, 28)")
