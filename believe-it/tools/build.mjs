import { build } from 'esbuild';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Explicit module loading avoids native directory scans outside this project.
// https://esbuild.github.io/plugins/#on-resolve-callbacks
const projectFiles = {
  name: 'project-files',
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, async args => {
      const candidate = isAbsolute(args.path) ? args.path
        : args.path.startsWith('.') ? resolve(dirname(args.importer), args.path)
        : fileURLToPath(import.meta.resolve(args.path));
      const path = await realpath(candidate);
      if (!path.startsWith(root + sep)) throw new Error(`Import outside project: ${args.path}`);
      return { path, namespace: 'project' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'project' }, async args => ({
      contents: await readFile(args.path, 'utf8'),
      loader: 'js',
    }));
  },
};
const requested = process.argv[2] || 'all';
const targets = {
  farm: { entry: 'src/farm/main.js', template: 'src/farm/index.html', file: 'believe_it_farm.html' },
  viewer: { entry: 'src/viewer/main.js', template: 'src/viewer/index.html', file: 'believe_it_hands.html' },
  character: { entry: 'src/character/main.js', template: 'src/character/index.html', file: 'believe_it_caecilia.html' },
  viktoria: { entry: 'src/character_viktoria/main.js', template: 'src/character_viktoria/index.html', file: 'believe_it_viktoria.html' },
  'caecilia-gabriel': { entry: 'src/character_caecilia_gabriel/main.js', template: 'src/character_caecilia_gabriel/index.html', file: 'believe_it_caecilia_gabriel.html' },
};
if (requested !== 'all' && !targets[requested]) {
  console.error('Usage: node tools/build.mjs [all|farm|viewer|character|viktoria|caecilia-gabriel] [output-directory]');
  process.exit(1);
}
const outputDir = resolve(root, process.argv[3] || 'dist/browser');
await mkdir(outputDir, { recursive: true });

for (const name of requested === 'all' ? Object.keys(targets) : [requested]) {
  const target = targets[name];
  const template = await readFile(resolve(root, target.template), 'utf8');
  if (template.split('/*__BUNDLE__*/').length !== 2) {
    throw new Error(`${target.template}: expected exactly one bundle placeholder`);
  }
  // https://esbuild.github.io/api/#build and #write
  const result = await build({
    absWorkingDir: root,
    entryPoints: [resolve(root, target.entry)],
    tsconfigRaw: { compilerOptions: {} },
    plugins: [projectFiles],
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'warning',
  });
  const javascript = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = template.replace('/*__BUNDLE__*/', () => javascript);
  const output = resolve(outputDir, target.file);
  await writeFile(output, html, 'utf8');
  console.log(`${name}: ${output} (${(Buffer.byteLength(html) / 1e6).toFixed(2)} MB)`);
}
