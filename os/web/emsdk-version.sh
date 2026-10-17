#!/bin/sh
# Prints the Emscripten version used by CI. Single source of truth:
# .github/workflows/ci-build-web.yml, `EMSDK_VERSION: x.y.z` under `env:`.
# Fallback (older CI file): the literal in `./emsdk install x.y.z`, with a warning.
# Exits non-zero with a message if no version is found.
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CI="$ROOT/.github/workflows/ci-build-web.yml"
if [ ! -f "$CI" ]; then
    echo "emsdk-version.sh: $CI not found" >&2
    exit 1
fi
V=$(sed -n 's/^[[:space:]]*EMSDK_VERSION:[[:space:]]*\([0-9][0-9.]*\).*/\1/p' "$CI" | head -n 1)
if [ -z "$V" ]; then
    V=$(sed -n 's/.*emsdk install[[:space:]]\{1,\}\([0-9][0-9.]*\).*/\1/p' "$CI" | head -n 1)
    if [ -n "$V" ]; then
        echo "emsdk-version.sh: WARNING: no EMSDK_VERSION in $CI, using 'emsdk install $V'" >&2
    fi
fi
if [ -z "$V" ]; then
    echo "emsdk-version.sh: Emscripten version not found in $CI" >&2
    exit 1
fi
echo "$V"
