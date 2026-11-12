# Overlay the concept-sheet silhouette (red outline) on an orthographic QA render of the dog.
# usage: python3 tools/overlay.py <render.png> <out.png> <view: side|front> <ortho> <ty> <tz_or_tx> <anchor_world_h>
import sys, cv2, numpy as np
CONCEPT = '/data/.agent-service/files/a7a233c0-4293-408e-bfeb-adba75674504/tool-output-0.png'
rp, outp, view, O, ty, th, anchor = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6]), float(sys.argv[7])
C = cv2.imread(CONCEPT).astype(int)
R = cv2.imread(rp)
H, W = R.shape[:2]; ppm = H / (2 * O)
# concept regions: (x0,y0,x1,y1), ground y, px per metre (withers 0.55 m), anchor x (nose tip for side, midline for front)
REG = {'side': ((185, 95, 460, 340), 332, 284.8, 193, -1), 'front': ((55, 95, 140, 340), 332, 284.8, 97.5, 1)}
(x0, y0, x1, y1), gy, cppm, ax, sgn = REG[view]
r = C[y0:y1, x0:x1]
m = (np.abs(r - r[5, 5]).sum(-1) > 45).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
# affine: concept px -> render px. world y = (gy - oy)/cppm ; world h = anchor + sgn*(ox - ax)/cppm (h = z for side (nose->left), x for front)
# render: sx = W/2 + s_h*(h - th)*ppm, sy = H/2 - (y - ty)*ppm ; side view angle -90 => screen x = -(z - tz)
s_h = -1 if view == 'side' else 1
k = ppm / cppm
# sx = W/2 + s_h*ppm*(anchor + sgn*(ox-ax)/cppm - th) ; ox = x0 + u
a = s_h * sgn * k; b = W / 2 + s_h * ppm * (anchor - th) - s_h * sgn * k * (ax - x0)
c = k; d = H / 2 - ppm * ((gy - y0) / cppm - ty)  # sy = H/2 - ppm*((gy - (y0+v))/cppm - ty) = d + k*v
M = np.float32([[a, 0, b], [0, c, d]])
mw = cv2.warpAffine(m, M, (W, H), flags=cv2.INTER_LINEAR)
cs, _ = cv2.findContours((mw > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cs = [c for c in cs if cv2.contourArea(c) > 2000]
cv2.drawContours(R, cs, -1, (40, 40, 230), 2)
cv2.imwrite(outp, R)
