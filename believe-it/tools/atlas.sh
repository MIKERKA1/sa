#!/bin/bash
cd /data/fears_game && /vercel/sandbox/node_modules/.bin/esbuild tools/atlas.mjs --bundle --platform=node --format=esm --external:sharp --outfile=/tmp/atlas_b.mjs --log-level=error && cp /tmp/atlas_b.mjs tools/.atlas_b.mjs && node tools/.atlas_b.mjs "$@"
