# Side view: per-z column, list of vertical runs (y ranges) for concept and ours.
import sys, cv2, numpy as np
CONCEPT = '/data/.agent-service/files/a7a233c0-4293-408e-bfeb-adba75674504/tool-output-0.png'
rp, O, ty, tz, anchor = sys.argv[1], *map(float, sys.argv[2:6])
C = cv2.imread(CONCEPT).astype(int); R = cv2.imread(rp).astype(int)
H, W = R.shape[:2]; ppm = H / (2 * O)
x0, y0, x1, y1 = 185, 95, 460, 340; gy, cppm, ax = 332, 284.8, 193
mc = np.abs(C[y0:y1, x0:x1] - C[y0 + 5, x0 + 5]).sum(-1) > 45
mc = cv2.morphologyEx(mc.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8)) > 0
mr = np.abs(R - R[3, 3]).sum(-1) > 30
def runs(col, f):
    out = []; on = False
    for i, v in enumerate(col):
        if v and not on: s = i; on = True
        if not v and on:
            if i - s > 2: out.append((f(i - 1), f(s)))
            on = False
    if on: out.append((f(len(col) - 1), f(s)))
    return ' '.join(f'{a:.2f}-{b:.2f}' for a, b in out)
for z in np.arange(0.54, -0.46, -0.02):
    cx = int(round(ax - (z - anchor) * cppm)) - x0
    rx = int(round(W / 2 - (z - tz) * ppm))
    c = runs(mc[:, cx], lambda v: (gy - (v + y0)) / cppm) if 0 <= cx < mc.shape[1] else '-'
    r = runs(mr[:, rx], lambda v: ty + (H / 2 - v) / ppm) if 0 <= rx < W else '-'
    print(f'{z:+.2f} | C {c:40s} | O {r}')
