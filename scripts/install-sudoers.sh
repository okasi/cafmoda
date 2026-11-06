#!/bin/sh
# Installs /etc/sudoers.d/cafmoda so the app can run pmset without a password.
# Terminal alternative to the app's "Enable passwordless Modafinilate" menu item.
set -eu

LINE="$USER ALL=(ALL) NOPASSWD: /usr/bin/pmset -b sleep *, /usr/bin/pmset -b disablesleep *, /usr/bin/pmset -b lowpowermode 0, /usr/bin/pmset -b lowpowermode 1, /usr/bin/pmset -b powermode 0, /usr/bin/pmset -b powermode 1, /usr/bin/pmset -b powermode 2"
TMP="$(mktemp -t cafmoda.XXXXXX)"
trap 'rm -f "$TMP"' EXIT

printf '%s\n' "$LINE" > "$TMP"
chmod 0440 "$TMP"
/usr/sbin/visudo -cf "$TMP"
sudo install -m 0440 -o root -g wheel "$TMP" /etc/sudoers.d/cafmoda
echo "installed /etc/sudoers.d/cafmoda"
# Check the passwordless entry itself; pmset -g is outside this rule.
sudo -n -k -ll | awk '
  /Sudoers entry:/ { passwordless = 0 }
  /Options:.*!authenticate/ { passwordless = 1 }
  passwordless && /\/usr\/bin\/pmset -b sleep \*/ { sleep_ok = 1 }
  passwordless && /\/usr\/bin\/pmset -b disablesleep \*/ { disable_ok = 1 }
  passwordless && /\/usr\/bin\/pmset -b lowpowermode 0$/ { low_off = 1 }
  passwordless && /\/usr\/bin\/pmset -b lowpowermode 1$/ { low_on = 1 }
  passwordless && /\/usr\/bin\/pmset -b powermode 0$/ { mode_auto = 1 }
  passwordless && /\/usr\/bin\/pmset -b powermode 1$/ { mode_low = 1 }
  passwordless && /\/usr\/bin\/pmset -b powermode 2$/ { mode_high = 1 }
  END { exit !(sleep_ok && disable_ok && low_off && low_on && mode_auto && mode_low && mode_high) }
' && echo "passwordless pmset verified"
