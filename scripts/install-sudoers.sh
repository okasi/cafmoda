#!/bin/sh
# Installs /etc/sudoers.d/cafmoda so the app can run pmset without a password.
# Terminal alternative to the app's "Enable passwordless Modafinilate" menu item.
set -eu

LINE="$USER ALL=(ALL) NOPASSWD: /usr/bin/pmset -b sleep *, /usr/bin/pmset -b disablesleep *"
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
  END { exit !(sleep_ok && disable_ok) }
' && echo "passwordless pmset verified"
