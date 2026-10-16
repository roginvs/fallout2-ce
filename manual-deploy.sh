#!/bin/bash
set -e

export LC_TIME=en_US.UTF-8
export LANG=en_US.UTF-8

EMSDK_VERSION=$(./os/web/emsdk-version.sh)
echo "=== Emscripten version (from .github/workflows/ci-build-web.yml): $EMSDK_VERSION ==="


read -rp "Check prettier and typescript? [y/N] " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "=== Js prettier and checks ==="
  (cd os/web && npx prettier -w .)
  (cd os/web && npx -p typescript tsc)
fi


echo "=== Debug build ==="
docker run --rm --user $(id -u):$(id -g) -v $(pwd):$(pwd) -w $(pwd) \
  "emscripten/emsdk:$EMSDK_VERSION" \
  sh -c 'mkdir -p build.debug && cd build.debug && 
        export SOURCE_MAP_BASE=https://fallout-nevada.ru/ &&
        export EM_CACHE=$(pwd)/emcache && 
        emcmake cmake -DCMAKE_BUILD_TYPE="Debug" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ../ && 
        emmake make VERBOSE=1 -j 8'

echo ""
echo ""
echo ""

echo "=== Release build ==="
docker run --rm --user $(id -u):$(id -g) -v $(pwd):$(pwd) -w $(pwd) \
  "emscripten/emsdk:$EMSDK_VERSION" \
  sh -c 'mkdir -p build && cd build && 
        export SOURCE_MAP_BASE=https://fallout-nevada.ru/ &&
        export EM_CACHE=$(pwd)/emcache && 
        emcmake cmake -DCMAKE_BUILD_TYPE="Release" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON ../ && 
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

echo "=== Debug build: ==="
(cd build.debug/web && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)

echo "=== Release build: ==="
(cd build/web       && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)


read -rp "Proceed with real sync for debug build? [y/N] " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "=== Debug build: ==="
  (cd build.debug/web && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)
else
  echo "Aborted."
  exit 1
fi


flush_stdin() {
  while read -r -t 0.1 -n 10000 _discard; do :; done
}

RED=$'\e[1;31m'
RESET=$'\e[0m'


flush_stdin
read -rp "${RED}Proceed with real sync for PRODUCTION (html)? [y/N]${RESET} " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "Running real rsync..."
  echo "=== Release build: ==="
  (cd build/web       && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)
else
  echo "Aborted."
  exit 1
fi
