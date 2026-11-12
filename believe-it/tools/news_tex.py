# Newspaper textures for the "Münchner Neueste Nachrichten" prop (29 March 1922).
# assets/props/newspaper_scan.png (approved Gemini scan) -> baked clues (thumbprint, finger smudge, damp corner,
# hay chaff) -> front page 512x768 (hi) + 256x384 (PS1) and a composed back page (page 4: ads) 256x384,
# all as 4-bit CLUT (16 colours), written to src/models/newspaper_tex.gen.js.
import base64, json, math, random
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = '/data/fears_game/'
SRC = Image.open(ROOT + 'assets/props/newspaper_scan.png').convert('RGB')  # 1024 x 1536
W0, H0 = SRC.size
rnd = random.Random(1922)

def smooth_noise(w, h, cell, seed):
    r = np.random.RandomState(seed)
    g = r.rand(h // cell + 3, w // cell + 3)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((w + 3 * cell, h + 3 * cell), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)[cell:cell + h, cell:cell + w] / 255.0

# ------------------------------------------------------------------ base (1024 x 1536, float RGB)
A = np.asarray(SRC, dtype=np.float32).copy()
yy, xx = np.mgrid[0:H0, 0:W0].astype(np.float32)
PAPER = np.array([214, 196, 166], np.float32)

# damp corners: page top-left and bottom-left (they lie on top of each other when the page is folded in half)
def damp(cx, cy, R, seed):
    n = smooth_noise(W0, H0, 24, seed)
    d = np.hypot(xx - cx, yy - cy) / R + (n - 0.5) * 0.55
    wet = np.clip(1.0 - d, 0, 1)
    wet = np.minimum(wet * 3.0, 1.0)  # flat wet area
    tide = np.exp(-((d - 1.0) / 0.045) ** 2)  # brownish tide line at the rim
    return wet, tide
for (cx, cy, R, s) in [(-10, -20, 150, 11), (-10, H0 + 20, 130, 12)]:
    wet, tide = damp(cx, cy, R, s)
    blur = np.asarray(Image.fromarray(A.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32)
    A = A * (1 - wet[..., None] * 0.7) + blur * (wet[..., None] * 0.7)  # ink bleeds a little
    ink = (255 - A.mean(axis=2, keepdims=True)) / 255.0
    A = A - wet[..., None] * np.array([44, 44, 42], np.float32) * (1 - ink * 0.5)  # greyer, darker wet paper
    A = A + wet[..., None] * ink * 34  # ink fades
    A = A - tide[..., None] * np.array([40, 56, 80], np.float32)  # brown rim

# fingerprint: concentric (whorl) ridges inside a soft oval; thumb on the front, fainter index finger below the fold
def print_mask(w, h, ang, rings, seed):
    S = 4
    W, H = w * S, h * S
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    x = (x - W / 2) / (W / 2); y = (y - H / 2) / (H / 2)
    c, s = math.cos(ang), math.sin(ang)
    xr, yr = c * x + s * y, -s * x + c * y
    n = smooth_noise(W, H, 6 * S, seed)
    core = np.hypot(xr * 1.0, (yr + 0.18) * 0.8)
    ridge = 0.5 + 0.5 * np.cos(core * rings * math.pi * 2 + (n - 0.5) * 2.2)
    oval = np.clip((1 - np.hypot(xr, yr * 1.0)) * 3.2, 0, 1)
    patch = smooth_noise(W, H, 10 * S, seed + 7)
    m = (0.25 + 0.75 * ridge ** 1.4) * oval * np.clip(patch * 1.6 - 0.1, 0.25, 1)
    return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).resize((w, h), Image.BOX), np.float32) / 255.0
def stamp(img, cx, cy, w, h, ang, rings, alpha, col, seed):
    m = print_mask(w, h, ang, rings, seed) * alpha
    x0, y0 = int(cx - w / 2), int(cy - h / 2)
    reg = img[y0:y0 + h, x0:x0 + w]
    reg[:] = reg * (1 - m[..., None]) + np.array(col, np.float32) * m[..., None]
DIRT = (78, 70, 60)

# hay chaff specks near the fold
def chaff(img, scale):
    r = random.Random(77)
    Hh, Ww = img.shape[:2]
    for _ in range(9):
        x = r.uniform(0.04, 0.4) * Ww; y = Hh * 0.5 + r.uniform(-0.035, 0.03) * Hh
        L = r.uniform(3, 7) * scale; a = r.uniform(0, math.pi)
        for t in np.linspace(-0.5, 0.5, int(L * 2) + 2):
            px, py = int(x + math.cos(a) * L * t), int(y + math.sin(a) * L * t)
            if 0 <= px < Ww and 0 <= py < Hh:
                img[py, px] = img[py, px] * 0.35 + np.array([176, 146, 86], np.float32) * 0.65

def finish(img, w, h, prints=True):
    im = Image.fromarray(img.clip(0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)
    if w <= 256: im = im.filter(ImageFilter.UnsharpMask(radius=1.0, percent=70, threshold=2))
    a = np.asarray(im, np.float32).copy()
    k = w / W0
    if prints:
        # thumb: left margin of the "Genua" column, just above the fold (visible on the folded paper)
        stamp(a, 0.095 * w, 0.405 * h, max(13, round(62 * k)), max(16, round(80 * k)), 0.35, 4.2, 0.85, DIRT, 5)
        # index finger: mirrored across the fold (on the back of the folded paper), fainter and smeared
        stamp(a, 0.085 * w, 0.612 * h, max(12, round(56 * k)), max(14, round(70 * k)), -0.5, 3.8, 0.6, DIRT, 9)
        chaff(a, max(1, w / 512))
    return a

def quantize16(a, hot=()):
    im = Image.fromarray(a.clip(0, 255).astype(np.uint8))
    w, h = im.size
    tiles = [im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))) for x0, y0, x1, y1 in hot]
    train = Image.new('RGB', (w, h + sum(t.height for t in tiles) * 6 + 1), (0, 0, 0))
    train.paste(im, (0, 0)); y = h
    for t in tiles:
        for _ in range(6): train.paste(t, (0, y)); y += t.height
    train = train.crop((0, 0, w, y))
    pq = train.quantize(colors=16, method=Image.MEDIANCUT, dither=Image.NONE)
    q = im.quantize(palette=pq, dither=Image.NONE)
    pal = q.getpalette()[:48]
    idx = np.asarray(q, np.uint8)
    return idx, pal, q.convert('RGB')

def pack(idx):
    f = idx.reshape(-1)
    return base64.b64encode(((f[0::2] << 4) | f[1::2]).astype(np.uint8).tobytes()).decode()

HOT_F = [(0.0, 0.0, 0.18, 0.1), (0.0, 0.9, 0.17, 1.0), (0.04, 0.36, 0.15, 0.66)]
HOT_B = [(0.82, 0.0, 1.0, 0.1), (0.83, 0.9, 1.0, 1.0)]
out = {}
for name, (w, h) in {'front': (512, 768), 'frontLo': (256, 384)}.items():
    idx, pal, prev = quantize16(finish(A, w, h), HOT_F)
    out[name] = {'w': w, 'h': h, 'pal': pal, 'data': pack(idx)}
    prev.save(ROOT + f'qa/news/{name}.png')

# ------------------------------------------------------------------ back page (page 4: running head, text, ads)
B = Image.new('RGB', (W0, H0), tuple(PAPER.astype(int)))
mast = SRC.crop((40, 18, 984, 112)).resize((472, 47), Image.LANCZOS)
B.paste(mast, ((W0 - 472) // 2, 26))
d = ImageDraw.Draw(B)
INK = (38, 34, 30)
d.line([(40, 84), (W0 - 40, 84)], fill=INK, width=2); d.line([(40, 89), (W0 - 40, 89)], fill=INK, width=1)
B.paste(SRC.crop((40, 140, 250, 172)), (40, 94))  # "Nr. 87"
B.paste(SRC.crop((380, 140, 640, 172)), (382, 94))  # date
d.line([(40, 132), (W0 - 40, 132)], fill=INK, width=1)
# upper half: four columns of text taken from other places of the front page
cols = [(40, 262), (268, 518), (522, 764), (766, 990)]
starts = [700, 1010, 330, 560]
for (x0, x1), sy in zip(cols, starts):
    B.paste(SRC.crop((x0, sy, x1, sy + 520)), (x0, 142))
for x in (265, 520, 765):
    d.line([(x, 142), (x, 662)], fill=INK, width=1)
d.line([(40, 668), (W0 - 40, 668)], fill=INK, width=3)
# lower half: bordered advertisements
heads = [SRC.crop((290, 1248, 470, 1282)), SRC.crop((800, 1248, 960, 1282)), SRC.crop((80, 1248, 250, 1282)), SRC.crop((560, 1248, 760, 1282))]
small = [SRC.crop((26, 1285, 254, 1450)), SRC.crop((270, 1285, 508, 1450)), SRC.crop((520, 1285, 760, 1450)), SRC.crop((770, 1285, 1000, 1450))]
boxes = [(40, 680, 500, 900), (510, 680, 984, 820), (510, 830, 984, 1040), (40, 910, 330, 1180), (340, 910, 500, 1180),
         (40, 1190, 640, 1330), (650, 1050, 984, 1330), (40, 1340, 984, 1500)]
for i, (x0, y0, x1, y1) in enumerate(boxes):
    d.rectangle([x0, y0, x1, y1], outline=INK, width=3 if i % 3 == 0 else 2)
    hd = heads[i % 4]; s = min((x1 - x0 - 30) / hd.width, 1.7 if (x1 - x0) > 400 else 1.1)
    hd2 = hd.resize((int(hd.width * s), int(hd.height * s)), Image.LANCZOS)
    B.paste(hd2, (x0 + (x1 - x0 - hd2.width) // 2, y0 + 10))
    sm = small[(i + 1) % 4]; ty = y0 + 16 + hd2.height
    while ty < y1 - 30:
        cw = min(sm.width, x1 - x0 - 20); ch = min(sm.height, y1 - 10 - ty)
        B.paste(sm.crop((0, 0, cw, ch)), (x0 + (x1 - x0 - cw) // 2, ty)); ty += ch + 6
Ba = np.asarray(B, np.float32).copy()
# same paper wear as the front: tone variation, yellowed edges, damp corners (top-right/bottom-right = behind the front's left edge)
n = smooth_noise(W0, H0, 64, 3)
Ba *= (0.94 + n[..., None] * 0.1)
edge = np.minimum(np.minimum(xx, W0 - 1 - xx), np.minimum(yy, H0 - 1 - yy))
Ba -= np.clip(1 - edge / 40, 0, 1)[..., None] * np.array([18, 22, 30], np.float32)
for (cx, cy, R, s) in [(W0 + 10, -20, 150, 11), (W0 + 10, H0 + 20, 130, 12)]:
    wet, tide = damp(cx, cy, R, s)
    Ba -= wet[..., None] * np.array([40, 40, 38], np.float32) + tide[..., None] * np.array([26, 36, 52], np.float32)
idx, pal, prev = quantize16(finish(Ba, 256, 384, prints=False), HOT_B)
out['back'] = {'w': 256, 'h': 384, 'pal': pal, 'data': pack(idx)}
prev.save(ROOT + 'qa/news/back.png')
finish(Ba, 512, 768, prints=False)  # (hi twin of the back page = generic upscale)

js = '// GENERATED by tools/news_tex.py — do not edit. Münchner Neueste Nachrichten, 29.3.1922: 4-bit CLUT pages (rows top -> bottom).\n'
js += 'export const NEWS_TEX = ' + json.dumps(out, separators=(',', ':')) + ';\n'
open(ROOT + 'src/models/newspaper_tex.gen.js', 'w').write(js)
print({k: (v['w'], v['h'], len(v['data'])) for k, v in out.items()}, len(js))
