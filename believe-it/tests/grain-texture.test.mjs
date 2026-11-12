import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LinearFilter, LinearMipmapLinearFilter, NearestFilter, RepeatWrapping } from 'three';
import { grain } from '../src/scenes/farm_tex.js';
import { hiOf } from '../src/engine/util.js';

// Captured from the unchanged v9 generator in qa/runtime-v10/grain-before.json.
// Exact pixels guard the grain count, random sequence, wrap seams, colour and alpha together.
const cases = [
  { mode: 'retro', size: 32, sha256: '098cba51f25d56b272557a4eb8be39fab6188310d3bfd1a9885da75dc9141e10',
    mag: NearestFilter, min: NearestFilter, mips: false },
  { mode: 'enh', size: 256, sha256: '92b2239d6f416c91a07ab6aff0d6a2df3d1873ae30a7dbf7aabd9b469c1edbe2',
    mag: LinearFilter, min: LinearMipmapLinearFilter, mips: true },
];
for (const c of cases) test(`${c.mode} grain retains v9 pixels and filtering`, () => {
  const lo = grain(), tex = c.mode === 'retro' ? lo : hiOf(lo);
  assert.deepEqual([tex.image.width, tex.image.height], [c.size, c.size]);
  assert.equal(createHash('sha256').update(tex.image.data).digest('hex'), c.sha256);
  assert.deepEqual([tex.magFilter, tex.minFilter, tex.wrapS, tex.wrapT, tex.generateMipmaps],
    [c.mag, c.min, RepeatWrapping, RepeatWrapping, c.mips]);
});
