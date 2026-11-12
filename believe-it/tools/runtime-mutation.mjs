// Confirm the pixel tests reject a broken grain boundary, then restore only our temporary edit.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'qa/runtime-v10/mutation');
await mkdir(out);
const file = resolve(root, 'src/scenes/farm_tex.js'), original = await readFile(file, 'utf8');
const marker = 'if (e >= 1) continue;';
if (original.split(marker).length !== 2) throw new Error('Unexpected grain source, inspect before mutation');
const mutated = original.replace(marker, 'if (e < 1) continue;');
await writeFile(resolve(out, 'farm_tex-before.js'), original, { flag: 'wx' });
let result;
try {
  await writeFile(file, mutated);
  result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/grain-texture.test.mjs'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  await writeFile(resolve(out, 'mutant-tests.log'), (result.stdout || '') + (result.stderr || ''), { flag: 'wx' });
} finally {
  if (await readFile(file, 'utf8') !== mutated) throw new Error('Concurrent source edit detected; do not overwrite it.');
  await writeFile(file, original);
}
if (result.error) throw result.error;
const restored = spawnSync(process.execPath, ['--test', '--test-reporter=tap', 'tests/grain-texture.test.mjs'],
  { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
await writeFile(resolve(out, 'restored-tests.log'), (restored.stdout || '') + (restored.stderr || ''), { flag: 'wx' });
const report = { mutantExitCode: result.status, restoredExitCode: restored.status,
  sourceRestored: await readFile(file, 'utf8') === original,
  sourceSha256: createHash('sha256').update(original).digest('hex') };
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report));
if (result.status === 0 || restored.status !== 0 || !report.sourceRestored) process.exitCode = 1;
