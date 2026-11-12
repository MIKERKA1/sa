// Preserve the verified v10 state before fixing access to the pantry bolt.
import { readdir, readFile, writeFile, mkdir, copyFile, stat, access } from 'node:fs/promises';
import { createReadStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'qa/door-access-v11');
try { await access(output); throw new Error('Snapshot already exists; do not overwrite it.'); }
catch (e) { if (e.code !== 'ENOENT') throw e; }
const hash = async file => {
  const h = createHash('sha256');
  for await (const part of createReadStream(file)) h.update(part);
  return h.digest('hex');
};
async function inventory(base, excluded = []) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['node_modules', '.npm-cache', '.git'].includes(entry.name)) continue;
      const full = resolve(dir, entry.name), path = relative(base, full).split(sep).join('/');
      if (excluded.includes(path)) continue;
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        const info = await stat(full);
        files.push({ path, bytes: info.size, modifiedUtc: info.mtime.toISOString(), sha256: await hash(full) });
      } else throw new Error('Unexpected filesystem entry: ' + full);
    }
  }
  await visit(base);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
const release = JSON.parse(await readFile(resolve(root, 'outputs/runtime-v10/release-manifest.json'), 'utf8'));
const mismatches = [];
for (const [name, info] of Object.entries(release.files)) {
  const full = resolve(root, name);
  if (!full.startsWith(root + sep)) throw new Error('Manifest path outside project: ' + name);
  if ((await stat(full)).size !== info.bytes || await hash(full) !== info.sha256) mismatches.push(name);
}
const archive = JSON.parse(await readFile(resolve(root, 'outputs/runtime-v10/archive-manifest.json'), 'utf8'));
const releaseChecks = {
  manifestFiles: Object.keys(release.files).length,
  mismatches,
  archiveMatches: await hash(resolve(root, 'outputs/runtime-v10', archive.file)) === archive.sha256,
  distMatchesFarmV10: await hash(resolve(root, 'dist/browser/believe_it_farm.html')) === await hash(resolve(root, 'deliver/believe_it_farm_v10.html')),
  distMatchesViewerV14: await hash(resolve(root, 'dist/browser/believe_it_hands.html')) === await hash(resolve(root, 'deliver/believe_it_hands_v14.html')),
};
if (mismatches.length || !releaseChecks.archiveMatches || !releaseChecks.distMatchesFarmV10 || !releaseChecks.distMatchesViewerV14) {
  throw new Error('Current version needs review before changes: ' + JSON.stringify(releaseChecks));
}
const files = await inventory(root, ['qa/door-access-v11', 'outputs/door-access-v11']);
const previous = JSON.parse(await readFile(resolve(root, 'qa/runtime-v10/inventory-before.json'), 'utf8'));
const neighbors = {}, neighborChecks = {};
for (const [name, oldFiles] of Object.entries(previous.neighbors)) {
  const base = name === '../../outputs' ? resolve(root, name) : resolve(root, '..', name);
  const current = await inventory(base), actual = new Map(current.map(f => [f.path, f]));
  neighbors[name] = current;
  neighborChecks[name] = current.length === oldFiles.length && oldFiles.every(f => actual.get(f.path)?.sha256 === f.sha256);
}
if (!Object.values(neighborChecks).every(Boolean)) throw new Error('Historical neighbor mismatch: ' + JSON.stringify(neighborChecks));
await mkdir(resolve(output, 'before'), { recursive: true });
const snapshotRoots = ['src', 'docs', 'tasks', 'tests', 'tools', 'dist/browser', 'README.md', 'README_HANDOFF.md', 'CODEX_HANDOFF.md', 'package.json', 'package-lock.json', 'build.sh', 'build_farm.sh', 'build_intro.py'];
const snapshot = files.filter(f => snapshotRoots.some(p => f.path === p || f.path.startsWith(p + '/')));
for (const file of snapshot) {
  const dest = resolve(output, 'before', file.path);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(resolve(root, file.path), dest, constants.COPYFILE_EXCL);
  if (await hash(dest) !== file.sha256) throw new Error('Snapshot mismatch: ' + file.path);
}
await writeFile(resolve(output, 'inventory-before.json'), JSON.stringify({
  capturedAt: new Date().toISOString(), root, git: 'No .git in this checkout or its parents',
  release: releaseChecks, files, snapshotPaths: snapshot.map(f => f.path), neighbors, neighborChecks,
  nextTask: {
    sourceThread: '01a1b69b-a3a8-7213-81cd-de05670a8095',
    sourceTurn: '01a1b797-821d-77a3-8bd3-765071054609',
    message: 'заметил одну штуку, что с хлева ты можешь открыть дверь в кладовую, но дверь в кладовой закрыта засовом',
    status: 'User report after the completed v10 release; the response failed before any fix.',
  },
}, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ release: releaseChecks, projectFiles: files.length, snapshotFiles: snapshot.length,
  neighborFiles: Object.values(neighbors).reduce((n, f) => n + f.length, 0), neighborChecks, output }));
