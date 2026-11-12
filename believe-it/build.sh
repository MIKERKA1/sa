#!/bin/bash
set -e
cd /data/fears_game
mkdir -p dist
/vercel/sandbox/node_modules/.bin/esbuild src/viewer/main.js --bundle --minify --format=esm --target=es2022 --outfile=dist/app.js --log-level=warning
python3 - <<'PY'
tpl = open('src/viewer/index.html', encoding='utf-8').read()
js = open('dist/app.js', encoding='utf-8').read().replace('</script', '<\\/script')
open('dist/believe_it_hands_v1.html', 'w', encoding='utf-8').write(tpl.replace('/*__BUNDLE__*/', js))
PY
ls -la dist | grep html
