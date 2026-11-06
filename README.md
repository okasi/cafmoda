<p align="center">
  <img src="icons/app.png" width="112" height="112" alt="Cafmoda coffee cup app icon">
</p>

# ☕ Cafmoda

A macOS menu bar app for keeping your display awake and controlling system
sleep. Built with TypeScript and Deno Desktop, using Apple’s `caffeinate` and
`pmset`.

| Mode             | Effect                                                                   | Admin access   |
| ---------------- | ------------------------------------------------------------------------ | -------------- |
| **Caffeinate**   | Keeps the display awake with `caffeinate -d`.                            | None           |
| **Modafinilate** | Sets battery sleep to `0` and requests `disablesleep 1` with `pmset -b`. | One-time setup |

Use either mode independently or **Turn Everything On / Off**. Left-click or
right-click the menu bar icon to open the controls. A filled cup indicates
Caffeinate; a pill indicates Modafinilate. There is no Dock icon.

## Install

**[Download for macOS (Apple Silicon)](https://github.com/okasi/cafmoda/releases/latest/download/Cafmoda-0.1.0-macOS-arm64.dmg)**

Open the disk image, drag **Cafmoda.app** to **Applications**, then launch it.
The runtime is included; Deno is not required. Intel Macs need a build made on
Intel hardware.

The app is **ad hoc signed and not notarized**, so macOS may block it. Only
proceed if you trust the download. Installation notes are in the disk image;
checksums are on the
[release page](https://github.com/okasi/cafmoda/releases/latest).

## Usage

- **Caffeinate:** prevents display sleep until disabled. Quitting stops the
  process if Cafmoda started it.
- **Modafinilate:** changes persistent power settings. **Turn it off before
  quitting** to disable sleep prevention. Off sets battery sleep to **five
  minutes** and `disablesleep` to **`0`**, rather than restoring previous
  settings.
- **Launch at Login:** enable it from the menu after installing in Applications.
  It is off by default, requires no admin access, and is unavailable during
  development hot reload. If you move the app, toggle it off and on again.
  Launching Cafmoda does not automatically enable either mode.
- **Lid dimming:** closing the lid automatically sets the built-in display to
  minimum brightness; reopening it or quitting normally restores the saved
  level. External displays are unaffected. This uses the private DisplayServices
  API and may be unavailable on some macOS versions.

The menu checks sleep settings and matching `caffeinate -d` processes every two
seconds, including processes started outside Cafmoda. Turning Caffeinate off
also stops those matching processes. Modafinilate appears on if sleep is
disabled or the battery sleep timer is zero.

Closed-lid operation is **not verified** and depends on hardware, power source,
peripherals, and macOS. Lid dimming does not itself prevent sleep.

## Passwordless setup

Caffeinate needs no administrator password. Modafinilate’s first setup asks for
approval to install `/etc/sudoers.d/cafmoda`, validated with `visudo`. It grants
your user passwordless access to:

```text
/usr/bin/pmset -b sleep *
/usr/bin/pmset -b disablesleep *
```

The wildcards allow arguments beyond the app’s on/off values, but not arbitrary
commands. Later toggles use `sudo -n`; permission checks do not rely on cached
authentication.

Choose **Enable passwordless Modafinilate…** to install or repair the rule, or
run:

```sh
sh scripts/install-sudoers.sh
```

Existing permissions are detected automatically after updates.

## Development

Requires **macOS**, **Deno 2.9+**, and **Xcode Command Line Tools**. Deno
Desktop is experimental; this project has been built and launched with Deno
2.9.7 on Apple Silicon. Other hardware and macOS versions have not been
verified.

```sh
git clone https://github.com/okasi/cafmoda.git
cd cafmoda
deno task check
deno task build
open "dist/Cafmoda.app"
```

To install locally, quit the running app first, then:

```sh
ditto "dist/Cafmoda.app" "/Applications/Cafmoda.app"
codesign --verify --deep --strict "/Applications/Cafmoda.app"
open "/Applications/Cafmoda.app"
```

Builds are ad hoc signed. The bundled runtime is compressed with xz and
extracted to a per-user cache on first launch, adding a one-time delay and
requiring space for the unpacked runtime.

| Task                          | Purpose                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `deno task dev`               | Run with hot reload.                                                                            |
| `deno task check`             | Type-check with Deno Desktop types.                                                             |
| `deno task test`              | Test login startup, lid brightness, and native integration without changing login settings.     |
| `deno task test:tray-runtime` | Verify real AppKit clicks, positioning, focus, and TypeScript callbacks in a packaged test app. |
| `deno task build`             | Compile native helpers, bundle, and sign the app.                                               |
| `deno task package`           | Create a disk image and `SHA256SUMS.txt` in `dist/`.                                            |
| `deno task icons`             | Regenerate app and tray artwork; requires Swift.                                                |

[main.ts](main.ts) handles menus and sleep controls;
[tray-menu.ts](tray-menu.ts) and [native/tray-menu.m](native/tray-menu.m)
connect TypeScript to AppKit’s `NSStatusItem.menu`. Tests briefly show a
separate menu bar icon. See [launch-at-login.ts](launch-at-login.ts),
[lid-brightness.ts](lid-brightness.ts), and
[sudo-permissions.ts](sudo-permissions.ts) for the other integrations.

Login startup uses `~/Library/LaunchAgents/dev.osim.cafmoda.login.plist` and the
bundled `cafmoda-anti-sleep` helper. Existing enabled entries migrate on
startup.

## Troubleshooting and contributing

If the icon is missing, relaunch Cafmoda and check hidden menu bar items. If
Modafinilate fails, rerun passwordless setup and inspect the log:

```sh
tail -n 50 "$HOME/Library/Logs/cafmoda.log"
```

Inspect power settings with `pmset -g` or `pmset -g custom` (no sudo required).

[Report bugs or suggest changes](https://github.com/okasi/cafmoda/issues) with
reproduction steps, macOS version, Mac architecture, affected mode, and relevant
logs. Include your Deno version when building from source. For code changes, run
`deno task check` and describe what you tested.

Maintained by [okasi](https://github.com/okasi).
