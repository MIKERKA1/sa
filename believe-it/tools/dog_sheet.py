# Composite the dog model sheet from viewer renders (qa/dogsheet/*.png) -> deliver/dog_sheet.png
from PIL import Image, ImageDraw, ImageFont
import json
Q = '/data/fears_game/qa/dogsheet/'
F = lambda p, s: ImageFont.truetype(p, s)
MONO, MONOB = '/usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf', '/usr/share/fonts/liberation-mono/LiberationMono-Bold.ttf'
TITLE = '/usr/share/fonts/msttcore/georgiab.ttf'
BG, LINE, TXT, MUT = (217, 212, 200), (160, 154, 142), (40, 38, 34), (92, 88, 80)
PANEL = Image.open(Q + 'ts_side.png').convert('RGB').getpixel((2, 2))  # exact render clear colour
W, H, M = 1800, 1660, 18
sheet = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(sheet)
import numpy as np
def img(n):  # flatten the dithered clear colour of viewer renders into the flat panel colour
    a = np.asarray(Image.open(Q + n).convert('RGB')).astype(np.int16)
    if n.startswith(('ts_', 'an_', 'hd_', 'ex', 'wire')):
        m = np.abs(a - np.array(PANEL)).max(axis=2) <= 12; a[m] = PANEL
    return Image.fromarray(a.astype(np.uint8))
def fit(im, h): return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
def fitw(im, w): return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
def panel(x, y, w, h, title):
    d.rectangle([x, y, x + w, y + h], fill=PANEL, outline=LINE, width=2)
    d.text((x + 12, y + 9), title, font=F(MONOB, 15), fill=TXT)
def cap(x, y, t, f=None, w=None):
    f = f or F(MONO, 14)
    if w is not None: x += (w - d.textlength(t, font=f)) / 2
    d.text((x, y), t, font=f, fill=TXT)
def label(ax, ay, dx, dy, t, f):
    lx, ly = ax + dx, ay + dy
    d.ellipse([ax - 3, ay - 3, ax + 3, ay + 3], fill=TXT); d.line([(ax, ay), (lx, ly)], fill=TXT, width=2)
    tw = d.textlength(t, font=f); tx = lx + 6 if dx > 0 else lx - tw - 6
    d.rectangle([tx - 4, ly - 11, tx + tw + 4, ly + 10], fill=PANEL); d.text((tx, ly - 9), t, font=f, fill=TXT)

# ---------------------------------------------------------------- header
d.text((M + 6, 10), 'Believe It', font=F(TITLE, 56), fill=TXT)
d.line([(M, 80), (360, 80)], fill=TXT, width=2)
d.line([(385, 18), (385, 74)], fill=LINE, width=2)
d.text((402, 22), 'PS1 3D-АССЕТ · LOW-POLY', font=F(MONOB, 18), fill=TXT)
d.text((402, 48), 'ЗИМА · СЕВЕРНАЯ ГЛУБИНКА · ФЕРМА', font=F(MONO, 17), fill=MUT)
for i, (t, f, c) in enumerate([('ДЕРЕВЕНСКАЯ ЛАЙКА', F(MONOB, 24), TXT), ('ЛИСТ 3D-МОДЕЛИ', F(MONO, 20), MUT), ('610 ТРЕУГ. / АТЛАС 128² / NEAREST', F(MONO, 14), TXT)]):
    tw = d.textlength(t, font=f); d.text((W - M - 6 - tw, [12, 44, 70][i]), t, font=f, fill=c)

# ---------------------------------------------------------------- row 1: turnaround + hero
y1, h1 = 96, 500; IY, IH = y1 + 38, 428          # image area
panel(M, y1, 1460, h1, 'РАЗВОРОТ / ВИДЫ')
x = M + 18
for n, box, t in [('ts_front.png', (355, 185, 545, 740), 'СПЕРЕДИ'), ('ts_back.png', (346, 188, 554, 750), 'СЗАДИ')]:
    im = fit(img(n).crop(box), IH); sheet.paste(im, (x, IY)); cap(x, IY + IH + 8, t, w=im.width); x += im.width + 14
side = fitw(img('ts_side.png').crop((118, 120, 820, 715)), 330); top = fitw(img('ts_top.png').crop((92, 282, 855, 479)), 330)
sheet.paste(side, (x, IY)); cap(x, IY + side.height + 4, 'СБОКУ', w=330)
ty = IY + side.height + 30; sheet.paste(top, (x, ty)); cap(x, ty + top.height + 4, 'СВЕРХУ', w=330)
x += 330 + 14
d.line([(x, IY), (x, IY + IH + 22)], fill=LINE, width=1)
HB = (200, 90, 820, 790); hero = img('ts_34.png').crop(HB); hs = (IH + 10) / hero.height
heroS = hero.resize((round(hero.width * hs), round(hero.height * hs)), Image.LANCZOS)
hx = x + 150; sheet.paste(heroS, (hx, IY - 4))
cap(hx, IY + IH + 8, '3/4 · ГЕРОЙ-ВИД', w=heroS.width)
P = lambda px, py: (hx + (px - HB[0]) * hs, IY - 4 + (py - HB[1]) * hs)
fl = F(MONOB, 14)
for (px, py), dx, dy, t in [((664, 128), 70, -12, 'УШИ ТОРЧКОМ'), ((690, 211), 95, 6, 'ЯНТАРНЫЕ ГЛАЗА'), ((560, 318), 175, 34, 'ОШЕЙНИК С КОЛЬЦОМ'),
                            ((640, 432), 112, 22, 'БЕЛАЯ ГРУДЬ'), ((540, 740), 120, -6, 'БЕЛЫЕ «НОСОЧКИ»'),
                            ((322, 140), -60, -18, 'ХВОСТ КОЛЬЦОМ'), ((420, 284), -150, 72, 'ТЁМНЫЙ ЧЕПРАК'), ((372, 372), -100, 70, 'РЫЖИЕ БОКА')]:
    ax, ay = P(px, py); label(ax, ay, dx, dy, t, fl)
# spec column
sx = M + 1460 + 14; panel(sx, y1, W - M - sx, h1, 'ХАРАКТЕРИСТИКИ')
spec = ['В ХОЛКЕ: 58 СМ', 'КОРПУС: 71 СМ', 'ДО ТЕМЕНИ: 72 СМ', '', 'ТРЕУГОЛЬНИКИ: 610', ' - туловище ..... 168', ' - голова ....... 112', ' - лапы ......... 216',
        ' - хвост ......... 78', ' - ошейник ....... 36', '', 'РИГ:', ' - жёсткая иерархия', ' - IK лап по земле', ' - веки, моргание', ' - пасть, уши, хвост', '',
        'АНИМАЦИЙ: 8']
for i, t in enumerate(spec): d.text((sx + 14, y1 + 40 + i * 21), t, font=F(MONOB if t and not t.startswith(' ') else MONO, 14), fill=TXT)
d.line([(sx + 14, y1 + 432), (W - M - 14, y1 + 432)], fill=LINE, width=1)
d.text((sx + 14, y1 + 440), 'Точка опоры — земля под\nсерединой корпуса,\nморда по +Z', font=F(MONO, 12), fill=MUT, spacing=3)

# ---------------------------------------------------------------- row 2: poses & animation | head
y2 = y1 + h1 + 14; CW, CH, LH = 196, 186, 22; h2 = 38 + 2 * (CH + LH) + 8
AB = (95, 37, 875, 797)                            # common crop -> same scale for every pose
pw = 28 + 6 * CW + 5 * 8; panel(M, y2, pw, h2, 'ПОЗЫ И АНИМАЦИИ')
cells = [('an_1.png', '1 · СТОИТ'), ('an_0.png', '2 · СИДИТ'), ('an_6.png', '7 · ВИЛЯЕТ'), ('an_7.png', '4 · ЛАЕТ'), ('an_9.png', '6 · НЮХАЕТ'), ('an_10.png', '8 · ЛАСКАЕТСЯ'),
         ('an_2.png', '3 · ШАГ 1/4'), ('an_3.png', 'ШАГ 2/4'), ('an_4.png', 'ШАГ 3/4'), ('an_5.png', 'ШАГ 4/4'), ('an_8.png', '5 · СПИТ (КАЛАЧИКОМ)')]
fc = F(MONO, 13)
for i, (n, t) in enumerate(cells):
    r, c = divmod(i, 6); cx, cy = M + 14 + c * (CW + 8), y2 + 38 + r * (CH + LH)
    w = CW * 2 + 8 if i == 10 else CW
    im = img(n).crop(AB)
    if i == 10:  # wide cell at the same scale: pad the sides with panel colour
        sw_ = round((AB[3] - AB[1]) * w / CH); pad = Image.new('RGB', (sw_, AB[3] - AB[1]), PANEL); pad.paste(im, ((sw_ - im.width) // 2, 0)); im = pad
    im = im.resize((w, CH), Image.LANCZOS)
    sheet.paste(im, (cx, cy)); cap(cx, cy + CH + 3, t, fc, w=w)
gx = M + pw + 14; gw = W - M - gx; panel(gx, y2, gw, h2, 'ГОЛОВА И МИМИКА')
HW = (gw - 28 - 16) // 3
heads = [('hd_front.png', 110, 'СПОКОЙНА'), ('hd_prof.png', 40, 'ПРОФИЛЬ'), ('hd_wag.png', 105, 'РАДУЕТСЯ'),
         ('hd_alert.png', 20, 'ЛАЕТ'), ('hd_bliss.png', 90, 'ЖМУРИТСЯ'), ('hd_sleep.png', 250, 'СПИТ')]
for i, (n, x0, t) in enumerate(heads):
    r, c = divmod(i, 3); cx, cy = gx + 14 + c * (HW + 8), y2 + 38 + r * (CH + LH)
    src = img(n); cwid = round(src.height * HW / CH); x0 = max(0, min(x0, src.width - cwid))
    sheet.paste(src.crop((x0, 0, x0 + cwid, src.height)).resize((HW, CH), Image.LANCZOS), (cx, cy)); cap(cx, cy + CH + 3, t, fc, w=HW)

# ---------------------------------------------------------------- row 3: exploded + mesh | first person | environment
y3 = y2 + h2 + 14; th = 216; h3 = th + 34 + 36
def strip(x, title, items, gap=12, last=False):
    ims = [(fit(im, th), t) for im, t in items]
    w = sum(i.width for i, _ in ims) + gap * (len(ims) - 1) + 28
    if last: gap += (W - M - x) - w; w = W - M - x
    panel(x, y3, w, h3, title); xx = x + 14
    for im, t in ims:
        sheet.paste(im, (xx, y3 + 34)); cap(xx, y3 + 34 + th + 8, t, F(MONO, 13)); xx += im.width + gap
    return x + w + 14
EXB = (180, 100, 820, 710); exI = img('ex.png')
x0 = M; x = strip(M, 'РАЗБОРКА И СЕТКА', [(exI.crop(EXB), '1. ЧАСТИ'), (img('wire.png').crop((165, 80, 855, 785)), '2. СЕТКА (610)')])
pts = json.load(open('/tmp/sh1_out.json')); exl = json.loads(pts['ex'])
s = th / (EXB[3] - EXB[1]); exw = round((EXB[2] - EXB[0]) * s); f = F(MONOB, 10)
for _, t, px, py in exl:
    t = {'Грудь и лопатки': 'ГРУДЬ', 'Передние лапы': 'ПЕР. ЛАПЫ', 'Задние лапы': 'ЗАД. ЛАПЫ'}.get(t, t.upper())
    ax, ay = x0 + 14 + (px - EXB[0]) * s, y3 + 34 + (py - EXB[1]) * s
    tw = d.textlength(t, font=f); tx = max(x0 + 16, min(ax - tw / 2, x0 + 14 + exw - tw - 2))
    d.rectangle([tx - 3, ay - 7, tx + tw + 3, ay + 6], fill=PANEL); d.text((tx, ay - 6), t, font=f, fill=TXT)
x = strip(x, 'ВИД ОТ ПЕРВОГО ЛИЦА', [(img('fp1b.png'), '1. ГЛАДИТЬ (СЦЕНА I)'), (img('fp2.png').crop((0, 0, 855, 641)), '2. ПОЗА РУК 9 «СОБАКА»')])
x = strip(x, 'ОКРУЖЕНИЕ', [(img('env1.png'), '1. ДЕНЬ · У БУДКИ'), (img('env2.png'), '2. НОЧЬ · НА КРЫЛЬЦЕ')], last=True)

# ---------------------------------------------------------------- row 4: textures | palette | in game
y4 = y3 + h3 + 14; h4 = H - y4 - M
at = Image.open(Q + 'atlas.png').convert('RGB')
sw = [(at.crop((20, 80, 52, 112)), 'ЧЕПРАК И БОК'), (at.crop((0, 0, 32, 32)), 'БЕЛАЯ ШЕРСТЬ'), (at.crop((94, 96, 126, 128)), 'МОРДА'), (at.crop((96, 40, 128, 64)), 'ОШЕЙНИК')]
tw_ = 720; panel(M, y4, tw_, h4, 'ТЕКСТУРЫ (ПИКСЕЛИ БЕЗ ФИЛЬТРАЦИИ)')
xx = M + 14; AS = min(224, h4 - 66)
sheet.paste(at.resize((AS, AS), Image.NEAREST), (xx, y4 + 34)); cap(xx, y4 + 34 + AS + 6, 'АТЛАС 128×128')
xx += AS + 20; SW = 98
for im, t in sw:
    sheet.paste(im.resize((SW, round(im.height * SW / im.width)), Image.NEAREST), (xx, y4 + 34)); cap(xx, y4 + 34 + SW + 6, t, F(MONO, 12)); xx += SW + 12
d.text((M + 14 + AS + 20, y4 + 34 + SW + 34), 'Один материал на всю модель.\nШерсть нарисована процедурно\nпрямо в атлас: тексели крупные,\nсглаживания и мип-карт нет.', font=F(MONO, 13), fill=MUT, spacing=4)
px0 = M + tw_ + 14; pw4 = 450; panel(px0, y4, pw4, h4, 'ПАЛИТРА')
pal = [('#7a766f', 'ПЕПЕЛ'), ('#c48b55', 'РЫЖИЙ'), ('#e6dccb', 'КРЕМ'), ('#3b3735', 'ЧЕПРАК'), ('#6b3524', 'КОЖА'), ('#b36f24', 'ГЛАЗА')]
for i, (hx_, t) in enumerate(pal):
    cx = px0 + 16 + i * 71
    d.rectangle([cx, y4 + 40, cx + 60, y4 + 150], fill=hx_, outline=LINE)
    d.text((cx, y4 + 158), t, font=F(MONO, 12), fill=TXT); d.text((cx, y4 + 176), hx_.upper(), font=F(MONO, 11), fill=MUT)
d.text((px0 + 16, y4 + 204), 'Серо-рыжий окрас лайки, тёмный чепрак\nпо спине, белые грудь и лапы.', font=F(MONO, 12), fill=MUT, spacing=4)
gx = px0 + pw4 + 14; gw = W - M - gx; panel(gx, y4, gw, h4, 'В ИГРЕ (VHS / 4:3)')
gh = h4 - 70; gims = [(fit(img('vhs_S.png'), gh), 'G · ДЕНЬ · НЮХАЕТ'), (fit(img('vhs_H.png'), gh), 'H · НОЧЬ · ЛАЕТ')]
gap = (gw - 28 - sum(i.width for i, _ in gims)); xx = gx + 14
for im, t in gims:
    d.rectangle([xx - 3, y4 + 31, xx + im.width + 2, y4 + 34 + gh + 2], fill=(20, 20, 20))
    sheet.paste(im, (xx, y4 + 34)); cap(xx, y4 + 34 + gh + 8, t, F(MONO, 13)); xx += im.width + gap
sheet.save('/data/fears_game/deliver/dog_sheet.png'); print(sheet.size, y4, h4, gw, gap)
