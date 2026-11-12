#!/usr/bin/env python3
"""Photo textures for the enhanced renderer.
raw AI surface photos (assets/photo/raw/*.png, 1024^2) -> de-lit, seamless (min-error boundary cut), brightness-calibrated
albedo + a height map per surface -> WebP -> src/engine/photo_data.gen.js (base64; decoded at startup by photo.js).
Usage: python3 tools/photo_tex.py [name,name...]"""
import numpy as np, cv2, json, base64, io, sys, os
from PIL import Image

ROOT = '/data/fears_game'
RAW, PROC = f'{ROOT}/assets/photo/raw', f'{ROOT}/assets/photo/proc'
MEANS = json.load(open(f'{ROOT}/qa/texmeans.json'))
LW = np.array([0.299, 0.587, 0.114], np.float32)
R = np.random.default_rng(7)


def load(n): return np.asarray(Image.open(f'{RAW}/{n}.png').convert('RGB')).astype(np.float32) / 255
def f32(a): return np.ascontiguousarray(a, dtype=np.float32)
def lum(a): return a @ LW
def blur(a, s): return cv2.GaussianBlur(a, (0, 0), s, borderType=cv2.BORDER_REFLECT)
def wblur(a, s):  # gaussian blur on a torus (tileable images)
    p = int(3 * s) + 2
    pad = ((p, p), (p, p)) + ((0, 0),) * (a.ndim - 2)
    return cv2.GaussianBlur(np.pad(a, pad, mode='wrap'), (0, 0), s)[p:-p, p:-p]
def norm01(h, lo=1, hi=99):
    a, b = np.percentile(h, lo), np.percentile(h, hi)
    return np.clip((h - a) / max(b - a, 1e-6), 0, 1)


def delight(a, frac=0.1, k=0.85):
    """divide out broad lighting gradients (keeps local contrast)"""
    L = lum(a); low = blur(L, a.shape[0] * frac)
    r = np.clip(low / L.mean(), 0.3, 3) ** k
    return f32(np.clip(a / r[..., None], 0, 1))


def seam_path(E, margin):
    H, B = E.shape
    E = E.copy(); E[:, :margin] += 1e3; E[:, B - margin:] += 1e3
    C = E.copy()
    for i in range(1, H):
        p = C[i - 1]
        C[i] += np.minimum(np.minimum(np.r_[np.inf, p[:-1]], p), np.r_[p[1:], np.inf])
    path = np.empty(H, int); path[-1] = int(np.argmin(C[-1]))
    for i in range(H - 2, -1, -1):
        j = path[i + 1]; lo = max(0, j - 1)
        path[i] = lo + int(np.argmin(C[i, lo:j + 2]))
    return path


def tile_x(a, bmin=72, bmax=170, feather=4, extra=None):
    """make the left/right edges continuous: overlap the last b columns with the first b along a minimum-error cut.
    extra: optional list of arrays (same HxW) cut identically (e.g. a height map)"""
    H, W = a.shape[:2]
    best = None
    for b in range(bmin, bmax + 1, 2):
        e = ((a[:, W - b:] - a[:, :b]) ** 2).mean()
        if best is None or e < best[0]: best = (e, b)
    b = best[1]
    A, Bq = a[:, W - b:], a[:, :b]
    E = blur(((A - Bq) ** 2).reshape(H, b, -1).sum(-1), 1.5)
    path = seam_path(E, feather + 2)
    d = np.arange(b)[None, :] - path[:, None]
    w = np.clip(0.5 - d / (2 * feather), 0, 1)
    def cut(x):
        ww = w if x.ndim == 2 else w[..., None]
        return np.concatenate([x[:, W - b:] * ww + x[:, :b] * (1 - ww), x[:, b:W - b]], axis=1)
    return (f32(cut(a)), [f32(cut(x)) for x in extra]) if extra is not None else f32(cut(a))


def tile_y(a, **k):
    if 'extra' in k and k['extra'] is not None:
        r, ex = tile_x(np.swapaxes(a, 0, 1), **{**k, 'extra': [np.swapaxes(x, 0, 1) for x in k['extra']]})
        return np.swapaxes(r, 0, 1), [np.swapaxes(x, 0, 1) for x in ex]
    return np.swapaxes(tile_x(np.swapaxes(a, 0, 1), **k), 0, 1)


def tile2(a, **k): return tile_y(tile_x(a, **k), **k)


def calibrate(a, name, lum_k=1.0, chroma_k=0.35, gain=1.0, target=None):
    """match the mean brightness of the old procedural texture (the scene lighting was tuned on those)"""
    t = np.array(target if target is not None else MEANS[name]['mean'], np.float32) / 255 * gain
    m = a.reshape(-1, 3).mean(0)
    a = a * (lum(t) / lum(m)) ** lum_k
    m2 = a.reshape(-1, 3).mean(0)
    g = (t / np.maximum(m2, 1e-4)) ** chroma_k
    g = g / lum(g)  # chroma only
    return f32(np.clip(a * g, 0, 1))


def hp_height(a, s_big=24, s_fine=3, wf=0.35, wrap=True):
    L = lum(a); bl = wblur if wrap else blur
    big = L - bl(L, s_big); fine = L - bl(L, s_fine)
    return norm01(big + fine * wf)


def clean(mask, min_area):
    """drop specks: keep connected components of the mask larger than min_area px"""
    m = mask.astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
    return keep[lab]


def soft_mask_height(mask, radius=6, wrap=True):
    """rounded raised areas from a binary 'solid' mask (distance to the joints, capped)"""
    m = (mask > 0.5).astype(np.uint8)
    if wrap:
        p = radius * 3
        mp = np.pad(m, p, mode='wrap')
        d = cv2.distanceTransform(mp, cv2.DIST_L2, 5)[p:-p, p:-p]
    else: d = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    x = np.clip(d / radius, 0, 1)
    return np.sin(x * np.pi / 2)


# ---------------------------------------------------------------- boards (floor / wall planks): rebuilt from strips
def board_strips(a, gaps):
    return [a[:, gaps[i]:gaps[i + 1]] for i in range(len(gaps) - 1)]


def boards_2m(a, gaps, ncol=10, size=1024, joints=True, seed=3, tone=0.06):
    """2 m x 2 m tile: ncol boards (each one of the photo's boards, 1 m stretched to 2 m along the grain),
    shuffled / flipped / toned; joints: one butt joint per board at a staggered height, else seamless along the grain"""
    rg = np.random.default_rng(seed)
    st = board_strips(a, gaps)
    widths = np.array([s.shape[1] for s in st], np.float32)
    order = []
    while len(order) < ncol:
        p = list(rg.permutation(len(st)))
        if order and p[0] == order[-1]: p = p[1:] + p[:1]
        order += p
    order = order[:ncol]
    wsum = widths[order].sum()
    xs = np.round(np.cumsum([0] + [widths[i] / wsum * size for i in order])).astype(int)
    out = np.zeros((size, size, 3), np.float32); hgt = np.zeros((size, size), np.float32)
    used = []
    for c, i in enumerate(order):
        w = xs[c + 1] - xs[c]
        s = st[i]
        if rg.random() < 0.5: s = s[::-1]
        if rg.random() < 0.3: s = s[:, ::-1]
        s = cv2.resize(s, (w, size), interpolation=cv2.INTER_AREA)
        L = lum(s)
        h = norm01(L - blur(L, 10) + 0.4 * (L - blur(L, 2)))
        if not joints:
            s2, (h2,) = tile_y(s, bmin=60, bmax=140, feather=10, extra=[h])
            s = cv2.resize(s2, (w, size), interpolation=cv2.INTER_CUBIC); h = cv2.resize(h2, (w, size), interpolation=cv2.INTER_CUBIC)
        roll = int(rg.integers(0, size))
        s = np.roll(s, roll, axis=0); h = np.roll(h, roll, axis=0)
        s = s * (1 + (rg.random() - 0.5) * 2 * tone)
        xx = (np.arange(w) + 0.5) / w
        crown = np.sin(xx * np.pi) ** 0.5  # slightly cupped / worn round board faces
        hh = 0.35 + 0.4 * h * crown[None, :] + 0.25 * crown[None, :]
        # dark gap at both board edges
        e = np.minimum(np.arange(w), w - 1 - np.arange(w)).astype(np.float32)
        gap = np.clip(1 - e / 2.2, 0, 1)
        s = s * (1 - 0.72 * gap[None, :, None]); hh = hh * (1 - 0.95 * gap[None, :])
        if joints:  # butt joint where the strip wraps
            yy = np.arange(size, dtype=np.float32)
            dj = np.minimum(np.abs(yy - roll), size - np.abs(yy - roll))
            jl = np.clip(1 - dj / 1.6, 0, 1)
            s = s * (1 - 0.6 * jl[:, None, None]); hh = hh * (1 - 0.8 * jl[:, None])
        out[:, xs[c]:xs[c + 1]] = s; hgt[:, xs[c]:xs[c + 1]] = hh
        used.append((int(i), int(w), roll))
    return np.clip(out, 0, 1), np.clip(hgt, 0, 1)


# ---------------------------------------------------------------- per-surface recipes
def P_floor():
    a = delight(load('floor'), 0.12, 0.8)
    al, h = boards_2m(a, [0, 209, 409, 615, 817, 1024], joints=True, seed=11)
    return calibrate(al, 'floor', chroma_k=0.25, gain=1.12), h

def P_plank():
    a = delight(load('plank'), 0.12, 0.8)
    al, h = boards_2m(a, [0, 203, 410, 617, 822, 1024], joints=False, seed=5, tone=0.08)
    return calibrate(al, 'plank', chroma_k=0.2, gain=1.15), h

def P_generic(name, src=None, frac=0.1, k=0.85, s_big=24, s_fine=3, wf=0.35, chroma=0.35, gain=1.0, size=None, target=None, bmax=170):
    a = delight(load(src or name), frac, k)
    a = tile2(a, bmax=bmax)
    if size: a = cv2.resize(a, (size, size), interpolation=cv2.INTER_AREA)
    return calibrate(a, name if target is None else name, chroma_k=chroma, gain=gain, target=target), hp_height(a, s_big * (a.shape[0] / 1024), s_fine, wf)

def P_brick():
    a = delight(load('brick'), 0.12, 0.8)
    a = tile2(a, bmin=90, bmax=220)
    a = cv2.resize(a, (512, 512), interpolation=cv2.INTER_AREA)
    L = lum(a); red = a[..., 0] - a[..., 2]
    mort = clean((wblur(L, 1.2) > np.percentile(L, 72)) & (wblur(red, 1.2) < 0.2), 40)
    m = ~mort
    h = 0.75 * soft_mask_height(m, 4) + 0.25 * hp_height(a, 8, 2, 0.5)
    return calibrate(a, 'brick', chroma_k=0.2, gain=1.0), norm01(h, 0.5, 99.5)

def P_flag():
    a = delight(load('flag'), 0.12, 0.8)
    a = tile2(a, bmax=190)
    L = lum(a)
    m = ~clean(wblur(L, 2.0) < np.percentile(L, 14), 400)
    h = 0.6 * soft_mask_height(m, 10) + 0.4 * hp_height(a, 30, 3, 0.4)
    return calibrate(a, 'flag', chroma_k=0.3, gain=1.05), norm01(h, 0.5, 99.5)

def P_roof():
    a = delight(load('roof'), 0.12, 0.8)
    a = tile2(a, bmin=100, bmax=220)
    L = lum(a)
    m = wblur(L, 1.5) > np.percentile(L, 9)
    h = 0.55 * soft_mask_height(m, 7) + 0.45 * hp_height(a, 20, 2.5, 0.4)
    return calibrate(a, 'roof', chroma_k=0.25, gain=1.05), norm01(h, 0.5, 99.5)

def P_stone():
    a = delight(load('stone'), 0.12, 0.8)
    a = tile2(a, bmax=190)
    L = lum(a); sc = wblur(L, 3) + wblur(a[..., 0] - a[..., 2], 3) * 1.5
    mort = clean(sc > np.percentile(sc, 60), 120)
    h = 0.5 * soft_mask_height(~mort, 14) + 0.5 * hp_height(a, 24, 3, 0.45)
    return calibrate(a, 'stone', chroma_k=0.2, gain=1.05), norm01(h, 0.5, 99.5)

RECIPES = {
    'floor': P_floor, 'plank': P_plank,
    'wash': lambda: P_generic('wash', s_big=40, wf=0.6, chroma=0.3),
    'washI': lambda: P_generic('washI', s_big=40, wf=0.6, chroma=0.4),
    'wood': lambda: P_generic('wood', s_big=16, wf=0.5, chroma=0.65, gain=0.82, size=768),
    'stone': P_stone, 'brick': P_brick, 'flag': P_flag, 'roof': P_roof,
    'mud': lambda: P_generic('mud', s_big=20, wf=0.5, chroma=0.3, gain=1.0, size=768),
    'grass': lambda: P_generic('grass', s_big=12, wf=0.6, chroma=0.25, gain=0.95, size=768),
    'snow': lambda: P_generic('snow', frac=0.06, k=0.6, s_big=30, wf=0.4, chroma=0.5),
    'litter': lambda: P_generic('litter', s_big=12, wf=0.6, chroma=0.0, gain=1.0, target=[70, 58, 44], size=768),
    'hay': lambda: P_generic('hay', s_big=10, wf=0.6, chroma=0.25, size=512),
    'bark': lambda: P_generic('bark', s_big=10, wf=0.5, chroma=0.2, size=512),
    'burlap': lambda: P_generic('burlap', s_big=6, wf=0.8, chroma=0.3, size=512),
    'iron': lambda: P_generic('iron', s_big=10, wf=0.6, chroma=0.75, size=512, gain=0.95),
}
Q = {'a': 74, 'h': 70}
SHIP_H = {'floor', 'plank', 'stone', 'brick', 'flag', 'roof'}  # structured surfaces ship a (half-res) height; the rest derive it from the albedo in JS


def webp(arr, q, gray=False):
    im = Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8), 'L' if gray else 'RGB')
    if gray: im = im.convert('RGB')
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6); return b.getvalue()


def main():
    only = sys.argv[1].split(',') if len(sys.argv) > 1 else None
    os.makedirs(PROC, exist_ok=True)
    for n, fn in RECIPES.items():
        if only and n not in only: continue
        al, h = fn()
        hh, ww = al.shape[:2]
        if hh % 2 or ww % 2: al = al[:hh // 2 * 2, :ww // 2 * 2]; h = h[:hh // 2 * 2, :ww // 2 * 2]
        open(f'{PROC}/{n}_a.webp', 'wb').write(webp(al, Q['a']))
        hs = cv2.resize(h, (al.shape[1] // 2, al.shape[0] // 2), interpolation=cv2.INTER_AREA)
        open(f'{PROC}/{n}_h.webp', 'wb').write(webp(hs, Q['h'], gray=True))
        m = (al.reshape(-1, 3).mean(0) * 255).round(1)
        print(f'{n:7s} {al.shape[1]}x{al.shape[0]}  a {os.path.getsize(f"{PROC}/{n}_a.webp") // 1024} KB  h {os.path.getsize(f"{PROC}/{n}_h.webp") // 1024} KB  mean {m}')
    # js module with every processed surface
    data = {}
    for n in RECIPES:
        if os.path.exists(f'{PROC}/{n}_a.webp'):
            data[n] = {k: base64.b64encode(open(f'{PROC}/{n}_{k}.webp', 'rb').read()).decode() for k in (('a', 'h') if n in SHIP_H else ('a',))}
    with open(f'{ROOT}/src/engine/photo_data.gen.js', 'w') as f:
        f.write('// generated by tools/photo_tex.py — WebP albedo (a) + height (h) of the photo surfaces\nexport const PHOTO_DATA = ' + json.dumps(data) + ';\n')
    print('js', os.path.getsize(f'{ROOT}/src/engine/photo_data.gen.js') // 1024, 'KB')




# ================================================================ hardware: textures cut from the padlock / slide-bolt concept sheets
LOCK, BOLT = f'{ROOT}/assets/props/lock_concept.png', f'{ROOT}/assets/props/bolt_concept.png'
def cload(p): return np.asarray(Image.open(p).convert('RGB')).astype(np.float32) / 255
def crop(a, box): x0, y0, x1, y1 = box; return f32(a[y0:y1, x0:x1])
def up(a, k): return f32(np.clip(cv2.resize(a, (round(a.shape[1] * k), round(a.shape[0] * k)), interpolation=cv2.INTER_LANCZOS4), 0, 1))
def sharpen(a, s=1.2, k=0.35): return f32(np.clip(a + (a - blur(a, s)) * k, 0, 1))


def unroll_shackle(a):
    """the shackle arch of the front view unrolled into a strip: columns along the bar (leg, arch, leg), rows across it"""
    cx, cy, rm, hw = 815.0, 152.5, 90.5, 19.5
    leg = 45  # px of straight leg below the arch centre down to the body
    arc = int(np.pi * rm)
    cols = []
    for i in range(leg):  # right leg, bottom -> up
        y = cy + leg - i
        cols.append([(cx + rm + t, y) for t in np.linspace(-hw, hw, 44)])
    for i in range(arc):
        th = i / arc * np.pi
        cols.append([(cx + (rm + t) * np.cos(th), cy - (rm + t) * np.sin(th)) for t in np.linspace(-hw, hw, 44)])
    for i in range(leg):  # left leg, top -> down
        y = cy + i
        cols.append([(cx - rm - t, y) for t in np.linspace(-hw, hw, 44)])
    P = np.array(cols, np.float32)  # (L, 44, 2)
    mx, my = P[..., 0], P[..., 1]
    s = cv2.remap(a, mx.T.copy(), my.T.copy(), cv2.INTER_LINEAR)  # (44, L, 3): rows across, cols along
    prof = s.mean(axis=1, keepdims=True); prof = prof / prof.mean()
    s = f32(np.clip(s / np.maximum(prof, 0.25) ** 0.85, 0, 1))  # flatten the baked round shading
    s = tile_x(s, bmin=20, bmax=60, feather=3)
    return f32(np.concatenate([s, s[::-1]], axis=0))  # front half + mirrored back half around the bar


def hw_recipes():
    L, B = cload(LOCK), cload(BOLT)
    out = {}
    out['lockF'] = sharpen(up(delight(crop(L, (662, 188, 966, 470)), 0.5, 0.35), 2))
    out['lockB'] = sharpen(up(delight(crop(L, (1199, 188, 1503, 470)), 0.5, 0.35), 2))
    out['lockBand'] = sharpen(up(tile_y(delight(crop(L, (1058, 205, 1117, 452)), 0.5, 0.5), bmin=20, bmax=50, feather=3), 2))
    out['shackle'] = sharpen(up(unroll_shackle(L), 2))
    out['frac'] = sharpen(up(tile2(crop(L, (765, 710, 865, 805)), bmin=12, bmax=30, feather=3), 3))
    out['keyF'] = sharpen(up(crop(L, (990, 650, 1490, 850)), 2))
    out['boltF'] = sharpen(up(delight(crop(B, (686, 44, 1410, 246)), 0.4, 0.3), 2))
    out['keeperF'] = sharpen(up(crop(B, (1426, 86, 1492, 252)), 2))
    out['hwIron'] = sharpen(up(tile2(delight(crop(L, (1262, 240, 1440, 400)), 0.3, 0.7), bmin=16, bmax=40, feather=3), 2))
    out['hwSteel'] = sharpen(up(tile_y(tile_x(delight(crop(B, (890, 156, 1182, 184)), 0.3, 0.7), bmin=20, bmax=50, feather=3), bmin=4, bmax=8, feather=2), 2))
    out['hwPlate'] = sharpen(up(tile_y(tile_x(delight(crop(B, (895, 192, 1180, 233)), 0.3, 0.7), bmin=20, bmax=60, feather=3), bmin=6, bmax=14, feather=2), 2))
    return out


def main_hw():
    data = {}
    for n, a in hw_recipes().items():
        hh, ww = a.shape[:2]
        a = a[:hh // 2 * 2, :ww // 2 * 2]
        b = webp(a, 86)
        open(f'{PROC}/{n}_a.webp', 'wb').write(b)
        data[n] = {'a': base64.b64encode(b).decode()}
        print(f'{n:9s} {a.shape[1]}x{a.shape[0]}  {len(b) // 1024} KB')
    with open(f'{ROOT}/src/engine/photo_hw.gen.js', 'w') as f:
        f.write('// generated by tools/photo_tex.py (hardware) — WebP textures cut from the padlock / slide-bolt concept sheets\nexport const PHOTO_HW = ' + json.dumps(data) + ';\n')
    print('js', os.path.getsize(f'{ROOT}/src/engine/photo_hw.gen.js') // 1024, 'KB')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'hw': main_hw()
    else: main()
