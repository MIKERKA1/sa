import { readdir, readFile, mkdir, writeFile, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'qa/recovery');
await mkdir(out, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.npm-cache', '.git'].includes(item.name)) continue;
    const path = resolve(dir, item.name), name = relative(root, path).replaceAll('\\', '/');
    if (name === 'qa/recovery' || name === 'outputs/recovery') continue;
    if (item.isDirectory()) await walk(path);
    else { const bytes = await readFile(path); files.push({ path: name, bytes: bytes.length, sha256: digest(bytes) }); }
  }
}
await walk(root);
const baseline = JSON.parse(await readFile(resolve(root, '../baseline-before-night/hashes.json'), 'utf8'));
const old = new Map(baseline.map(f => [f.path.replaceAll('\\', '/'), f.hash.toLowerCase()]));
const current = new Map(files.map(f => [f.path, f.sha256]));
const changes = files.filter(f => f.path.startsWith('src/') && old.get(f.path) !== f.sha256)
  .map(f => ({ ...f, status: old.has(f.path) ? 'modified' : 'added' }));
const missing = [...old.keys()].filter(p => !current.has(p));
const groups = {};
for (const f of files) { const key = f.path.split('/')[0]; groups[key] ??= { files: 0, bytes: 0 }; groups[key].files++; groups[key].bytes += f.bytes; }
const inventory = { capturedAt: new Date().toISOString(), project: root, git: 'Absent in transferred working copy; no commit history available', groups, baselineChanges: changes, baselineMissing: missing, files };
// Exclusive creation prevents a later invocation from replacing the recovery baseline.
await writeFile(resolve(out, 'inventory-before.json'), JSON.stringify(inventory, null, 2), { flag: 'wx' });
for (const name of ['src', 'docs', 'tasks', 'package.json', 'package-lock.json', 'tools/build.mjs', 'dist/browser']) {
  const dest = resolve(out, 'before', name); await mkdir(dirname(dest), { recursive: true });
  await cp(resolve(root, name), dest, { recursive: true, errorOnExist: true, force: false });
}
console.log(JSON.stringify({ files: files.length, groups, changes: changes.map(f => ({ path: f.path, status: f.status })), missing }));
