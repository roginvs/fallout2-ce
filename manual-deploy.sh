#!/bin/bash
set -e

export LC_TIME=en_US.UTF-8
export LANG=en_US.UTF-8

EMSDK_VERSION=$(./os/web/emsdk-version.sh)
echo "=== Emscripten version (from .github/workflows/ci-build-web.yml): $EMSDK_VERSION ==="

echo "=== Js prettier and checks ==="
(cd os/web && npx prettier -w .)
(cd os/web && npx -p typescript tsc)

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

echo "=== Deploy to server ==="


RSYNC_ARGS=(
  -avz --progress --info=progress2
  -f '+ *.mjs' -f '+ *.css' -f '+ *.wasm' -f '+ *.wasm.map'
  -f '+ *.ico' -f '+ *.png' -f '+ *.js' -f '+ *.html' -f '+ manifest.json'
  -f '- *' --checksum ./
)

flush_stdin() {
  while read -r -t 0.1 -n 10000 _discard; do :; done
}

RED=$'\e[1;31m'
RESET=$'\e[0m'

echo "=== Debug build (dry run): ==="
(cd build.debug/web && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)

flush_stdin
read -rp "Proceed with real sync for DEBUG (htmlbeta)? [y/N] " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "=== Debug build: real rsync ==="
  (cd build.debug/web && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/htmlbeta/)
else
  echo "Debug sync skipped."
fi

echo "=== Release build (dry run): ==="
(cd build/web       && rsync --dry-run "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)

flush_stdin
read -rp "${RED}Proceed with real sync for PRODUCTION (html)? [y/N]${RESET} " confirm
if [[ $confirm =~ ^[Yy]$ ]]; then
  echo "${RED}=== Release build: real rsync to PRODUCTION ===${RESET}"
  (cd build/web       && rsync "${RSYNC_ARGS[@]}" root@fallout-nevada.ru:/var/www/html/)
else
  echo "Production sync skipped."
fi
