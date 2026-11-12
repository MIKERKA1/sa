"""Compare every saved v9/v10 camera pair as decoded RGBA pixels, without a tolerance mask."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw

root = Path(__file__).resolve().parent.parent
out = root / (sys.argv[1] if len(sys.argv) > 1 else "qa/runtime-v10/visual-comparison")
out.mkdir()
before_dir, after_dir = root / "qa/runtime-v10/visual-before", root / "qa/runtime-v10/visual-after"
before = json.loads((before_dir / "report.json").read_text(encoding="utf-8"))
after = json.loads((after_dir / "report.json").read_text(encoding="utf-8"))
digest = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
assert before["buildSha256"] == digest(root / "deliver/believe_it_farm_v9.html")
assert after["buildSha256"] == digest(root / "deliver/believe_it_farm_v10.html")
assert before["geometry"] == after["geometry"]
assert {s["file"] for s in before["shots"]} == {s["file"] for s in after["shots"]}
pairs = []
for shot in before["shots"]:
    name = shot["file"]
    a = Image.open(before_dir / name).convert("RGBA")
    b = Image.open(after_dir / name).convert("RGBA")
    identical = a.size == b.size and a.tobytes() == b.tobytes()
    bbox = None
    if not identical and a.size == b.size:
        delta = ImageChops.difference(a, b)
        bbox = delta.convert("RGB").getbbox() or delta.getchannel("A").getbbox()
        delta.save(out / ("diff-" + name))
    pairs.append({"file": name, "pixelsIdentical": identical, "bbox": bbox,
                  "beforeRGBA": hashlib.sha256(a.tobytes()).hexdigest(),
                  "afterRGBA": hashlib.sha256(b.tobytes()).hexdigest()})
selected = ["attic-grain-day-enh.png", "kitchen-water-close-dusk-enh.png", "forest-path-night-enh.png"]
sheet = Image.new("RGB", (960, 972), (24, 24, 24))
draw = ImageDraw.Draw(sheet)
for row, name in enumerate(selected):
    for col, directory in enumerate([before_dir, after_dir]):
        im = Image.open(directory / name).convert("RGB").resize((480, 300), Image.Resampling.LANCZOS)
        sheet.paste(im, (col * 480, row * 324 + 24))
        draw.text((col * 480 + 8, row * 324 + 6), ("v9  " if col == 0 else "v10 ") + name, fill=(240, 240, 240))
sheet.save(out / "contact.png")
report = {"beforeSHA256": before["buildSha256"], "afterSHA256": after["buildSha256"],
          "pairs": pairs, "geometryUnchanged": True,
          "summary": {"pairs": len(pairs), "pixelIdentical": sum(p["pixelsIdentical"] for p in pairs),
                      "different": sum(not p["pixelsIdentical"] for p in pairs)}}
(out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report["summary"]))
if report["summary"]["different"]:
    sys.exit(1)
