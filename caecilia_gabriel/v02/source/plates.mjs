// Plates 2 and 3: detail studies. Every drawing is a crop of the same parametric figure used for the turnaround.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sheet, place, T, HEAD, rule, callout } from './build_sheets.mjs';
import { PAL, M, figure } from './lib.mjs';

const V1 = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'v01');
const para = (x, y, lines, size = 23, lh = 1.28, a = '') => lines.map((l, i) => T(x, y + i * size * lh, l, size, a)).join('');
const frame = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#4A433B" stroke-width="1.2" opacity=".55"/>`;

export function plate2() {
  const o = [];
  // ---- row 1: head from four sides, one scale ----
  const s = 31, base = 1085, Y = (cm) => base - (cm - 94.5) * s;
  const cols = [[600, 0, 'FRONT'], [1310, 35, 'THREE-QUARTER (35°)'], [2010, 90, 'RIGHT PROFILE'], [2690, 180, 'BACK']];
  o.push(HEAD(60, 190, 'FACE AND HEAD'), T(420, 190, '— same head model as the turnaround, enlarged; head height 20 cm, skull width 14.5 cm, face width 12.8 cm, depth 17.5 cm', 24, 'fill="#4A433B"'));
  const lv = [[M.crown, 'crown'], [M.chin + 14.6, 'hairline'], [M.chin + 9.7, 'brow'], [M.chin + 8, 'eye line (40 %)'], [M.chin + 4.1, 'nose base'], [M.chin + 2.5, 'lip line'], [M.chin, 'chin']];
  for (const [h] of lv) o.push(rule(70, Y(h), 3000, Y(h), 1, 'stroke-dasharray="6 8" opacity=".38"'));
  for (const [x, deg, name] of cols) {
    o.push(place(figure({ deg, lw: 1 / s }), x, base + 94.5 * s, s, [-11.2, 94.5, 11.2, 123.2]));
    o.push(`<text x="${x}" y="${base + 44}" font-size="30" text-anchor="middle" letter-spacing="2">${name}</text>`);
  }
  for (const [h, label] of lv) o.push(T(64, Y(h) - 8, label, 21, `fill="#4A433B"`));
  o.push(rule(60, base + 70, 3012, base + 70, 1.5));

  // ---- row 2 left: expressions ----
  const es = 19.5, eb = 1720, exprs = [['neutral', 'NEUTRAL', ['Resting face from v01: level gaze,', 'closed mouth, slightly serious.']], ['curious', 'CURIOUS', ['Brows lift 2–3 mm, eyes a little wider,', 'head tips ~6°, lips barely parted.']],
    ['thoughtful', 'THOUGHTFUL', ['Gaze drops down and aside, upper lids', 'lower, brows draw in, lips pressed.']], ['frightened', 'FRIGHTENED', ['Inner brows rise and pinch, white shows', 'above the iris, mouth opens ~4 mm.']]];
  o.push(HEAD(60, 1205, 'EXPRESSIONS'), T(330, 1205, '— restrained; a quiet child. Shape changes stay inside brow, lid and lip ranges given below.', 24, 'fill="#4A433B"'));
  exprs.forEach(([key, name, desc], i) => {
    const x = 270 + i * 440;
    o.push(place(figure({ deg: 0, lw: 1 / es, expr: key }), x, eb + 96 * es, es, [-10.6, 96, 10.6, 123.4]));
    o.push(`<text x="${x}" y="${eb + 42}" font-size="28" text-anchor="middle" letter-spacing="2">${name}</text>`, para(x, eb + 76, desc, 21, 1.25, 'text-anchor="middle" fill="#4A433B"'));
  });
  o.push(para(60, 1900, ['Limits for blendshapes: brow travel ±5 mm; upper lid from 78 % (thoughtful) to 130 % (frightened) of neutral opening; jaw drop never more than 4 mm; mouth corners ±1.2 mm.',
    'No bared teeth, no cartoon squash-and-stretch. Fear reads in the eyes and brows first, then the mouth.'], 22, 1.3, 'fill="#4A433B"'));

  // ---- row 2 right: hair construction ----
  const hx = 1860;
  o.push(rule(hx - 30, base + 90, hx - 30, 1990, 1.2, 'opacity=".5"'), HEAD(hx, 1205, 'HAIR CONSTRUCTION'));
  const bs = 34;
  o.push(place(figure({ deg: 0, lw: 1 / bs, only: ['braids'] }), hx + 150 - 7.4 * bs, 1225 + 110.3 * bs, bs, [2.6, 88.6, 12, 110.4]));
  o.push(callout(hx + 195, 1290, hx + 330, 1262, 'three-strand plait, starts behind the ear lobe', 22));
  o.push(callout(hx + 200, 1500, hx + 330, 1470, '≈ 2.3 cm wide, 7–8 crossings visible', 22));
  o.push(callout(hx + 215, 1700, hx + 330, 1662, 'bow: cream cotton tape 1.2 cm,\nsame cloth as the collar; loops ≈ 2.5 cm', 22));
  o.push(callout(hx + 160, 1860, hx + 330, 1832, 'loose tail 6 cm, ends level with\nthe 2nd dress button', 22));
  o.push(para(hx + 330, 1318, ['1  Centre parting from the forehead hairline over the', '   crown down to the nape (visible in the back view).',
    '2  Each half is drawn back loosely, covering the top', '   third of the ear; ear lobes stay visible.'], 22, 1.3));
  o.push(para(hx + 330, 1528, ['3  Fine, straight, medium chestnut-brown hair (#534033).', '   Short flyaway wisps at temples and nape — not tidy.',
    '4  Plaits rest forward over the shoulders by default;', '   they may swing behind (v01 back view).'], 22, 1.3));
  o.push(para(hx + 330, 1920, ['Hair-card flow: 27 guide curves per side run from the', 'parting to the plait (drawn in all four head views above).'], 22, 1.3, 'fill="#4A433B"'));
  return sheet(2, 'HEAD, HAIR AND EXPRESSIONS', o.join('\n'));
}

export function plate3() {
  const o = [];
  // ---- row 1: bodice front / back, sleeve, fastenings ----
  const s = 23.5, top = 215, oy = top + 100.6 * s; // cm 100.6 sits at px `top`
  o.push(HEAD(60, 185, 'DRESS — BODICE, COLLAR, SLEEVE'));
  const fx = 380, bx = 1320, PX = (c, x) => c + x * s, PY = (y) => oy - y * s;
  o.push(place(figure({ deg: 0, lw: 1 / s, only: ['body', 'arms'] }), fx, oy, s, [-13.6, 73, 13.6, 100.6]), place(figure({ deg: 180, lw: 1 / s, only: ['body', 'arms'] }), bx, oy, s, [-13.6, 73, 13.6, 100.6]));
  o.push(`<text x="${fx}" y="${PY(73) + 40}" font-size="28" text-anchor="middle" letter-spacing="2">FRONT</text>`, `<text x="${bx}" y="${PY(73) + 40}" font-size="28" text-anchor="middle" letter-spacing="2">BACK</text>`);
  const col = (c, items) => items.map(([x, y, ty, text]) => callout(PX(c, x), PY(y), c + 13.6 * s + 22, ty, text, 21)).join('');
  o.push(col(fx, [[4.4, 96.4, 250, 'Round two-piece collar,\n4.5 cm deep, cream cotton,\nedge-stitched at 3 mm'], [11.3, 93.4, 385, 'Set-in sleeve, a few\ngathers at the head'],
    [0.6, 86.6, 495, '5 horn buttons Ø 1.1 cm,\n4 cm apart, on a 2.3 cm\nfront placket'], [4.7, 81, 640, '3 pintucks each side,\n1 cm apart, shoulder\nto waist'], [8, 75.2, 790, 'Linen apron band, 3 cm']]));
  o.push(col(bx, [[4, 97.4, 250, 'Collar is continuous\nacross the back'], [6, 92.3, 370, 'Yoke seam; back\ngathered into it'], [10.3, 89.5, 490, 'Armscye seam'],
    [0.9, 84, 590, 'Inverted box pleat at\ncentre back — the dress\nhas no back opening'], [4.5, 75.7, 760, 'Apron ties in a bow,\ntails ≈ 15 cm']]));
  // sleeve and cuff, right arm seen from her right
  const ss = 26, sx = 2114, soy = top + 80 * ss;
  o.push(place(figure({ deg: 90, lw: 1 / ss, only: ['arms'] }), sx, soy, ss, [-6.5, 56.4, 13.5, 80]));
  o.push(`<text x="${sx + 3.5 * ss}" y="${PY(73) + 40}" font-size="28" text-anchor="middle" letter-spacing="2">CUFF, RIGHT ARM</text>`);
  o.push(callout(sx + 2.6 * ss, soy - 72 * ss, sx + 5.6 * ss, soy - 76.5 * ss, 'Full sleeve,\ngathered into\nthe cuff band', 21));
  o.push(callout(sx + 2.9 * ss, soy - 63.3 * ss, sx + 5.6 * ss, soy - 67 * ss, 'Cuff 3 cm,\n1 horn button\nØ 1.0 cm on the\nouter back', 21));
  // fastenings and stitches
  const px = 2545;
  o.push(rule(px - 40, 150, px - 40, 1010, 1.2, 'opacity=".5"'), HEAD(px, 185, 'BUTTONS AND STITCHES'));
  o.push(`<circle cx="${px + 80}" cy="300" r="66" fill="${PAL.horn}" stroke="#1E1915" stroke-width="3"/><circle cx="${px + 80}" cy="300" r="44" fill="none" stroke="#6A5D4C" stroke-width="3"/><path d="M${px + 40},262 Q${px + 60},240 ${px + 96},242" stroke="#8A7B65" stroke-width="5" fill="none" opacity=".5" stroke-linecap="round"/>` +
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => `<circle cx="${px + 80 + a * 15}" cy="${300 + b * 15}" r="6.5" fill="#15110E"/>`).join('') +
    `<path d="M${px + 65},285 L${px + 95},315 M${px + 95},285 L${px + 65},315" stroke="${PAL.thread}" stroke-width="5" stroke-linecap="round"/>`);
  o.push(para(px + 160, 262, ['Dark horn or corozo button,', 'Ø 11 mm, four holes, dished', 'rim, unbleached thread.', 'Shown 12 : 1.'], 21, 1.28));
  // buttonhole
  o.push(`<rect x="${px + 62}" y="420" width="36" height="160" rx="18" fill="${PAL.wool}" stroke="none"/><line x1="${px + 80}" y1="436" x2="${px + 80}" y2="564" stroke="#1B1714" stroke-width="5"/>` +
    Array.from({ length: 17 }, (_, i) => `<line x1="${px + 66}" y1="${438 + i * 7.8}" x2="${px + 94}" y2="${438 + i * 7.8}" stroke="${PAL.thread}" stroke-width="2.6"/>`).join(''));
  o.push(para(px + 160, 456, ['Hand-worked buttonhole,', '13 mm, vertical, in the', 'placket.'], 21, 1.28));
  const st = (y, dash, col, w, label, sub) => `<rect x="${px}" y="${y - 22}" width="150" height="44" fill="${PAL.wool}"/><line x1="${px + 8}" y1="${y}" x2="${px + 142}" y2="${y}" stroke="${col}" stroke-width="${w}" stroke-dasharray="${dash}" stroke-linecap="round"/>` + T(px + 160, y - 2, label, 21) + T(px + 160, y + 25, sub, 19, 'fill="#4A433B"');
  o.push(st(660, '14 9', PAL.thread, 3.2, 'Machine lockstitch, 2.5 mm', 'seams, hems, collar, cuffs'));
  o.push(`<rect x="${px}" y="718" width="150" height="44" fill="${PAL.wool}"/><rect x="${px}" y="740" width="150" height="22" fill="${PAL.woolWorn}"/>` + Array.from({ length: 9 }, (_, i) => `<line x1="${px + 10 + i * 16}" y1="${732 + (i % 2) * 3}" x2="${px + 17 + i * 16}" y2="${748 - (i % 3)}" stroke="${PAL.thread}" stroke-width="3.2" stroke-linecap="round"/>`).join('') +
    T(px + 160, 738, 'Hand whip stitch, 3–5 mm', 21) + T(px + 160, 765, 'patch only — a home repair', 19, 'fill="#4A433B"'));
  o.push(st(840, '10 12', '#8E8368', 3, 'Hem line, 3 cm above edge', 'deep hem, let down once'));
  o.push(para(px, 920, ['Seams pressed open; top-stitching only', 'on collar, cuffs and placket.'], 20, 1.28, 'fill="#4A433B"'));
  o.push(rule(60, 1010, 3012, 1010, 1.5));

  // ---- row 2: boots ----
  o.push(HEAD(60, 1062, 'BOOTS'), T(220, 1062, '— brown leather lace-up ankle boots (Schnürstiefel), 12 cm high, 20.5 cm long, 5 eyelet pairs, toe cap, back strap with pull loop; leather sole and stacked heel', 24, 'fill="#4A433B"'));
  const bs = 27, by = 1500;
  const boots = [[330, 90, [-8.2, -0.6, 16, 14.2], 'RIGHT SIDE'], [960, 0, [-10.4, -0.6, 10.4, 14.2], 'FRONT'], [1560, 180, [-10.4, -0.6, 10.4, 14.2], 'BACK'], [2130, 35, [-9, -0.6, 15, 14.2], 'THREE-QUARTER']];
  for (const [x, deg, clip, name] of boots) {
    o.push(rule(x + clip[0] * bs, by, x + clip[2] * bs, by, 1.6), place(figure({ deg, lw: 1 / bs, only: ['legs'] }), x - ((clip[0] + clip[2]) / 2) * bs, by, bs, clip));
    o.push(`<text x="${x}" y="${by + 40}" font-size="26" text-anchor="middle" letter-spacing="2">${name}</text>`);
  }
  // sole plan (toe to the right), hobnailed
  const sxp = 2440, syp = 1400, k = bs;
  const soleD = `M${sxp},${syp} C${sxp},${syp - 3.1 * k} ${sxp + 5.4 * k},${syp - 3.3 * k} ${sxp + 7.4 * k},${syp - 2.9 * k} C${sxp + 10.5 * k},${syp - 2.6 * k} ${sxp + 13 * k},${syp - 3.9 * k} ${sxp + 16.6 * k},${syp - 3.6 * k} C${sxp + 19.6 * k},${syp - 3.3 * k} ${sxp + 20.5 * k},${syp - 1.4 * k} ${sxp + 20.5 * k},${syp} C${sxp + 20.5 * k},${syp + 1.9 * k} ${sxp + 19.2 * k},${syp + 3.6 * k} ${sxp + 15.6 * k},${syp + 3.7 * k} C${sxp + 12.2 * k},${syp + 3.8 * k} ${sxp + 10.2 * k},${syp + 2.5 * k} ${sxp + 7.2 * k},${syp + 2.7 * k} C${sxp + 5 * k},${syp + 3.1 * k} ${sxp},${syp + 3.1 * k} ${sxp},${syp}Z`;
  o.push(`<path d="${soleD}" fill="#5A4A3A" stroke="${PAL.line}" stroke-width="2"/>`, `<path d="M${sxp + 6.1 * k},${syp - 3 * k} L${sxp + 6.1 * k},${syp + 2.9 * k}" stroke="${PAL.line}" stroke-width="1.6"/>`);
  o.push(`<path d="M${sxp + 5.4 * k},${syp - 2.3 * k} C${sxp + 0.2 * k},${syp - 2.9 * k} ${sxp + 0.2 * k},${syp + 2.9 * k} ${sxp + 5.4 * k},${syp + 2.3 * k}" fill="none" stroke="#8D8980" stroke-width="${0.5 * k}" stroke-linecap="round"/>`);
  const nails = [];
  for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2, cx = sxp + 15.1 * k + Math.cos(a) * 4.6 * k, cy = syp + 0.1 * k + Math.sin(a) * 3.0 * k; nails.push([cx, cy]); }
  for (const dx of [12.2, 13.9, 15.6, 17.3]) for (const dy of [-1.1, 0.1, 1.3]) nails.push([sxp + dx * k, syp + dy * k]);
  o.push(nails.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${0.2 * k}" fill="#9A968C" stroke="#3A3631" stroke-width="1"/>`).join(''));
  o.push(`<text x="${sxp + 10.2 * k}" y="${by + 40}" font-size="26" text-anchor="middle" letter-spacing="2">SOLE (UNDERSIDE)</text>`);
  o.push(para(sxp, 1118, ['Leather sole studded with hobnails,', 'iron heel plate — standard for country', 'children’s boots; replaces the rubber-', 'looking lug sole of the v01 detail.'], 21, 1.26, 'fill="#4A433B"'));
  o.push(rule(60, 1570, 3012, 1570, 1.5));

  // ---- row 3: patch, apron bow, materials, layers ----
  const r3 = 1612;
  o.push(HEAD(60, r3, 'WEAR AND REPAIR'));
  const ps = 26;
  o.push(place(figure({ deg: 180, lw: 1 / ps, only: ['body'] }), 60 - 3.5 * ps, r3 + 24 + 43.6 * ps, ps, [3.5, 29.4, 16.5, 43.6]), frame(60, r3 + 24, 13 * ps, 14.2 * ps));
  o.push(para(60 + 13 * ps + 16, r3 + 52, ['Patch 6.5 × 6 cm, back of skirt,', 'wearer’s right, 34.5–40.5 cm above', 'ground. Lighter, more worn wool;', 'whip-stitched by hand.', '', 'Also: hem faded and slightly', 'uneven, elbows and cuff edges', 'rubbed paler, apron creased and', 'greyed at the lap, boot toes', 'scuffed. No holes, no dirt', 'streaks — poor but cared for.'], 21, 1.26));
  const mx = 800;
  o.push(rule(mx - 30, 1590, mx - 30, 1990, 1.2, 'opacity=".5"'), HEAD(mx, r3, 'MATERIALS'), T(mx + 220, r3, '— swatches are the v01 texture maps, unmodified', 22, 'fill="#4A433B"'));
  const sw = [['wool', 'Dress', 'wool twill, matte,', 'grey-brown', PAL.wool], ['patch', 'Patch', 'older wool,', 'worn paler', PAL.woolWorn], ['linen', 'Apron', 'unbleached linen,', 'plain weave', PAL.linen], ['collar', 'Collar, ribbons', 'cream cotton,', 'washed soft', PAL.collar],
    ['stocking', 'Stockings', 'hand-knit wool,', '2×2 rib', PAL.stocking], ['leather', 'Boots', 'waxed cowhide,', 'low sheen', PAL.leather], ['hair', 'Hair', 'fine, straight,', 'chestnut brown', PAL.hair]];
  sw.forEach(([n, name, l1, l2, hex], i) => {
    const x = mx + i * 172, y = r3 + 26, b = fs.readFileSync(path.join(V1, n + '.png')).toString('base64');
    o.push(`<image href="data:image/png;base64,${b}" x="${x}" y="${y}" width="150" height="150"/>`, frame(x, y, 150, 150), `<rect x="${x}" y="${y + 158}" width="150" height="26" fill="${hex}" stroke="#4A433B" stroke-width="1"/>`);
    o.push(T(x, y + 212, name, 22, 'font-weight="bold"'), T(x, y + 238, l1, 19.5, 'fill="#4A433B"'), T(x, y + 262, l2, 19.5, 'fill="#4A433B"'), T(x, y + 288, hex, 19, 'fill="#6A6157"'));
  });
  const extra = [['Skin', PAL.skin], ['Lips', PAL.lips], ['Iris', PAL.iris], ['Eye white', PAL.eyeWhite], ['Sole', PAL.sole], ['Horn', PAL.horn], ['Thread, laces', PAL.thread]];
  extra.forEach(([name, hex], i) => o.push(`<rect x="${mx + i * 172}" y="${r3 + 330}" width="40" height="40" fill="${hex}" stroke="#4A433B" stroke-width="1"/>`, T(mx + i * 172 + 48, r3 + 346, name, 19.5), T(mx + i * 172 + 48, r3 + 368, hex, 18, 'fill="#6A6157"')));
  const lx = 2050;
  o.push(rule(lx - 30, 1590, lx - 30, 1990, 1.2, 'opacity=".5"'), HEAD(lx, r3, 'LAYERS, SKIN OUTWARD'));
  o.push(para(lx, r3 + 44, ['1  Cotton shift (Hemd) — hidden.', '2  Buttoned under-bodice (Leibchen) with elastic straps that hold', '    the stockings — hidden; explains why the stockings do not slip.',
    '3  Hand-knit wool stockings, over the knee, grey-olive.', '4  Wool dress: front-buttoned bodice with pintucks, waist seam,', '    gathered skirt ending mid-calf, 3 cm let-down hem.',
    '5  Linen half apron tied in a bow at centre back, tails ≈ 15 cm.', '6  Ankle boots. No jewellery, no hat, no modern fastenings', '    (no zips, snaps or elastic visible anywhere).'], 21.5, 1.3));
  return sheet(3, 'COSTUME CONSTRUCTION AND MATERIALS', o.join('\n'));
}
