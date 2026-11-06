#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TEST_DIR="$(mktemp -d -t cafmoda-tray-runtime-test)"
trap 'sh scripts/build-native.sh; rm -rf "$TEST_DIR"' EXIT
sh scripts/build-native.sh
xcrun clang -dynamiclib -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa \
  native/tray-runtime-test.m -o native/tray-menu.dylib
/usr/bin/codesign --force --sign - native/tray-menu.dylib
cat > "$TEST_DIR/deno.json" <<'JSON'
{"desktop":{"app":{"name":"Cafmoda Tray Test","identifier":"dev.osim.cafmoda.tray-test"},"backend":"webview"}}
JSON
DENO_TLS_CA_STORE=system deno desktop --config "$TEST_DIR/deno.json" -A \
  --include native/tray-menu.dylib --include native/lid-brightness.dylib \
  --include icons/tray-00.png \
  -o "$TEST_DIR/CafmodaTrayTest" native/tray-runtime-test.ts
python3 - "$TEST_DIR" <<'PY'
import os, pathlib, subprocess, sys
folder = pathlib.Path(sys.argv[1])
environment = dict(os.environ, CAFMODA_TRAY_TEST_RESULT=str(folder / 'native-result.txt'))
result = subprocess.run([str(folder / 'CafmodaTrayTest.app/Contents/MacOS/laufey_webview')],
    env=environment, capture_output=True, text=True, timeout=25)
print(result.stdout, end='')
print(result.stderr, end='', file=sys.stderr)
assert result.returncode == 0, f'Runtime exited with {result.returncode}'
assert 'PASS: packaged Deno runtime' in result.stdout, 'Runtime did not confirm success'
PY
