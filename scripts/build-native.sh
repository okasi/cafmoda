#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
xcrun clang -dynamiclib -fobjc-arc -fblocks -Wall -Wextra -Werror \
  -framework Cocoa -o native/tray-menu.dylib native/tray-menu.m
/usr/bin/codesign --force --sign - native/tray-menu.dylib
xcrun clang -dynamiclib -fblocks -Wall -Wextra -Werror \
  -framework CoreGraphics -framework CoreFoundation -framework IOKit \
  -o native/lid-brightness.dylib native/lid-brightness.c
/usr/bin/codesign --force --sign - native/lid-brightness.dylib
xcrun clang -fobjc-arc -fblocks -Wall -Wextra -Werror \
  -framework Cocoa -framework IOKit native/power-monitor.m -o native/power-monitor
/usr/bin/codesign --force --sign - native/power-monitor
