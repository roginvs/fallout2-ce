#!/bin/bash
set -e

echo "=== Js prettier and checks ==="
(cd os/web && npx prettier -w .)
(cd os/web && npx -p typescript tsc)

echo "=== Release build ==="

docker run --rm --user $(id -u):$(id -g) -v $(pwd):$(pwd) -w $(pwd) \
  emscripten/emsdk:3.1.74 \
  sh -c 'mkdir -p build && cd build && 
        export SOURCE_MAP_BASE=https://fallout-nevada.ru/ &&
        export EM_CACHE=$(pwd)/build/emcache && 
        emcmake cmake -DCMAKE_BUILD_TYPE="Release" ../ && 
        emmake make VERBOSE=1 -j 8'

echo ""
echo ""
echo ""


echo "=== Deploy to server (dry run) ==="
cd build/web

RSYNC_ARGS=(
  -avz --progress --info=progress2
  -f '+ *.mjs' -f '+ *.css' -f '+ *.wasm' -f '+ *.wasm.map'
  -f '+ *.ico' -f '+ *.png' -f '+ *.js' -f '+ *.html' -f '+ manifest.json'
  -f '- *' --checksum ./ root@fallout-nevada.ru:/var/www/html/
)
rsync --dry-run "${RSYNC_ARGS[@]}"

read -rp "Proceed with real sync? [y/N] " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "Running real rsync..."
  rsync "${RSYNC_ARGS[@]}"
else
  echo "Aborted."
fi
