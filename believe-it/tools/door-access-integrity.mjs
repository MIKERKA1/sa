// Audit the v11 fix without rewriting earlier releases, QA, snapshots or neighbors.
import { readdir, readFile, writeFile, access, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'qa/door-access-v11/integrity-final.json');
try { await access(out); throw new Error('Use a new output file: ' + out); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const initial = JSON.parse(await readFile(resolve(root, 'qa/door-access-v11/inventory-before.json'), 'utf8'));
async function inventory(base, excluded = []) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', '.npm-cache'].includes(entry.name)) continue;
      const full = resolve(dir, entry.name), path = relative(base, full).split(sep).join('/');
      if (excluded.includes(path)) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        const hash = createHash('sha256');
        for await (const chunk of createReadStream(full)) hash.update(chunk);
        files.push({ path, bytes: (await stat(full)).size, sha256: hash.digest('hex') });
      } else throw new Error('Unexpected filesystem entry: ' + full);
    }
  }
  await visit(base);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function compare(before, after) {
  const a = new Map(before.map(f => [f.path, f])), b = new Map(after.map(f => [f.path, f]));
  return { before: before.length, after: after.length,
    missing: before.filter(f => !b.has(f.path)).map(f => f.path),
    changed: before.filter(f => b.has(f.path) && (b.get(f.path).sha256 !== f.sha256 || b.get(f.path).bytes !== f.bytes)).map(f => f.path),
    added: after.filter(f => !a.has(f.path)).map(f => f.path) };
}
const unchanged = r => !r.missing.length && !r.changed.length && !r.added.length;
const current = await inventory(root, ['qa/door-access-v11', 'outputs/door-access-v11']);
const project = compare(initial.files, current), actual = new Map(current.map(f => [f.path, f]));
const changedAllowed = new Set([
  'src/farm/main.js', 'src/scenes/farm.js', 'src/scenes/farm_house.js',
  'dist/browser/believe_it_farm.html', 'tools/recovery-interactions.cjs', 'tools/environment-routes.cjs',
  'README.md', 'CODEX_HANDOFF.md', 'tasks/plan.md', 'tasks/todo.md',
]);
const addedAllowed = new Set([
  'deliver/believe_it_farm_v11.html', 'tools/door-access-regression.cjs',
  'tools/door-access-integrity.mjs', 'tools/door-access-package.py',
]);
project.unexpectedChanges = project.changed.filter(p => !changedAllowed.has(p));
project.unexpectedAdditions = project.added.filter(p => !addedAllowed.has(p));
const snapshot = compare(initial.files.filter(f => initial.snapshotPaths.includes(f.path)),
  await inventory(resolve(root, 'qa/door-access-v11/before')));
const neighbors = {};
for (const [name, files] of Object.entries(initial.neighbors)) {
  const base = name === '../../outputs' ? resolve(root, name) : resolve(root, '..', name);
  neighbors[name] = compare(files, await inventory(base));
}
const same = (a, b) => !!actual.get(a)?.sha256 && actual.get(a)?.sha256 === actual.get(b)?.sha256;
const sourceChanges = project.changed.filter(p => p.startsWith('src/')).sort();
const checks = {
  noOriginalFilesRemoved: !project.missing.length,
  onlyIntentionalChanges: !project.unexpectedChanges.length && !project.unexpectedAdditions.length,
  snapshotUnchanged: unchanged(snapshot),
  neighborsUnchanged: Object.values(neighbors).every(unchanged),
  onlyThreeProductionSourcesChanged: JSON.stringify(sourceChanges) === JSON.stringify(['src/farm/main.js', 'src/scenes/farm.js', 'src/scenes/farm_house.js']),
  farmReleaseMatchesDist: same('deliver/believe_it_farm_v11.html', 'dist/browser/believe_it_farm.html'),
  viewerStillV14: same('deliver/believe_it_hands_v14.html', 'dist/browser/believe_it_hands.html'),
};
const report = { capturedAt: new Date().toISOString(), checks, pass: Object.values(checks).every(Boolean),
  sourceChanges, project, snapshot, neighbors, farmSha256: actual.get('deliver/believe_it_farm_v11.html')?.sha256 };
await writeFile(out, JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, checks, changed: project.changed, added: project.added,
  originalFiles: initial.files.length, snapshotFiles: snapshot.before,
  neighborFiles: Object.values(neighbors).reduce((n, r) => n + r.before, 0) }));
if (!report.pass) process.exitCode = 1;
