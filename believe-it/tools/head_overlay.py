# Concept head panel (heads.png) outline over an orthographic head render, aligned at the eye, same scale.
# usage: python3 tools/head_overlay.py <render.png> <out.png> prof|front <ortho_half_h> <tx> <ty> <tz> <elev> [blend]
#  render: dog tab, ortho, prof = angle -1.5708 elev 0 (nose left), front = angle 0 (elev any); target = (tx, ty, 0) world
import sys, cv2, numpy as np
rp, outp, view, O, tx, ty, tz, el = sys.argv[1], sys.argv[2], sys.argv[3], *map(float, sys.argv[4:9])
blend = len(sys.argv) > 9
REF = '/data/fears_game/qa/ref/heads.png'
EYE = np.array([0.0479, 0.6502, 0.3834])            # left eye centre, bind pose, root coords
CPPM = 112 / (2 * EYE[0])                            # concept px per metre (front eye spacing 112 px)
C = cv2.imread(REF); R = cv2.imread(rp); H, W = R.shape[:2]; ppm = H / (2 * O)
if view == 'prof':
    x0, y0, x1, y1 = 390, 30, 790, 600; ceye = (657, 278)
    ex = W / 2 + (-EYE[2] - tx) * ppm; ey = H / 2 - (EYE[1] - ty) * ppm; flip = True
else:
    x0, y0, x1, y1 = 15, 30, 365, 600; ceye = (245, 281)
    up = np.array([0, np.cos(el), -np.sin(el)]); T = np.array([tx, ty, tz])
    ex = W / 2 + (EYE[0] - T[0]) * ppm; ey = H / 2 - (EYE - T) @ up * ppm; flip = False
r = C[y0:y1, x0:x1].copy()
bg = np.median(r[:20, :20].reshape(-1, 3), 0)
m = (np.abs(r.astype(int) - bg).sum(-1) > 40).astype(np.uint8) * 255
if view == 'prof':  # panel divider line near x=773 (keep the nose rows)
    for yy in range(m.shape[0]):
        if not (295 - y0 < yy < 380 - y0): m[yy, 768 - x0:] = 0
m[565 - y0:, :] = 0  # drop panel captions
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
k = ppm / CPPM
cx, cy = ceye[0] - x0, ceye[1] - y0
if flip:  # concept nose right -> mirror so nose is left like the render
    M = np.float32([[-k, 0, ex + k * cx], [0, k, ey - k * cy]])
else:
    M = np.float32([[k, 0, ex - k * cx], [0, k, ey - k * cy]])
if blend:
    rw = cv2.warpAffine(r, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(255, 255, 255))
    R = np.concatenate([R, rw], 1)
mw = cv2.warpAffine(m, M, (W, H), flags=cv2.INTER_LINEAR)
cs, _ = cv2.findContours((mw > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cs = [c for c in cs if cv2.contourArea(c) > 1500]
cv2.drawContours(R, cs, -1, (40, 40, 230), 2)
if blend: cv2.drawContours(R[:, W:], cs, -1, (40, 40, 230), 1)
# concept feature marks (heads.png px): eyes, nose, mouth corner, chin
FE = {'prof': [(657, 278), (768, 342), (660, 385), (725, 400)], 'front': [(133, 281), (245, 281), (190, 392), (190, 460), (150, 440), (230, 440)]}[view]
for (u, v) in FE:
    p = M @ np.array([u - x0, v - y0, 1.0])
    cv2.drawMarker(R, (int(p[0]), int(p[1])), (40, 40, 230), cv2.MARKER_CROSS, 18, 2)
cv2.drawMarker(R, (int(ex), int(ey)), (230, 120, 20), cv2.MARKER_TILTED_CROSS, 14, 2)
cv2.imwrite(outp, R)
