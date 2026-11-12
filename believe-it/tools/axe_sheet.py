# Composite the axe model sheet from viewer renders (qa/sheet/*.png) -> deliver/axe_sheet.png
from PIL import Image, ImageDraw, ImageFont
import json
Q = '/data/fears_game/qa/sheet/'
F = lambda p, s: ImageFont.truetype(p, s)
MONO, MONOB = '/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf', '/usr/share/fonts/liberation-mono/LiberationMono-Bold.ttf'
TITLE = '/usr/share/fonts/msttcore/georgiab.ttf'
BG, PANEL, LINE, TXT, MUT = (217, 212, 200), (226, 222, 211), (160, 154, 142), (40, 38, 34), (92, 88, 80)
W, H, M = 1800, 1215, 18
sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet)
img = lambda n: Image.open(Q + n).convert('RGB')
def fit(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
def crop_c(im, w): x = (im.width - w) // 2; return im.crop((x, 0, x + w, im.height))
def panel(x, y, w, h, title):
    d.rectangle([x, y, x + w, y + h], fill=PANEL, outline=LINE, width=2)
    d.text((x + 12, y + 9), title, font=F(MONOB, 15), fill=TXT)
def cap(x, y, t, f=None): d.text((x, y), t, font=f or F(MONO, 14), fill=TXT)

# header
d.text((M + 6, 10), 'Believe It', font=F(TITLE, 56), fill=TXT)
d.line([(M, 80), (360, 80)], fill=TXT, width=2)
d.line([(385, 18), (385, 74)], fill=LINE, width=2)
d.text((402, 22), 'PS1 3D-АССЕТ · LOW-POLY', font=F(MONOB, 18), fill=TXT)
d.text((402, 48), 'ЗИМА · СЕВЕРНАЯ ГЛУБИНКА · ФЕРМА', font=F(MONO, 17), fill=MUT)
for i, (t, f, c) in enumerate([('КОЛУН ДЛЯ ДРОВ', F(MONOB, 24), TXT), ('ЛИСТ 3D-МОДЕЛИ', F(MONO, 20), MUT), ('212 ТРЕУГ. / АТЛАС 128² / NEAREST', F(MONO, 14), TXT)]):
    tw = d.textlength(t, font=f); d.text((W - M - 6 - tw, [12, 44, 70][i]), t, font=f, fill=c)

# row 1: turnaround + hero with callouts
y1, h1 = 96, 470
panel(M, y1, 1460, h1, 'РАЗВОРОТ / ОРТОГОНАЛЬНЫЕ ВИДЫ')
x = M + 16
for n, t in [('front.png', 'СПЕРЕДИ'), ('profile.png', 'СБОКУ'), ('back.png', 'СЗАДИ'), ('top.png', 'СВЕРХУ')]:
    src = img(n); im = fit(src.crop((100, 0, 350, src.height)) if n == 'top.png' else crop_c(src, 250), 400)
    sheet.paste(im, (x, y1 + 36)); cap(x + (im.width - d.textlength(t, font=F(MONO, 14))) / 2, y1 + 442, t)
    x += im.width + 12
hero = img('hero.png'); hx, hy = x + 14, y1 + 40; hs = 420 / hero.height; cw = min(hero.width, round((M + 1460 - 16 - hx) / hs)); HC = (hero.width - cw) // 2; hero = hero.crop((HC, 0, HC + cw, hero.height))
heroS = hero.resize((round(hero.width * hs), round(hero.height * hs)), Image.LANCZOS)
sheet.paste(heroS, (hx, hy))
pts = json.load(open('/tmp/axe_pts.json'))
fl = F(MONOB, 15)
for (px, py), (t, dx, dy) in zip(pts['hero'], [('ЖЕЛЕЗНЫЙ ОБУХ', 40, -40), ('ОБМОТКА БЕЧЁВКОЙ', 70, -22), ('ТОПОРИЩЕ (ЯСЕНЬ)', 70, -40), ('НАБАЛДАШНИК', -40, 34)]):
    ax, ay = hx + (px - HC) * hs, hy + py * hs; lx, ly = ax + dx, ay + dy
    d.ellipse([ax - 3, ay - 3, ax + 3, ay + 3], fill=TXT)
    d.line([(ax, ay), (lx, ly)], fill=TXT, width=2)
    tw = d.textlength(t, font=fl)
    tx = lx + 6 if dx > 0 else lx - tw - 6
    d.rectangle([tx - 4, ly - 11, tx + tw + 4, ly + 10], fill=PANEL); d.text((tx, ly - 9), t, font=fl, fill=TXT)
# spec column
sx = M + 1460 + 14; panel(sx, y1, W - M - sx, h1, 'ХАРАКТЕРИСТИКИ')
spec = ['ДЛИНА: 70 СМ', 'ОБУХ: 17 × 16 СМ', '', 'ТРЕУГОЛЬНИКИ: 212', ' - обух ........ 68', ' - топорище .... 96', ' - обмотка ..... 48', '',
        'МАТЕРИАЛЫ:', ' - чугун (обух)', ' - ясень (топорище)', ' - бечёвка (обмотка)', '', 'ПАТИНА:', ' - окисленное железо', ' - сухое серо-бурое', '   дерево', ' - выветренная бечёвка']
for i, t in enumerate(spec): d.text((sx + 14, y1 + 40 + i * 21), t, font=F(MONOB if t and not t.startswith(' ') else MONO, 14), fill=TXT)
d.line([(sx + 14, y1 + 428), (W - M - 14, y1 + 428)], fill=LINE, width=1)
d.text((sx + 14, y1 + 436), 'Точка опоры — низ\nнабалдашника, лезвие по +X', font=F(MONO, 12), fill=MUT, spacing=3)

# row 2: exploded + mesh | first person | environment
y2, h2, th = y1 + h1 + 14, 326, 256
def strip(x, title, items, gap=12):
    ims = [(fit(im, th), t) for im, t in items]
    w = sum(i.width for i, _ in ims) + gap * (len(ims) - 1) + 28
    panel(x, y2, w, h2, title)
    xx = x + 14
    for im, t in ims:
        sheet.paste(im, (xx, y2 + 34)); cap(xx, y2 + 34 + th + 8, t); xx += im.width + gap
    return x + w + 14
x = M
exI = img('ex.png'); exC = exI.crop((150, 0, 560, exI.height))
x0 = x
x = strip(x, 'РАЗБОРКА И СЕТКА', [(exC, '1. ЧАСТИ'), (crop_c(img('wire.png'), 260), '2. СЕТКА')])
# exploded labels (projected part centres)
s = th / exI.height
for (px, py), t in zip(pts['ex'], ['ОБУХ', 'ОБМОТКА', 'ТОПОРИЩЕ']):
    ax, ay = x0 + 14 + (px - 150) * s, y2 + 34 + py * s
    f = F(MONOB, 11); tw = d.textlength(t, font=f)
    tx = min(ax + 26, x0 + 14 + exC.width * s - tw - 2)
    d.rectangle([tx - 3, ay - 8, tx + tw + 3, ay + 7], fill=PANEL); d.text((tx, ay - 7), t, font=f, fill=TXT)
x = strip(x, 'ВИД ОТ ПЕРВОГО ЛИЦА', [(img('p_axe.png'), '1. НАИЗГОТОВКУ'), (img('p_up.png'), '2. У ПЛЕЧА')])
e2 = img('env2a.png')
e1 = img('env1.png'); x = strip(x, 'ОКРУЖЕНИЕ', [(e1, '1. В КОЛОДЕ У ПОЛЕННИЦЫ'), (e2, '2. У СТЕНЫ САРАЯ')], gap=max(12, W - M - x - 28 - fit(e1, th).width - fit(e2, th).width))

# row 3: textures | palette | in game
y3 = y2 + h2 + 14; h3 = H - y3 - M
at = Image.open(Q + 'atlas.png').convert('RGB')
sw = [(at.crop((40, 80, 88, 128)), 'ЖЕЛЕЗО'), (at.crop((0, 40, 32, 72)), 'ДРЕВЕСИНА'), (at.crop((40, 48, 72, 80)), 'БЕЧЁВКА')]
panel(M, y3, 700, h3, 'ТЕКСТУРЫ (ПИКСЕЛИ БЕЗ ФИЛЬТРАЦИИ)')
xx = M + 14
big = at.resize((224, 224), Image.NEAREST); sheet.paste(big, (xx, y3 + 34)); cap(xx, y3 + 34 + 224 + 6, 'АТЛАС 128×128')
xx += 224 + 22
for im, t in sw:
    sheet.paste(im.resize((128, 128), Image.NEAREST), (xx, y3 + 34)); cap(xx, y3 + 34 + 134, t); xx += 128 + 14
d.text((M + 14 + 224 + 22, y3 + 34 + 162), 'Один материал на всю модель.\nTексели крупные, как на PS1:\nсглаживания и мип-карт нет.'.replace('T', 'Т'), font=F(MONO, 13), fill=MUT, spacing=4)
px0 = M + 700 + 14; panel(px0, y3, 430, h3, 'ПАЛИТРА')
pal = [('#3d3e41', 'ЖЕЛЕЗО'), ('#5a3125', 'РЖАВЧИНА'), ('#927b60', 'СТАРОЕ\nДЕРЕВО'), ('#b99b71', 'БЕЧЁВКА')]
for i, (hx_, t) in enumerate(pal):
    cx = px0 + 18 + i * 102
    d.rectangle([cx, y3 + 40, cx + 86, y3 + 160], fill=hx_)
    d.multiline_text((cx, y3 + 168), t, font=F(MONO, 13), fill=TXT, spacing=2); d.text((cx, y3 + 204), hx_.upper(), font=F(MONO, 12), fill=MUT)
gx = px0 + 430 + 14; gw = W - M - gx; panel(gx, y3, gw, h3, 'В ИГРЕ (VHS / 4:3)')
gh = h3 - 70
for i, (n, t) in enumerate([('g_E.png', 'E · ДЕНЬ · ТОПОР У КОЛОДЫ'), ('g_F.png', 'F · НОЧЬ · ТОПОР У САРАЯ')]):
    im = fit(img(n), gh); xx = gx + 14 + i * (im.width + 12)
    d.rectangle([xx - 3, y3 + 31, xx + im.width + 2, y3 + 34 + gh + 2], fill=(20, 20, 20))
    sheet.paste(im, (xx, y3 + 34)); cap(xx, y3 + 34 + gh + 8, t, F(MONO, 13))
sheet.save('/data/fears_game/deliver/axe_sheet.png'); print(sheet.size, x)
