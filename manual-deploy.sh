#!/bin/bash
set -e

export LC_TIME=en_US.UTF-8
export LANG=en_US.UTF-8

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

echo "=== Debug build ==="
docker run --rm --user $(id -u):$(id -g) -v $(pwd):$(pwd) -w $(pwd) \
  emscripten/emsdk:3.1.74 \
  sh -c 'mkdir -p build.debug && cd build.debug && 
        export SOURCE_MAP_BASE=https://fallout-nevada.ru/ &&
        export EM_CACHE=$(pwd)/build.debug/emcache && 
        emcmake cmake -DCMAKE_BUILD_TYPE="Debug" ../ && 
        emmake make VERBOSE=1 -j 8'

echo ""
echo ""
echo ""

echo "=== Deploy to server (dry run) ==="


RSYNC_ARGS=(
  -avz --progress --info=progress2
  -f '+ *.mjs' -f '+ *.css' -f '+ *.wasm' -f '+ *.wasm.map'
  -f '+ *.ico' -f '+ *.png' -f '+ *.js' -f '+ *.html' -f '+ manifest.json'
  -f '- *' --checksum ./
)

echo "=== Release build: ==="
(cd build/web       && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)
echo "=== Debug build: ==="
(cd build.debug/web && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)

read -rp "Proceed with real sync? [y/N] " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "Running real rsync..."
  echo "=== Release build: ==="
  (cd build/web       && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)
  echo "=== Debug build: ==="
  (cd build.debug/web && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)
else
  echo "Aborted."
fi
