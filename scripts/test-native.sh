#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TEST_DIR="$(mktemp -d -t cafmoda-tray-test)"
trap 'rm -rf "$TEST_DIR"' EXIT
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa \
  native/tray-menu-test.m -o "$TEST_DIR/tray-menu-test"
"$TEST_DIR/tray-menu-test"
