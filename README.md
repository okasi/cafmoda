<p align="center">
  <img src="icons/app.png" width="112" height="112" alt="Cafmoda coffee cup app icon">
</p>

# ☕ Cafmoda — Keep Your Mac Awake

**Cafmoda is a macOS menu bar app that keeps your Mac display awake and controls
system sleep with Apple’s built-in `caffeinate` and `pmset` commands.**

☕ **Keep your screen awake.** 💊 **Control system sleep.** 🖥️ **Stay in the menu bar.**

Cafmoda puts Apple's `caffeinate` and `pmset` commands behind two simple
toggles: **Caffeinate** for your display and **Modafinilate** for system sleep
prevention. Keep your screen visible during a presentation, follow a
long-running task, or temporarily change your Mac's sleep behavior without
repeatedly entering commands or an administrator password.

<p align="center">
  <img src="https://img.shields.io/badge/platform-macOS-333333?style=flat-square" alt="Platform: macOS">
  <img src="https://img.shields.io/badge/built_with-Deno-70A597?style=flat-square" alt="Built with Deno">
  <img src="https://img.shields.io/badge/language-TypeScript-3178C6?style=flat-square" alt="Written in TypeScript">
</p>

**[Get started](#get-started)** · **[Choose a mode](#two-modes-one-menu)** ·
**[Passwordless setup](#one-time-passwordless-setup)** ·
**[FAQ](#frequently-asked-questions)** · **[Development](#development)**

## Two modes, one menu

| Mode                                    | What it does                                       | How it works                                             | Admin access    |
| --------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- | --------------- |
| **Caffeinate (Keep Display Awake)**     | Keeps the display from sleeping.                   | Runs `caffeinate -d`.                                    | None.           |
| **Modafinilate (Prevent System Sleep)** | Applies sleep prevention settings through `pmset`. | Sets battery sleep to `0` and requests `disablesleep 1`. | One-time setup. |

- **Independent controls.** Use either mode or switch both with Turn Everything
  On / Off.
- **Status at a glance.** A filled coffee cup means Caffeinate is on; the pill
  means Modafinilate is on.
- **Native menus.** Left-click or right-click the menu bar icon to open the
  controls.
- **Light and dark icons.** The tray artwork adapts to the menu bar appearance.
- **Menu bar only.** No Dock icon or regular app window to manage.
- **Live state checks.** The app checks sleep settings and matching Caffeinate
  processes every two seconds.

## Get started

### 📥 Download and install

**[Download Cafmoda for macOS (Apple Silicon)](https://github.com/okasi/cafmoda/releases/latest/download/Cafmoda-0.1.0-macOS-arm64.dmg)**

1. Open the downloaded disk image (`.dmg`).
2. Drag **Cafmoda.app** onto **Applications**.
3. Open Cafmoda from Applications and look for the coffee cup in the menu bar.

The installer includes the runtime; no Deno installation is needed. This release
is for **Apple Silicon (arm64)**. Intel Macs need a build made on Intel hardware.
The app is **ad hoc signed and not notarized by Apple**, so macOS may block it.
Only proceed if you trust the download. The disk image also includes installation
notes. SHA-256 checksums are available on the
[release page](https://github.com/okasi/cafmoda/releases/latest).


### Build-from-source requirements

You need **macOS** and **Deno 2.9 or later** to build from source. Deno Desktop
is experimental; this project has been built and launched with Deno 2.9.7 on
Apple Silicon. Other hardware and macOS versions have not been verified here.

Install Deno using its
[official installation guide](https://docs.deno.com/runtime/getting_started/installation/).
See the [Deno Desktop documentation](https://docs.deno.com/runtime/desktop/) for
the desktop runtime.

### Build and launch

Clone the repository and build Cafmoda from source:

```sh
git clone https://github.com/okasi/cafmoda.git
cd cafmoda
deno task check
deno task build
open "dist/Cafmoda.app"
```

The build creates **`dist/Cafmoda.app`**. To install it locally:

```sh
ditto "dist/Cafmoda.app" "/Applications/Cafmoda.app"
open "/Applications/Cafmoda.app"
```

The bundled app includes its runtime, so launching it does not require a
separate Deno installation. Local builds are ad hoc signed; the build script
does not notarize them.

The build packages the signed runtime with xz to reduce the shipped app size.
On first launch, the runtime is unpacked into a per-user data directory and
cached for later launches. This adds a one-time startup delay and means the
smaller bundle still needs space for the unpacked runtime on disk.
The packaging is handled by `scripts/build.sh` to work around the macOS
launcher and signing issues in Deno 2.9.7's built-in `--compress` option.

### Use the app

1. Click the coffee cup in the macOS menu bar.
2. Toggle **Caffeinate (Keep Display Awake)** to keep the display awake.
3. Toggle **Modafinilate (Prevent System Sleep)** to apply system sleep
   prevention. Approve the administrator prompt on first setup.
4. Choose **Turn Everything Off** when you want to stop both modes.

**Modafinilate changes persistent settings.** Turn it off before quitting if you
want sleep prevention disabled. Turning it off sets battery sleep to **five
minutes** and `disablesleep` to **`0`**; it does not restore a saved copy of
your previous settings.

## One-time passwordless setup

**Caffeinate never needs an administrator password.** Modafinilate needs
permission to change power settings. Its first setup installs a sudoers entry at
`/etc/sudoers.d/cafmoda`, validated with `visudo`.

The entry grants your user passwordless access to these two command patterns:

```text
/usr/bin/pmset -b sleep *
/usr/bin/pmset -b disablesleep *
```

These patterns permit arguments beyond the app's on/off values, but do not grant
passwordless access to arbitrary commands. Subsequent toggles use `sudo -n`, and
startup checks inspect the passwordless rule without depending on cached
authentication.

You can also install the rule from Terminal:

```sh
sh scripts/install-sudoers.sh
```

If the menu offers **Enable passwordless Modafinilate…**, setup has not been
detected. Use that action to install or repair the rule at
`/etc/sudoers.d/cafmoda`. Existing passwordless permissions are detected
automatically, so they do not need to be reinstalled after updating the app.

## Frequently asked questions

### What is Cafmoda?

Cafmoda is a macOS menu bar utility for preventing display sleep and controlling
system sleep. It provides independent toggles for `caffeinate -d` and
battery-targeted `pmset` settings, written in TypeScript with Deno Desktop.

### When should I use Cafmoda?

Use Cafmoda to keep your screen visible during presentations, dashboards, or
reading, and to control sleep settings while following downloads, builds, or
other long-running tasks. Choose the mode that matches your task and disable
sleep prevention when you finish.

### How do I keep my Mac screen awake?

Open Cafmoda from the menu bar and turn **Caffeinate** on. It runs
`caffeinate -d` to prevent display sleep until you turn it off or the process
stops. It does not change the persistent sleep timer.

### What is the difference between Caffeinate and Modafinilate?

**Caffeinate prevents display sleep through a running process. Modafinilate
changes power settings through `pmset`.** The app passes `-b` for Modafinilate's
settings, targeting battery power rather than configuring a separate AC profile.
Use both when you want both controls enabled.

### Will it ask for my sudo password every time?

No. Modafinilate asks for administrator approval during its initial passwordless
setup. Once the rule is installed and detected, toggling it does not prompt
again. Caffeinate requires no administrator access.

### Does quitting the app restore normal sleep?

Quitting stops the Caffeinate process if this app started it. **Quitting does
not reset Modafinilate's power settings.** Choose Turn Everything Off before
quitting to disable both modes.

### Does it keep a MacBook awake with the lid closed?

Closed-lid operation is not a verified feature of this project. Cafmoda requests
sleep prevention through `pmset`, but behavior can depend on the Mac, power
source, peripherals, and macOS. Do not assume an unattended task will continue
with the lid closed.

### Does it include timers or automatic launch at login?

The current app has manual toggles. It does not include a duration timer,
scheduling, or a built-in launch-at-login setting.

### Why does the menu show a mode as on before I enable it?

The menu reflects detected state. Modafinilate appears on if sleep is disabled
or the battery sleep timer is zero. Caffeinate detects processes matching
`caffeinate -d`, including one started outside the app; turning it off also
stops those matching processes.

## Development

Run the app with hot reload:

```sh
deno task dev
```

| Task              | Purpose                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `deno task check` | Type-check the app with Deno Desktop types.                           |
| `deno task build` | Bundle, name, and ad hoc sign the macOS app.                          |
| `deno task icons` | Regenerate the artwork and embedded TypeScript icons. Requires Swift. |

The app is written in TypeScript and uses Deno's system WebView backend with
native tray menus. The main files are:

| File                                                     | Responsibility                                 |
| -------------------------------------------------------- | ---------------------------------------------- |
| [main.ts](main.ts)                                       | Menu, state polling, and sleep controls.       |
| [sudo-permissions.ts](sudo-permissions.ts)               | Detection of passwordless `pmset` permissions. |
| [scripts/build.sh](scripts/build.sh)                     | macOS application packaging.                   |
| [scripts/install-sudoers.sh](scripts/install-sudoers.sh) | Terminal setup for passwordless Modafinilate.  |
| [scripts/gen_icons.swift](scripts/gen_icons.swift)       | App and tray artwork generation.               |

To create a downloadable disk image from source, run `deno task package`. The
installer and `SHA256SUMS.txt` are written to `dist/`.

## Troubleshooting

**The menu bar icon is missing:** launch the app again and check whether macOS
has hidden it among other menu bar items.

**Modafinilate does not toggle:** run the passwordless setup again and inspect
the error log:

```sh
tail -n 50 "$HOME/Library/Logs/cafmoda.log"
```

**You want to inspect the current power settings:** these read-only commands do
not need `sudo`:

```sh
pmset -g
pmset -g custom
```

When reporting a problem, include your macOS version, Mac architecture, Deno
version if building from source, the affected mode, and relevant log lines.

## 🤝 Contributing and support

Found a bug or have an idea? [Open an issue](https://github.com/okasi/cafmoda/issues)
with steps to reproduce it and your macOS and Deno versions. For code changes,
keep the scope focused, run `deno task check`, and describe the behavior you tested.

Maintained by [okasi](https://github.com/okasi).
