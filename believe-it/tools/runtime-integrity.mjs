// Verify preserved files and read-only neighbors against the initial streamed SHA inventory.
import { readdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'qa/runtime-v10/integrity-release.json');
try { await access(out); throw new Error('Use a new output file: ' + out); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const initial = JSON.parse(await readFile(resolve(root, 'qa/runtime-v10/inventory-before.json'), 'utf8'));
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
      else throw new Error('Unexpected filesystem entry: ' + path);
    }
  }
  await visit(base);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function compare(before, after) {
  const a = new Map(before.map(f => [f.path, f])), b = new Map(after.map(f => [f.path, f]));
  return { filesBefore: before.length, filesAfter: after.length,
    missing: before.filter(f => !b.has(f.path)).map(f => f.path),
    changed: before.filter(f => b.has(f.path) && (b.get(f.path).sha256 !== f.sha256 || b.get(f.path).bytes !== f.bytes)).map(f => f.path),
    added: after.filter(f => !a.has(f.path)).map(f => f.path) };
}
const current = await inventory(root, ['qa/runtime-v10', 'outputs/runtime-v10']);
const actual = new Map(current.map(f => [f.path, f]));
const project = compare(initial.files, current);
const snapshotNames = ['src', 'docs', 'tasks', 'tools', 'dist/browser', 'README.md', 'CODEX_HANDOFF.md', 'package.json', 'package-lock.json'];
const snapshotExpected = initial.files.filter(f => snapshotNames.some(n => f.path === n || f.path.startsWith(n + '/')));
const baselineSnapshot = compare(snapshotExpected, await inventory(resolve(root, 'qa/runtime-v10/before')));
const allowedChanges = new Set(['src/farm/main.js', 'src/scenes/farm_tex.js', 'dist/browser/believe_it_farm.html',
  'README.md', 'CODEX_HANDOFF.md', 'tasks/plan.md', 'tasks/todo.md', 'tools/runtime-startup.cjs']);
const allowedAdditions = new Set(['deliver/believe_it_farm_v10.html', 'tests/grain-texture.test.mjs',
  'tools/runtime-startup.cjs', 'tools/runtime-diagnostic.mjs', 'tools/runtime-grain.mjs', 'tools/runtime-mutation.mjs',
  'tools/runtime-walk.cjs', 'tools/runtime-compare.py', 'tools/runtime-visual.cjs', 'tools/runtime-visual-stats.py',
  'tools/runtime-integrity.mjs', 'tools/runtime-package.py']);
project.unexpectedChanges = project.changed.filter(p => !allowedChanges.has(p));
project.unexpectedAdditions = project.added.filter(p => !allowedAdditions.has(p));
const neighbors = {};
for (const [name, files] of Object.entries(initial.neighbors)) {
  // The historical outputs label is relative to root, while the other labels are siblings.
  const base = name === '../../outputs' ? resolve(root, name) : resolve(root, '..', name);
  neighbors[name] = compare(files, await inventory(base));
}
const sourceChanges = project.changed.filter(p => p.startsWith('src/')).sort();
const sourcesExpected = JSON.stringify(sourceChanges) === JSON.stringify(['src/farm/main.js', 'src/scenes/farm_tex.js']);
const farmHash = actual.get('deliver/believe_it_farm_v10.html')?.sha256;
const sameFarmBuild = !!farmHash && actual.get('dist/browser/believe_it_farm.html')?.sha256 === farmHash;
const viewerHash = actual.get('deliver/believe_it_hands_v14.html')?.sha256;
const sameViewerBuild = !!viewerHash && actual.get('dist/browser/believe_it_hands.html')?.sha256 === viewerHash;
const checks = {
  noPreservedFilesRemoved: project.missing.length === 0,
  baselineSnapshotUnchanged: !baselineSnapshot.missing.length && !baselineSnapshot.changed.length && !baselineSnapshot.added.length,
  onlyIntentionalProjectChanges: project.unexpectedChanges.length === 0 && project.unexpectedAdditions.length === 0,
  onlyTwoProductionSourcesChanged: sourcesExpected,
  neighborsUnchanged: Object.values(neighbors).every(n => !n.missing.length && !n.changed.length && !n.added.length),
  issuedFarmMatchesDist: sameFarmBuild, viewerBuildMatchesV14: sameViewerBuild,
};
const report = { capturedAt: new Date().toISOString(), initialInventory: 'qa/runtime-v10/inventory-before.json',
  project, baselineSnapshot, sourceChanges, neighbors, farmSha256: farmHash, checks, pass: Object.values(checks).every(Boolean) };
await writeFile(out, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, checks, changed: project.changed, added: project.added,
  projectFiles: project.filesBefore, neighborFiles: Object.values(neighbors).reduce((n, r) => n + r.filesBefore, 0) }));
if (!report.pass) process.exitCode = 1;
