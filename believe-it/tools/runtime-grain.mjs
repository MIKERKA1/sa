// Measure the real retro/enhanced generator and save its approved pixel fingerprints.
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const before = process.argv.includes('--baseline');
const base = before ? resolve(root, 'qa/runtime-v10/before') : root;
const out = resolve(root, process.argv[2] || 'qa/runtime-v10/grain-before.json');
try { await access(out); throw new Error('Use a new output file: ' + out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const { grain } = await import(pathToFileURL(resolve(base, 'src/scenes/farm_tex.js')));
const { hiOf } = await import(pathToFileURL(resolve(base, 'src/engine/util.js')));
const samples = [];
for (const mode of ['retro', 'enh']) for (let run = 1; run <= 3; run++) {
  const start = performance.now(), lo = grain(), tex = mode === 'retro' ? lo : hiOf(lo), ms = performance.now() - start;
  const { width, height, data } = tex.image;
  samples.push({ mode, run, ms, width, height, bytes: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'), magFilter: tex.magFilter,
    minFilter: tex.minFilter, wrapS: tex.wrapS, wrapT: tex.wrapT, generateMipmaps: tex.generateMipmaps });
}
const report = { baseline: before, sourceSha256: createHash('sha256').update(await readFile(resolve(base, 'src/scenes/farm_tex.js'))).digest('hex'), samples };
await mkdir(dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, samples }));
