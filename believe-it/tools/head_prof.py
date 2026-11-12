# numeric head profile: concept (heads.png PROFILE panel) vs render (ortho side, nose left), head-local coords
# usage: python3 tools/head_prof.py <render.png> <ortho> <tx> <ty>
import sys, cv2, numpy as np
rp, O, tx, ty = sys.argv[1], *map(float, sys.argv[2:5])
HEADP = np.array([0, 0.6147, 0.2997]); EYE = np.array([0.0479, 0.6502, 0.3834]) - HEADP
CPPM = 112 / (2 * 0.0479)
C = cv2.imread('/data/fears_game/qa/ref/heads.png').astype(int)
x0, y0, x1, y1 = 390, 30, 790, 565
r = C[y0:y1, x0:x1]; bg = np.median(r[:20, :20].reshape(-1, 3), 0)
mc = (np.abs(r - bg).sum(-1) > 40)
for yy in range(mc.shape[0]):
    if not (295 - y0 < yy < 380 - y0): mc[yy, 768 - x0:] = False
R = cv2.imread(rp).astype(int); H, W = R.shape[:2]; ppm = H / (2 * O)
bgr = R[3, 3]; mr = np.abs(R - bgr).sum(-1) > 40
def conc(z):  # concept column -> (top, bottom) y_local
    u = int(round(657 + (z - EYE[2]) * CPPM)) - x0
    if u < 0 or u >= mc.shape[1]: return None
    col = np.where(mc[:, u])[0]
    if not len(col): return None
    return EYE[1] - (col[0] + y0 - 278) / CPPM, EYE[1] - (col[-1] + y0 - 278) / CPPM
def ours(z):
    px = int(round(W / 2 + (-(z + HEADP[2]) - tx) * ppm))
    if px < 0 or px >= W: return None
    col = np.where(mr[:, px])[0]
    if not len(col): return None
    f = lambda py: ty - (py - H / 2) / ppm - HEADP[1]
    return f(col[0]), f(col[-1])
print('  z     concept top/bot     ours top/bot')
for z in np.arange(-0.1, 0.2, 0.01):
    a, b = conc(z), ours(z)
    fa = '%7.3f %7.3f' % a if a else '   -      -   '
    fb = '%7.3f %7.3f' % b if b else '   -      -   '
    print('%6.3f  %s   %s' % (z, fa, fb))
