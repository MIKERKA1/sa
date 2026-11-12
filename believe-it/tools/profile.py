# Compare silhouette extents (concept vs ortho render) per height row. usage: profile.py side|front render.png ortho ty th anchor
import sys, cv2, numpy as np
CONCEPT = '/data/.agent-service/files/a7a233c0-4293-408e-bfeb-adba75674504/tool-output-0.png'
view, rp, O, ty, th, anchor = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
C = cv2.imread(CONCEPT).astype(int); R = cv2.imread(rp).astype(int)
H, W = R.shape[:2]; ppm = H / (2 * O)
REG = {'side': ((185, 95, 460, 340), 332, 284.8, 193, -1), 'front': ((55, 95, 140, 340), 332, 284.8, 97.5, 1)}
(x0, y0, x1, y1), gy, cppm, ax, sgn = REG[view]
mc = np.abs(C[y0:y1, x0:x1] - C[y0 + 5, x0 + 5]).sum(-1) > 45
mr = np.abs(R - R[3, 3]).sum(-1) > 30
s_h = -1 if view == 'side' else 1
print('  y   | concept h-range        | ours h-range')
for y in np.arange(0.80, -0.001, -0.02):
    cy = int(round(gy - y * cppm)) - y0
    ry = int(round(H / 2 - (y - ty) * ppm))
    def rng(xs, f):
        if len(xs) == 0: return '      -       '
        hs = sorted(f(xs)); return f'{hs[0]:+.3f}..{hs[-1]:+.3f}'
    cs = np.nonzero(mc[cy])[0] if 0 <= cy < mc.shape[0] else []
    rs = np.nonzero(mr[ry])[0] if 0 <= ry < H else []
    fc = lambda xs: anchor + sgn * ((xs + x0) - ax) / cppm
    fr = lambda xs: th + s_h * (xs - W / 2) / ppm
    print(f'{y:.2f} | {rng(cs, fc):22s} | {rng(rs, fr)}')
