"""Quantify complete RGBA comparisons, including tiny changes; never apply a tolerance mask."""
import hashlib
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
args = [a for a in sys.argv[1:] if not a.startswith("--")]
repeat = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--repeat=")), None)
out = root / args[0]
before_dir, after_dir = (root / a for a in args[1:3])
before = json.loads((before_dir / "report.json").read_text(encoding="utf-8"))
after = json.loads((after_dir / "report.json").read_text(encoding="utf-8"))
out.mkdir()
for index, captured in enumerate([before, after]):
    # Earlier harness reports may name dist, which has since been rebuilt.
    # Supply the preserved immutable release for those reports, still requiring its exact hash.
    source = root / args[3 + index] if len(args) > 3 + index else Path(captured["build"])
    assert captured["buildSha256"] == hashlib.sha256(source.read_bytes()).hexdigest(), str(source)
assert before["geometry"] == after["geometry"]
after_shots = {s["file"]: s for s in after["shots"]}
pairs = []
for shot in before["shots"]:
    name = shot["file"]
    if "-repeat" in name:
        continue
    after_name = name.replace(".png", f"-repeat{repeat}.png") if repeat else name
    other = after_shots[after_name]
    assert all(shot[k] == other[k] for k in ["id", "gfx", "preset", "cam", "lantern"]), name
    a = np.asarray(Image.open(before_dir / name).convert("RGBA"))
    b = np.asarray(Image.open(after_dir / after_name).convert("RGBA"))
    assert a.shape == b.shape
    delta = np.abs(a.astype(np.int16) - b.astype(np.int16))
    changed = np.any(delta != 0, axis=2)
    ys, xs = np.where(changed)
    count = int(changed.sum())
    pair = {"file": name, "pixelsIdentical": count == 0, "changedPixels": count,
            "changedPercent": 100 * count / changed.size, "maxChannelDelta": int(delta.max()),
            "meanAbsoluteRGBDelta": float(delta[:, :, :3].mean()), "alphaChanged": bool(np.any(delta[:, :, 3])),
            "bbox": [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)] if count else None,
            "channelDeltaHistogram": np.bincount(delta.ravel(), minlength=256).tolist(),
            "beforeRGBA": hashlib.sha256(a.tobytes()).hexdigest(), "afterRGBA": hashlib.sha256(b.tobytes()).hexdigest()}
    pairs.append(pair)
    if count:
        amplified = Image.fromarray(np.clip(delta[:, :, :3] * 24, 0, 255).astype(np.uint8))
        amplified.save(out / ("amplified-" + name))
        y, x = np.unravel_index(np.argmax(delta[:, :, :3].max(axis=2)), changed.shape)
        bounds = (max(0, x - 48), max(0, y - 48), min(a.shape[1], x + 49), min(a.shape[0], y + 49))
        sheet = Image.new("RGB", (3 * 388, 410), (24, 24, 24))
        draw = ImageDraw.Draw(sheet)
        for col, (label, im) in enumerate([("before", Image.fromarray(a)), ("after", Image.fromarray(b)), ("delta x24", amplified)]):
            sheet.paste(im.crop(bounds).convert("RGB").resize((388, 388), Image.Resampling.NEAREST), (col * 388, 22))
            draw.text((col * 388 + 4, 4), f"{label} {name}", fill=(240, 240, 240))
        sheet.save(out / ("crop-" + name))
summary = {"pairs": len(pairs), "pixelIdentical": sum(p["pixelsIdentical"] for p in pairs),
           "different": sum(not p["pixelsIdentical"] for p in pairs),
           "maximumChannelDelta": max(p["maxChannelDelta"] for p in pairs)}
report = {"beforeSHA256": before["buildSha256"], "afterSHA256": after["buildSha256"],
          "geometryUnchanged": True, "summary": summary, "pairs": pairs}
(out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(summary))
for p in pairs:
    if not p["pixelsIdentical"] and "--verbose" in sys.argv:
        print(json.dumps({k: p[k] for k in ["file", "changedPixels", "changedPercent", "maxChannelDelta", "meanAbsoluteRGBDelta"]}))
if summary["different"]:
    sys.exit(1)
