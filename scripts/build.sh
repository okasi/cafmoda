#!/bin/sh
set -eu
sh scripts/build-native.sh

# Package locally: Deno 2.9.7's --compress launcher targets Cafmoda instead of
# laufey_webview, and its outer bundle signing fails on macOS.
STAGING="$(mktemp -d -t cafmoda-build)"
trap 'rm -rf "$STAGING"' EXIT
deno desktop -A --no-check --include native/tray-menu.dylib \
  --include native/lid-brightness.dylib --include native/power-monitor -o "$STAGING/Cafmoda" main.ts
PAYLOAD_APP="$STAGING/Cafmoda.app"
PLIST="$PAYLOAD_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :CFBundleDisplayName string Cafmoda' "$PLIST"
/usr/bin/codesign --force --deep --sign - "$PAYLOAD_APP"

BUNDLE="$STAGING/packaged/Cafmoda.app"
mkdir -p "$BUNDLE/Contents/MacOS" "$BUNDLE/Contents/Resources"
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa \
  native/login-item.m -o "$BUNDLE/Contents/MacOS/cafmoda-anti-sleep"
cp "$PLIST" "$BUNDLE/Contents/Info.plist"
cp "$PAYLOAD_APP/Contents/Resources/AppIcon.icns" "$BUNDLE/Contents/Resources/"
# System tar handles xz on macOS; recipients need no extra decompressor.
/usr/bin/tar -cJf "$BUNDLE/Contents/Resources/payload.tar.xz" -C "$STAGING" Cafmoda.app
PAYLOAD_HASH="$(/usr/bin/shasum -a 256 "$BUNDLE/Contents/Resources/payload.tar.xz" | /usr/bin/awk '{print $1}')"
LAUNCHER="$BUNDLE/Contents/MacOS/laufey_webview"
printf '#!/bin/sh\nset -eu\nPAYLOAD_HASH="%s"\n' "$PAYLOAD_HASH" > "$LAUNCHER"
cat >> "$LAUNCHER" <<'EOF'
DIR="$(cd "$(dirname "$0")" && pwd)"
# Keep login startup pointed at the user's bundle across payload updates.
CAFMODA_APP_PATH="$(cd "$DIR/../.." && pwd)"
export CAFMODA_APP_PATH
DEST="$HOME/Library/Application Support/dev.osim.cafmoda/$PAYLOAD_HASH"
APP="$DEST/Cafmoda.app"
if [ ! -x "$APP/Contents/MacOS/laufey_webview" ]; then
  mkdir -p "$(dirname "$DEST")"
  EXTRACT="$(mktemp -d "${DEST}.XXXXXX")"
  trap 'rm -rf "$EXTRACT"' EXIT
  /usr/bin/tar -xf "$DIR/../Resources/payload.tar.xz" -C "$EXTRACT"
  # Publish the cache after decompression completes.
  if ! mv "$EXTRACT" "$DEST" 2>/dev/null; then
    [ -x "$APP/Contents/MacOS/laufey_webview" ] || exit 1
  fi
  rm -rf "$EXTRACT"
  trap - EXIT
fi
exec "$APP/Contents/MacOS/laufey_webview" "$@"
EOF
chmod +x "$LAUNCHER"
/usr/bin/codesign --force --deep --sign - "$BUNDLE"
/usr/bin/codesign --verify --deep --strict "$BUNDLE"
mkdir -p dist
rm -rf dist/Cafmoda.app
mv "$BUNDLE" dist/Cafmoda.app
BUNDLE="dist/Cafmoda.app"
printf 'Built %s\n' "$BUNDLE"
