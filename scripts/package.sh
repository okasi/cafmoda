#!/bin/sh
set -eu

# Build a drag-to-Applications disk image from the current source.
deno task check
deno task build
VERSION="$(deno eval 'console.log(JSON.parse(Deno.readTextFileSync("deno.json")).version)')"
ARCH="$(uname -m)"
STAGING="$(mktemp -d -t cafmoda-installer)"
trap 'rm -rf "$STAGING"' EXIT
ditto dist/Cafmoda.app "$STAGING/Cafmoda.app"
ln -s /Applications "$STAGING/Applications"
cat > "$STAGING/Install Cafmoda.txt" <<'TEXT'
Cafmoda — Keep Your Mac Awake

Drag Cafmoda.app onto Applications, then open Cafmoda from Applications.
The app appears in the macOS menu bar and includes its runtime.

This build is ad hoc signed and is not notarized by Apple.
macOS may block opening it. Only proceed if you trust this download.
See https://github.com/okasi/cafmoda for source, setup, and support.

Caffeinate needs no administrator access. Choose Enable power controls in the
menu for one-time administrator approval of Modafinilate and Low Power Mode.
Users upgrading from an older release need to run this setup again.

Cafmoda restores its saved power settings on quit, with independent crash
recovery. Turning Modafinilate off or choosing Turn Everything Off also allows
system/lid sleep and replaces a disabled battery sleep timer with 5 minutes.
Existing nonzero sleep timers are preserved. Keep-awake controls stop at 8%
battery or below and respect
user-enabled Low Power Mode. On battery with the lid closed, Cafmoda enables
Low Power Mode and restores the prior mode when the lid opens or power returns.

Choose Restore Normal Sleep if both controls are off but old settings still
prevent sleep. Automatic recovery and the battery cutoff release Cafmoda's own
controls, preserving external settings. Other apps can still prevent sleep.
Closed-lid operation depends on hardware and macOS
and is not verified on every supported configuration.
TEXT
OUTPUT="dist/Cafmoda-${VERSION}-macOS-${ARCH}.dmg"
hdiutil create -volname Cafmoda -srcfolder "$STAGING" -format UDZO -ov "$OUTPUT"
(cd dist && shasum -a 256 "Cafmoda-${VERSION}-macOS-${ARCH}.dmg" > SHA256SUMS.txt)
printf 'Installer: %s\n' "$OUTPUT"
