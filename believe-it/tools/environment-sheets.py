"""Paginated contact sheets; preserve every original screenshot."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
visual = root / sys.argv[1]
out = root / sys.argv[2]
out.mkdir()
report = json.loads((visual / 'report.json').read_text(encoding='utf-8'))
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)
for gfx in ('enh', 'retro'):
    for preset in ('day', 'dusk', 'night'):
        shots = [s for s in report['shots'] if s['gfx'] == gfx and s['preset'] == preset]
        for start in range(0, len(shots), 20):
            sheet = Image.new('RGB', (1600, 4 * 224), '#15191c')
            draw = ImageDraw.Draw(sheet)
            for i, shot in enumerate(shots[start:start + 20]):
                x, y = i % 5 * 320, i // 5 * 224
                with Image.open(visual / shot['file']) as im:
                    im.thumbnail((314, 196))
                    sheet.paste(im, (x + 3, y + 3))
                draw.text((x + 5, y + 201), shot['id'], font=font, fill='white')
            sheet.save(out / f'{preset}-{gfx}-{start // 20 + 1}.jpg', quality=94)
print(out)
