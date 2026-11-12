import { readdir, readFile, mkdir, writeFile, cp, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'qa/runtime-v10');
await mkdir(out); // A second invocation must not replace the v9 snapshot.
const hashFile = async path => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
async function inventory(base, excluded = []) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.npm-cache'].includes(entry.name)) continue;
      const path = resolve(dir, entry.name), name = relative(base, path).split(sep).join('/');
      if (excluded.includes(name)) continue;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) files.push({ path: name, bytes: (await stat(path)).size, sha256: await hashFile(path) });
      else throw new Error(`Unexpected filesystem entry, inspect before continuing: ${path}`);
    }
  }
  await visit(base);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

const files = await inventory(root, ['qa/runtime-v10', 'outputs/runtime-v10']);
const byPath = new Map(files.map(f => [f.path, f]));
const manifest = JSON.parse(await readFile(resolve(root, 'outputs/environment-v9/release-manifest.json'), 'utf8'));
const mismatches = Object.entries(manifest.files).filter(([p, f]) => byPath.get(p)?.sha256 !== f.sha256).map(([p]) => p);
const archive = JSON.parse(await readFile(resolve(root, 'outputs/environment-v9/archive-manifest.json'), 'utf8'));
const archiveMatches = byPath.get(`outputs/environment-v9/${archive.file}`)?.sha256 === archive.sha256;
const sourceChangesFromV8 = [];
for (const f of files.filter(f => f.path.startsWith('src/'))) {
  if (f.sha256 !== await hashFile(resolve(root, 'qa/environment-v9/before', f.path))) sourceChangesFromV8.push(f.path);
}
const neighbors = {};
for (const name of ['believe-it-qa', 'believe-it-qa-all', 'baseline-before-night', 'hardware-baseline',
  'hardware-final-probe', 'hardware-fine-probe', 'hardware-final', 'hardware-removal-check', 'night-first', 'night-second']) {
  neighbors[name] = await inventory(resolve(root, '..', name));
}
neighbors['../../outputs'] = await inventory(resolve(root, '../../outputs'));
const groups = {};
for (const f of files) {
  const group = f.path.includes('/') ? f.path.split('/')[0] : '(root)';
  groups[group] ??= { files: 0, bytes: 0 }; groups[group].files++; groups[group].bytes += f.bytes;
}
const report = { capturedAt: new Date().toISOString(), root, git: 'No .git in this checkout or its parents; no commits/staging available',
  release: { farm: 'v9', viewer: 'v14', checkedManifestFiles: Object.keys(manifest.files).length, mismatches, archiveMatches,
    distMatchesFarmV9: byPath.get('dist/browser/believe_it_farm.html').sha256 === byPath.get('deliver/believe_it_farm_v9.html').sha256,
    distMatchesViewerV14: byPath.get('dist/browser/believe_it_hands.html').sha256 === byPath.get('deliver/believe_it_hands_v14.html').sha256,
    sourceChangesFromV8 }, groups, files, neighbors };
await writeFile(resolve(out, 'inventory-before.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
if (mismatches.length || !archiveMatches || !report.release.distMatchesFarmV9 || !report.release.distMatchesViewerV14) {
  throw new Error('The v9 release is inconsistent. Stop before modifying production sources.');
}
for (const name of ['src', 'docs', 'tasks', 'README.md', 'CODEX_HANDOFF.md', 'package.json', 'package-lock.json', 'tools', 'dist/browser']) {
  const dest = resolve(out, 'before', name);
  await mkdir(dirname(dest), { recursive: true });
  await cp(resolve(root, name), dest, { recursive: true, errorOnExist: true, force: false });
}
console.log(JSON.stringify({ out, release: report.release, groups,
  neighbors: Object.fromEntries(Object.entries(neighbors).map(([n, fs]) => [n, fs.length])) }));
