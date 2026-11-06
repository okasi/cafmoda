#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
TEST_DIR="$(mktemp -d -t cafmoda-tray-test)"
trap 'rm -rf "$TEST_DIR"' EXIT
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa \
  native/tray-menu-test.m -o "$TEST_DIR/tray-menu-test"
"$TEST_DIR/tray-menu-test"
xcrun clang -fblocks -Wall -Wextra -Werror \
  -framework CoreGraphics -framework CoreFoundation -framework IOKit \
  native/lid-brightness-test.c -o "$TEST_DIR/lid-brightness-test"
"$TEST_DIR/lid-brightness-test"
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa -framework IOKit \
  native/power-monitor-test.m -o "$TEST_DIR/power-monitor-test"
"$TEST_DIR/power-monitor-test"
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror -framework Cocoa -framework IOKit \
  native/power-monitor.m -o "$TEST_DIR/power-monitor"
python3 scripts/test-power-monitor.py "$TEST_DIR/power-monitor"
