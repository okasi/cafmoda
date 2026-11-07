<p align="center">
  <img src="icons/app.png" width="112" height="112" alt="Cafmoda coffee cup app icon">
</p>

# ☕ Cafmoda

A macOS menu bar app for keeping your display awake and controlling system
sleep. Built with TypeScript and Deno Desktop, using Apple’s `caffeinate` and
`pmset`.

| Mode             | Effect                                                               | Admin access   |
| ---------------- | -------------------------------------------------------------------- | -------------- |
| **Caffeinate**   | Keeps the display awake with `caffeinate -d`.                        | None           |
| **Modafinilate** | Temporarily sets battery sleep to `0` and requests `disablesleep 1`. | One-time setup |

Use either mode independently or **Turn Everything On / Off**. Left-click or
right-click the menu bar icon to open the controls. A filled cup indicates
Caffeinate; a pill indicates Modafinilate. There is no Dock icon.

## Install

**[Download for macOS (Apple Silicon)](https://github.com/okasi/cafmoda/releases/latest/download/Cafmoda-0.3.1-macOS-arm64.dmg)**

Open the disk image, drag **Cafmoda.app** to **Applications**, then launch it.
The runtime is included; Deno is not required. Intel Macs need a build made on
Intel hardware.

The app is **ad hoc signed and not notarized**, so macOS may block it. Only
proceed if you trust the download. Installation notes are in the disk image;
checksums are on the
[release page](https://github.com/okasi/cafmoda/releases/latest).

## Usage

- **Caffeinate:** prevents display sleep until disabled. Cafmoda stops only its
  own process; the assertion also ends if Cafmoda crashes.
- **Modafinilate:** saves the exact previous power settings before changing
  them, and restores its changes on quit. Turning Modafinilate off or choosing
  **Turn Everything Off** also re-enables system/lid sleep and replaces a
  disabled battery sleep timer with 5 minutes; existing nonzero timers are
  preserved. A separate native
  monitor restores the saved settings if Cafmoda is force-quit or crashes.
  Unfinished recovery is retried on the next launch; a journal remains on disk
  until recovery succeeds. After a restart, recovery runs when Cafmoda next
  launches (enable Launch at Login to run it at login).
- **Battery cutoff:** at **8% or below while running on battery**, Cafmoda stops
  its keep-awake controls and blocks reactivation. Plugging in or charging above
  8% makes the controls available again, without restarting the old session. An
  unreadable battery level while on battery also blocks keep-awake controls.
- **Respect Low Power Mode:** Low Power Mode enabled by you stops Cafmoda's
  keep-awake controls. Your energy mode is preserved.
- **Closed lid on battery:** Cafmoda automatically enables battery Low Power
  Mode while the lid is closed, independently of its keep-awake toggles. Opening
  the lid, connecting power, or quitting restores the prior battery energy mode.
  Cafmoda's own automatic Low Power Mode does not stop its keep-awake controls.
  If you override the automatic mode, Cafmoda respects that choice until the lid
  opens or the power source changes. Power controls must be authorized first.
- **Existing settings:** Automatic recovery and battery protection preserve
  settings changed outside the app. Its cutoff releases its own controls;
  it cannot guarantee system sleep when your baseline or another app prevents
  it. If both controls are off but existing settings still prevent sleep,
  choose **Restore Normal Sleep** to clear them. This also repairs never-sleep
  settings left behind by older releases that did not record originals.
- **Launch at Login:** enable it from the menu after installing in Applications.
  It is off by default, requires no admin access, and is unavailable during
  development hot reload. If you move the app, toggle it off and on again.
  Launching Cafmoda does not automatically enable either mode.
- **Lid dimming:** closing the lid automatically sets the built-in display to
  minimum brightness; reopening it or quitting normally restores the saved
  level. External displays are unaffected. This uses the private DisplayServices
  API and may be unavailable on some macOS versions.

Native IOKit and system notifications drive power, battery, Low Power Mode, and
lid updates. A once-a-minute fallback reconciles external settings and retries
recovery; lid brightness is sampled every 30 seconds as a fallback. The mode
checkmarks describe Cafmoda-owned controls. Other apps' `caffeinate` processes
are not polled or terminated.

Closed-lid operation is **not verified** and depends on hardware, power source,
peripherals, and macOS. Lid dimming does not itself prevent sleep.

## Passwordless setup

Caffeinate needs no administrator password. Modafinilate’s first setup asks for
approval to install `/etc/sudoers.d/cafmoda`, validated with `visudo`. It grants
your user passwordless access to:

```text
/usr/bin/pmset -b sleep *
/usr/bin/pmset -b disablesleep *
/usr/bin/pmset -b lowpowermode 0
/usr/bin/pmset -b lowpowermode 1
/usr/bin/pmset -b powermode 0
/usr/bin/pmset -b powermode 1
/usr/bin/pmset -b powermode 2
```

The wildcards allow arguments beyond the app’s on/off values, but not arbitrary
commands. Later changes use `sudo -n`; permission checks do not rely on cached
authentication. The energy-mode rules allow only the explicit values shown.
Existing installs need the power-control setup once more to add these rules.
Cafmoda detects whether the system reports `lowpowermode` or `powermode` and
changes only the battery profile; the AC profile is never changed.

Choose **Enable power controls…** to install or repair the rule, or run:

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
| `deno task test`              | Test power policies, recovery, login startup, brightness, and native integration.               |
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

## Power recovery

[power-policy.ts](power-policy.ts) owns the power policies and settings journal;
[power-runtime.ts](power-runtime.ts) connects to the notification and crash
recovery helper in [native/power-monitor.m](native/power-monitor.m).

The journal lives at
`~/Library/Application Support/dev.osim.cafmoda/power-recovery.json` with
user-only permissions. Recovery writes only allowlisted power settings. If a
live setting differs from Cafmoda's applied value, recovery preserves the
external change. A change to the same value is indistinguishable from Cafmoda's
own value. Recovery failures retain the journal, appear in the menu and log, and
block new keep-awake controls until recovery succeeds. After a restart, recovery
occurs on Cafmoda's next launch.
