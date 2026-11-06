#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
xcrun clang -dynamiclib -fobjc-arc -fblocks -Wall -Wextra -Werror \
  -framework Cocoa -o native/tray-menu.dylib native/tray-menu.m
/usr/bin/codesign --force --sign - native/tray-menu.dylib
