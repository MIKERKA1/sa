"""Contact sheets of the saved QA frames; originals stay untouched."""
import json
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parent.parent
qa = root / 'qa' / 'recovery'
visual = qa / (sys.argv[1] if len(sys.argv) > 1 else 'visual-final')
report = json.loads((visual / 'report.json').read_text(encoding='utf-8'))
out = qa / (sys.argv[2] if len(sys.argv) > 2 else 'sheets-final')
out.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 17)
for gfx in ('enh', 'retro'):
    for preset in ('day', 'dusk', 'night'):
        shots = [s for s in report['shots'] if s['gfx'] == gfx and s['preset'] == preset]
        sheet = Image.new('RGB', (1500, 4 * 218), '#13171a')
        draw = ImageDraw.Draw(sheet)
        for i, shot in enumerate(shots):
            x, y = (i % 5) * 300, (i // 5) * 218
            with Image.open(visual / shot['file']) as im:
                im.thumbnail((294, 185))
                sheet.paste(im, (x + 3, y + 3))
            draw.text((x + 6, y + 190), shot['id'], fill='#e6e7e8', font=font)
        sheet.save(out / f'{preset}-{gfx}.jpg', quality=94)
print(out)
