import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {};
for (const [source, target] of [['believe_it_farm.html', 'believe_it_farm_v7.html'], ['believe_it_hands.html', 'believe_it_hands_v14.html']]) {
  const from = resolve(root, 'dist/browser', source), to = resolve(root, 'deliver', target);
  await copyFile(from, to, constants.COPYFILE_EXCL);
  const bytes = await readFile(to); files[`deliver/${target}`] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await mkdir(resolve(root, 'outputs/recovery'), { recursive: true });
await writeFile(resolve(root, 'outputs/recovery/release-manifest.json'), JSON.stringify({ date: '2026-11-07', files }, null, 2), { flag: 'wx' });
console.log(JSON.stringify(files));
