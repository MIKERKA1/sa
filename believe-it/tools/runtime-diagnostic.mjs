// Diagnostic-only bundle with readable CPU stacks and phase marks. Production sources stay untouched.
import { build } from 'esbuild';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, process.argv[2] || 'qa/runtime-v10/diagnostic-before');
const precompile = process.argv.includes('--precompile');
await mkdir(out);
function replaceOnce(source, old, next) {
  if (source.split(old).length !== 2) throw new Error(`Diagnostic marker missing or repeated: ${old}`);
  return source.replace(old, () => next);
}
const phases = `
const runtimePhase = (name, fn) => {
  performance.mark(name + ':start');
  try { return fn(); } finally { performance.measure(name, name + ':start'); }
};
performance.mark('module:start');
`;
const plugin = {
  name: 'runtime-diagnostic',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, async args => {
      const candidate = isAbsolute(args.path) ? args.path
        : args.path.startsWith('.') ? resolve(dirname(args.importer), args.path)
        : fileURLToPath(import.meta.resolve(args.path));
      const path = await realpath(candidate);
      if (!path.startsWith(root + sep)) throw new Error(`Import outside project: ${args.path}`);
      return { path, namespace: 'project' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'project' }, async args => {
      let contents = await readFile(args.path, 'utf8');
      if (args.path === resolve(root, 'src/farm/main.js')) {
        contents = replaceOnce(contents, 'THREE.ColorManagement.enabled = false;', 'THREE.ColorManagement.enabled = false;' + phases);
        contents = replaceOnce(contents, 'await loadPhotos();', "performance.mark('photo-decode:start'); await loadPhotos(); performance.measure('photo-decode', 'photo-decode:start');");
        contents = replaceOnce(contents, 'const farm = createFarm();', "const farm = runtimePhase('create-farm', createFarm);");
        contents = replaceOnce(contents, 'const vm = createViewmodel();', "const vm = runtimePhase('create-viewmodel', createViewmodel);");
        contents = replaceOnce(contents, "setQuality(GFX.enh ? 'enh' : 'retro');", "runtimePhase('initial-quality', () => setQuality(GFX.enh ? 'enh' : 'retro'));");
        contents = replaceOnce(contents, 'if (++S.frames === 4) window.__ready = true;', "if (++S.frames === 4) { performance.measure('module-to-ready', 'module:start'); performance.measure('first-four-frames', 'first-frame:start'); window.__ready = true; }");
        contents = replaceOnce(contents, 'function frame(now) {', "function frame(now) { if (S.frames === 0) performance.mark('first-frame:start');");
        if (precompile) contents = replaceOnce(contents, 'requestAnimationFrame(frame);\n\nif (DEV)',
          "performance.mark('shader-precompile:start'); await renderer.compileAsync(scene, cam); performance.measure('shader-precompile', 'shader-precompile:start');\nrequestAnimationFrame(frame);\n\nif (DEV)");
      }
      return { contents, loader: 'js' };
    });
  },
};
// Same esbuild API and project boundary as tools/build.mjs; readable names are for diagnosis only.
const result = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'src/farm/main.js')],
  tsconfigRaw: { compilerOptions: {} }, plugins: [plugin], bundle: true, minify: false,
  format: 'esm', platform: 'browser', target: 'es2022', write: false, metafile: true, logLevel: 'warning' });
const template = await readFile(resolve(root, 'src/farm/index.html'), 'utf8');
const html = replaceOnce(template, '/*__BUNDLE__*/', result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await writeFile(resolve(out, 'believe_it_farm.html'), html, { flag: 'wx' });
await writeFile(resolve(out, 'module-graph.json'), JSON.stringify(result.metafile, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ out, precompile, bytes: Buffer.byteLength(html), modules: Object.keys(result.metafile.inputs).length,
  projectSources: Object.keys(result.metafile.inputs).map(p => relative(root, p.replace(/^project:/, '')).split(sep).join('/')).filter(p => p.startsWith('src/')) }));
