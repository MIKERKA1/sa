# Composite the newspaper model sheet from viewer renders (qa/newsheet/*.png) -> deliver/newspaper_sheet.png
from PIL import Image, ImageDraw, ImageFont, ImageChops
import json, base64, re
ROOT = '/data/fears_game/'
Q = ROOT + 'qa/newsheet/'
F = lambda p, s: ImageFont.truetype(p, s)
MONO, MONOB = '/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf', '/usr/share/fonts/liberation-mono/LiberationMono-Bold.ttf'
TITLE = '/usr/share/fonts/msttcore/georgiab.ttf'
BG, PANEL, LINE, TXT, MUT = (217, 212, 200), (226, 222, 211), (160, 154, 142), (40, 38, 34), (92, 88, 80)
W, H, M = 1800, 1215, 18
sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet)
img = lambda n: Image.open(Q + n).convert('RGB')
def fit(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
def fitw(im, w): return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
def tight(im, pad=10):  # crop to the object (differs from the corner colour)
    bg = Image.new('RGB', im.size, im.getpixel((2, 2)))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 14 else 0)
    x0, y0, x1, y1 = diff.getbbox()
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
def panel(x, y, w, h, title):
    d.rectangle([x, y, x + w, y + h], fill=PANEL, outline=LINE, width=2)
    d.text((x + 12, y + 9), title, font=F(MONOB, 15), fill=TXT)
def cap(x, y, t, f=None, c=TXT): d.text((x, y), t, font=f or F(MONO, 14), fill=c)
def capc(x, w, y, t, f=None):
    f = f or F(MONO, 14); d.text((x + (w - d.textlength(t, font=f)) / 2, y), t, font=f, fill=TXT)
def callout(ax, ay, t, dx, dy, fl=None, box=None):
    fl = fl or F(MONOB, 15); lx, ly = ax + dx, ay + dy
    d.ellipse([ax - 3, ay - 3, ax + 3, ay + 3], fill=TXT); d.line([(ax, ay), (lx, ly)], fill=TXT, width=2)
    tw = d.textlength(t, font=fl); tx = lx + 6 if dx > 0 else lx - tw - 6
    if box: tx = max(box[0] + 6, min(tx, box[2] - tw - 6))
    d.rectangle([tx - 4, ly - 11, tx + tw + 4, ly + 10], fill=PANEL); d.text((tx, ly - 9), t, font=fl, fill=TXT)

# header
d.text((M + 6, 10), 'Believe It', font=F(TITLE, 56), fill=TXT)
d.line([(M, 80), (360, 80)], fill=TXT, width=2)
d.line([(385, 18), (385, 74)], fill=LINE, width=2)
d.text((402, 22), 'PS1 3D-АССЕТ · LOW-POLY', font=F(MONOB, 18), fill=TXT)
d.text((402, 48), 'ЗИМА · БАВАРИЯ · ХУТОР · МАРТ 1922', font=F(MONO, 17), fill=MUT)
for i, (t, f, c) in enumerate([('ГАЗЕТА «MÜNCHNER NEUESTE NACHRICHTEN»', F(MONOB, 24), TXT), ('ЛИСТ 3D-МОДЕЛИ · СРЕДА, 29.03.1922, № 87', F(MONO, 20), MUT), ('344 ТРЕУГ. / ПОЛОСЫ 256×384, 4-BIT CLUT / NEAREST', F(MONO, 14), TXT)]):
    tw = d.textlength(t, font=f); d.text((W - M - 6 - tw, [12, 44, 70][i]), t, font=f, fill=c)

# ---------------- row 1: views | hero on the bench | spec
y1, h1 = 96, 470
ff, fb = img('t_ff.png'), img('t_fb.png')
of, ob = img('t_of.png'), img('t_ob.png')
cw = 235; ffs, fbs = fitw(ff, cw), fitw(fb, cw)
oh = 404; ofs, obs = fit(of, oh), fit(ob, oh)
pw = 14 + cw + 16 + ofs.width + 12 + obs.width + 14
panel(M, y1, pw, h1, 'РАЗВОРОТ / ВИДЫ')
x = M + 14; y = y1 + 34
sheet.paste(ffs, (x, y)); capc(x, cw, y + ffs.height + 3, 'СЛОЖЕНА · СПЕРЕДИ')
y2_ = y + ffs.height + 24
sheet.paste(fbs, (x, y2_)); capc(x, cw, y2_ + fbs.height + 3, 'СЛОЖЕНА · СЗАДИ')
x += cw + 16
sheet.paste(ofs, (x, y1 + 34)); capc(x, ofs.width, y1 + 34 + oh + 6, 'РАЗВЁРНУТА · 1-Я ПОЛОСА')
x += ofs.width + 12
sheet.paste(obs, (x, y1 + 34)); capc(x, obs.width, y1 + 34 + oh + 6, 'ОБОРОТ · 4-Я ПОЛОСА')
# hero
sx_spec = W - M - 300
hx0 = M + pw + 14; hw_ = sx_spec - 14 - hx0
panel(hx0, y1, hw_, h1, 'НА ЛАВКЕ У ПЕЧИ · УТРО 30 МАРТА')
hero = img('hero.png'); pts = json.load(open(Q + 'hero.json'))
hs = min((h1 - 48) / hero.height, (hw_ - 28) / hero.width); cwid = hero.width; HC = 0
heroS = hero.crop((HC, 0, HC + cwid, hero.height)).resize((round(cwid * hs), h1 - 48), Image.LANCZOS)
hx, hy = hx0 + 14, y1 + 36
sheet.paste(heroS, (hx, hy))
P = lambda k: (hx + (pts[k][0] - HC) * hs, hy + pts[k][1] * hs)
HB = (hx, hy, hx + heroS.width, hy + heroS.height)
for k, t, dx, dy in [('mast', 'ДАТА: СРЕДА, 29.03.1922', 30, -44), ('thumb', 'ОТПЕЧАТОК ПАЛЬЦА', 40, -36), ('straw', 'ТРАВИНКА СЕНА В СГИБЕ', 30, 44), ('damp', 'СЫРОЙ УГОЛ', -6, -38)]:
    ax, ay = P(k); callout(ax, ay, t, dx, dy, box=HB)
# spec
panel(sx_spec, y1, 300, h1, 'ХАРАКТЕРИСТИКИ')
spec = ['ПОЛОСА: 38 × 57 СМ', 'СЛОЖЕНА: 38 × 28,5 СМ', '', 'ТРЕУГОЛЬНИКИ: 344', ' - 1-я полоса ... 132', ' - 4-я полоса ... 132', ' - кромки ....... 68', ' - травинка ..... 12', '',
        'СОСТОЯНИЯ:', ' - на лавке', ' - сложена пополам', ' - развёрнута (сгиб', '   плавно анимирован)', '', 'УЛИКИ «ЕГО»:', ' - грязный отпечаток', '   большого пальца', ' - след указательного', ' - сырые волнистые углы', ' - сухая травинка сена']
for i, t in enumerate(spec): d.text((sx_spec + 14, y1 + 38 + i * 19.5), t, font=F(MONOB if t and not t.startswith(' ') else MONO, 13), fill=TXT)

# ---------------- row 2: fold sequence | mesh | clue close-ups
y2, h2, th = y1 + h1 + 14, 320, 250
def strip(x, title, items, gap=12, w_override=None):
    ims = [(fit(im, th), t) for im, t in items]
    w = w_override or sum(i.width for i, _ in ims) + gap * (len(ims) - 1) + 28
    panel(x, y2, w, h2, title)
    xx = x + 14
    for im, t in ims:
        sheet.paste(im, (xx, y2 + 34)); cap(xx, y2 + 34 + th + 8, t); xx += im.width + gap
    return x + w + 14
def ctr(im, w):  # centre crop to width w (or keep)
    if im.width <= w: return im
    x0 = (im.width - w) // 2; return im.crop((x0, 0, x0 + w, im.height))
x = M
seq = [ctr(img(f's{i}.png'), 330) for i in (1, 2, 3, 4)]
x = strip(x, 'СЛОЖИТЬ ↔ РАЗВЕРНУТЬ (ОДНА СЕТКА, СГИБ АНИМИРОВАН)', [(seq[0], '1. СЛОЖЕНА'), (seq[1], '2.'), (seq[2], '3.'), (seq[3], '4. РАЗВЁРНУТА')])
x = strip(x, 'СЕТКА', [(ctr(img('wire.png'), 360), '344 ТРЕУГ.')])
rest = W - M - x
x = strip(x, 'УЛИКИ КРУПНО', [(img('c_thumb.png'), '1. ОТПЕЧАТОК'), (img('c_straw.png'), '2. ТРАВИНКА'), (img('c_damp.png'), '3. СЫРОЙ УГОЛ')], gap=max(12, (rest - 28 - 3 * th) // 2), w_override=rest)

# ---------------- row 3: textures | palette | first person
y3 = y2 + h2 + 14; h3 = H - y3 - M
src = open(ROOT + 'src/models/newspaper_tex.gen.js').read()
T = json.loads(re.search(r'NEWS_TEX = (\{.*\});', src).group(1))
def dec(t):
    raw = base64.b64decode(t['data']); im = Image.new('RGB', (t['w'], t['h'])); px = im.load(); p = t['pal']
    for i in range(t['w'] * t['h']):
        b = raw[i >> 1]; k = (b & 15) if i & 1 else (b >> 4); px[i % t['w'], i // t['w']] = tuple(p[k * 3:k * 3 + 3])
    return im
fl, bk = dec(T['frontLo']), dec(T['back'])
tw_ = 770
panel(M, y3, tw_, h3, 'ТЕКСТУРЫ (ПИКСЕЛИ БЕЗ ФИЛЬТРАЦИИ)')
xx = M + 14; th3 = h3 - 66
for im, t in [(fl, '1-Я ПОЛОСА 256×384'), (bk, '4-Я ПОЛОСА 256×384')]:
    s = fit(im, th3); sheet.paste(s, (xx, y3 + 34)); cap(xx, y3 + 34 + th3 + 6, t, F(MONO, 13)); xx += s.width + 14
for (bx, t) in [((0, 0, 72, 60), 'МОКРЫЙ УГОЛ ×3')]:
    cr = fl.crop(bx); s = cr.resize((cr.width * 3, cr.height * 3), Image.NEAREST)
    if s.height > th3: s = s.crop((0, 0, s.width, th3))
    sheet.paste(s, (xx, y3 + 34)); cap(xx, y3 + 34 + s.height + 6, t, F(MONO, 13)); xx += s.width + 14
d.multiline_text((xx, y3 + 40), 'Скан полосы из Gemini,\nужатый до 16 цветов\n(4-битная палитра,\nкак на PS1). Улики\nзапечены в текстуру.\nВ режиме «Улучшенная»\n— та же полоса 512×768.', font=F(MONO, 13), fill=MUT, spacing=4)
px0 = M + tw_ + 14; pw3 = 262; panel(px0, y3, pw3, h3, 'ПАЛИТРА 1-Й ПОЛОСЫ (16)')
pal = T['frontLo']['pal']; cols = sorted([tuple(pal[i * 3:i * 3 + 3]) for i in range(16)], key=lambda c: sum(c))
sz = 46
for i, c in enumerate(cols):
    cx, cy = px0 + 16 + (i % 4) * (sz + 12), y3 + 40 + (i // 4) * (sz + 10)
    d.rectangle([cx, cy, cx + sz, cy + sz], fill=c, outline=LINE)
gx = px0 + pw3 + 14; gw = W - M - gx; panel(gx, y3, gw, h3, 'ВИД ОТ ПЕРВОГО ЛИЦА')
gh = min(h3 - 70, round((gw - 40) / 2 * 0.75))
for i, (n, t) in enumerate([('fp_paper.png', '1. ВЗЯЛ С ЛАВКИ'), ('fp_read.png', '2. ЧИТАЕТ')]):
    im = fit(img(n), gh); xx = gx + 14 + i * (im.width + 12)
    sheet.paste(im, (xx, y3 + 34)); cap(xx, y3 + 34 + gh + 8, t, F(MONO, 13))
sheet.save(ROOT + 'deliver/newspaper_sheet.png'); print(sheet.size, gx + gw)
