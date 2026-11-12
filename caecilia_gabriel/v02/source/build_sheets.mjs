// Builds the Caecilia Gabriel v02 concept plates as self-contained SVG files.
// Usage: node build_sheets.mjs   (no dependencies; reads the v01 material maps, never writes to v01)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PAL, M, figure } from './lib.mjs';
import { plate2, plate3 } from './plates.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const V1 = path.join(here, '..', '..', 'v01'), OUT = path.join(here, '..');
export const W = 3072, H = 2048, FONT = "FreeSerif, 'DejaVu Serif', Georgia, serif";

const tile = { wool: 5, linen: 4, collar: 4, stocking: 3, leather: 6, patch: 4 };
PAL.patch = PAL.woolWorn;
const b64 = (n) => fs.readFileSync(path.join(V1, n + '.png')).toString('base64');
const defs = () => `<defs>
${Object.entries(tile).map(([n, t]) => `<pattern id="m-${n}" patternUnits="userSpaceOnUse" width="${t}" height="${t}"><rect width="${t}" height="${t}" fill="${PAL[n]}"/><image href="data:image/png;base64,${b64(n)}" width="${t}" height="${t}" preserveAspectRatio="none" opacity=".55"/></pattern>`).join('\n')}
<linearGradient id="shadeH" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".30"/><stop offset=".3" stop-color="#000" stop-opacity="0"/><stop offset=".72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
<radialGradient id="faceShade" cx=".45" cy=".45" r=".62"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".65" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#8B5E4A" stop-opacity=".26"/></radialGradient>
<radialGradient id="blush"><stop offset="0" stop-color="#C47F6E" stop-opacity=".36"/><stop offset="1" stop-color="#C47F6E" stop-opacity="0"/></radialGradient>
</defs>`;

export const T = (x, y, s, size = 26, a = '') => `<text x="${x}" y="${y}" font-size="${size}" ${a}>${s}</text>`;
export const HEAD = (x, y, s) => T(x, y, s, 34, 'font-weight="bold" letter-spacing="1.5"');
export const rule = (x1, y1, x2, y2, w = 1.5, a = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4A433B" stroke-width="${w}" ${a}/>`;
// Place a cm-space drawing: (ox, oy) is where cm (0,0) lands, s is px per cm.
export const place = (svg, ox, oy, s, clip) => {
  if (!clip) return `<g transform="translate(${ox},${oy}) scale(${s},${-s})">${svg}</g>`;
  const id = 'clip' + Math.round(ox) + '_' + Math.round(oy) + '_' + Math.round(s * 10);
  return `<clipPath id="${id}"><rect x="${clip[0]}" y="${clip[1]}" width="${clip[2] - clip[0]}" height="${clip[3] - clip[1]}"/></clipPath><g transform="translate(${ox},${oy}) scale(${s},${-s})"><g clip-path="url(#${id})">${svg}</g></g>`;
};
export const callout = (x1, y1, x2, y2, text, size = 24, anchor = 'start') => {
  const lines = text.split('\n'), dx = anchor === 'start' ? 10 : -10;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#4A433B" stroke-width="1.3"/><circle cx="${x1}" cy="${y1}" r="3.5" fill="#4A433B"/>` +
    lines.map((l, i) => T(x2 + dx, y2 + 8 + i * size * 1.15, l, size, `text-anchor="${anchor}"`)).join('');
};
export function sheet(plateNo, subtitle, body) {
  const title = 'CAECILIA GABRIEL &#160;|&#160; BELIEVE IT &#160;|&#160; AGE 7 &#160;|&#160; LATE MARCH 1922';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}" fill="#2B2520">
${defs()}
<rect width="${W}" height="${H}" fill="${PAL.paper}"/>
${rule(60, 62, 560, 62, 2)}${rule(W - 560, 62, W - 60, 62, 2)}
<text x="${W / 2}" y="78" font-size="52" text-anchor="middle" letter-spacing="3">${title}</text>
<text x="${W / 2}" y="124" font-size="26" text-anchor="middle" letter-spacing="2" fill="#5A5148">CHARACTER CONCEPT v02 &#160;·&#160; PLATE ${plateNo}/3 &#160;·&#160; ${subtitle}</text>
${body}
<text x="${W - 60}" y="${H - 24}" font-size="20" text-anchor="end" fill="#6A6157">Develops caecilia_gabriel/v01 (concept-preview.webp + GLB). All views generated from one measurement set — see design-notes.md</text>
</svg>`;
}

function plate1() {
  const s = 13.6, gy = 1840, o = [], Y = (cm) => gy - cm * s;
  // height ruler and 10 cm guides
  o.push(rule(150, Y(0), 150, Y(124), 2));
  for (let h = 0; h <= 120; h += 5) {
    const major = h % 10 === 0;
    o.push(rule(150, Y(h), major ? 172 : 162, Y(h), major ? 2 : 1.2));
    if (major) o.push(T(138, Y(h) + 8, h + ' cm', 24, 'text-anchor="end"'), rule(172, Y(h), 2770, Y(h), 0.8, 'opacity=".22"'));
  }
  o.push(rule(150, Y(122), 172, Y(122), 2), T(138, Y(122) + 2, '122 cm', 24, 'text-anchor="end" font-weight="bold"'));
  o.push(rule(110, gy, 2770, gy, 2.2));
  const views = [[560, 0, 'FRONT'], [1235, 35, 'THREE-QUARTER (35°)'], [1830, 90, 'RIGHT SIDE'], [2420, 180, 'BACK']];
  // landmark levels
  const marks = [[M.crown, 'crown 122'], [M.eye, 'eye line 110'], [M.chin, 'chin 102'], [M.shoulder, 'shoulder point 95.4'], [M.waistTop, 'apron band 76.6–73.6'], [M.wrist, 'wrist 61.6'],
    [M.fingertip, 'fingertips 49'], [M.apronHem, 'apron hem 35.5'], [M.hem, 'dress hem 29'], [M.bootTop, 'boot top 12.3']];
  for (const [h, label] of marks) o.push(rule(172, Y(h), 2790, Y(h), 1.1, 'stroke-dasharray="7 7" opacity=".5"'), T(2802, Y(h) + 8, label, 23));
  for (const [x, deg, name] of views) {
    o.push(`<ellipse cx="${x}" cy="${gy + 6}" rx="${deg === 90 ? 190 : 250}" ry="11" fill="#000" opacity=".1"/>`);
    o.push(place(figure({ deg, lw: 1 / s }), x, gy, s));
    o.push(`<text x="${x}" y="${gy + 62}" font-size="32" text-anchor="middle" letter-spacing="2">${name}</text>`);
    o.push(rule(x, gy - 4, x, gy + 22, 1.2, 'opacity=".6"'));
  }
  o.push(T(150, 1968, 'Orthographic, no perspective. All four views share one scale (ruler at left) and one ground line. Neutral A-pose, arms abducted about 17°, palms toward the thighs.', 24, 'fill="#4A433B"'));
  o.push(T(150, 2000, 'Height 122 cm booted / 120 cm barefoot = 6.1 head heights (head 20 cm). Braids are a secondary-motion element; default rest is forward over the shoulders, bows at collar level.', 24, 'fill="#4A433B"'));
  return sheet(1, 'ORTHOGRAPHIC TURNAROUND', o.join('\n'));
}

const want = process.argv[2];
const plates = { 'plate-1-turnaround': plate1, 'plate-2-head-and-expressions': plate2, 'plate-3-costume-and-materials': plate3 };
for (const [name, fnp] of Object.entries(plates)) {
  if (want && !name.includes(want)) continue;
  fs.writeFileSync(path.join(OUT, name + '.svg'), fnp());
  console.log('wrote', name + '.svg');
}
