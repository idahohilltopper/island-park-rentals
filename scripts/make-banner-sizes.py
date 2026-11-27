#!/usr/bin/env python3
"""Make smaller copies of every banner photo so phones download less.

Run after adding or changing a banner in src/banners.json:
    python3 scripts/make-banner-sizes.py
It writes name-640.jpg, name-800.jpg, name-1100.jpg and name-1400.jpg under public/images/sized/ (mirroring each banner's folder, so the cabin photo gallery never picks them up)
(only sizes smaller than the original) and records them in src/banner-sizes.json,
which build.mjs uses to add a srcset to the banner image.
"""
import json, os
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTHS = [640, 800, 1100, 1400, 1800, 2400]
MIN_MASTER = 2400  # smaller photos are enlarged to this width (with sharpening) so wide screens and retina phones get a crisp copy
banners = json.load(open(os.path.join(ROOT, "src/banners.json")))
imgs = sorted({v["img"] for v in banners.values() if v})
out = {}
for img in imgs:
    path = os.path.join(ROOT, "public", img.lstrip("/"))
    im = Image.open(path)
    w, h = im.size
    base, ext = os.path.splitext(img)
    base = "/images/sized/" + base[len("/images/"):]
    variants = []
    rgb = im.convert("RGB")
    for tw in WIDTHS:
        if tw > MIN_MASTER:
            continue
        if w * 0.9 <= tw <= w * 1.05:
            continue
        if tw > w * 1.05 and tw < 1400:
            continue
        th = round(h * tw / w)
        small = rgb.resize((tw, th), Image.LANCZOS)
        up = tw / w
        pct, rad = (70, 1.6) if up > 1.05 else (45, 1.0)
        small = small.filter(ImageFilter.UnsharpMask(radius=rad, percent=pct, threshold=2))
        name = f"{base}-{tw}{ext}"
        dest = os.path.join(ROOT, "public", name.lstrip("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        small.save(dest, "JPEG", quality=90, optimize=True, progressive=True, subsampling=0)
        variants.append({"src": name, "w": tw})
    out[img] = {"w": w, "variants": variants}
json.dump(out, open(os.path.join(ROOT, "src/banner-sizes.json"), "w"), indent=1)
print(f"{len(imgs)} banner photos processed")
