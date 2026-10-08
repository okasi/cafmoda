// Cafmoda - menu bar app to keep the display and system awake.
// Run with: deno task dev   (or bundle with: deno task build)
//
// Menu delivery:
//   right-click -> native NSMenu via tray.setMenu()
//   left-click  -> same menu popped under the icon via win.showContextMenu()
// Both feed handleMenuClick().
//
// The webview backend quits when the last regular window closes. macOS
// excludes utility panels from that check, so retain the regular startup
// window, ordered on screen at zero opacity, as the context-menu host.

import {
  ICON_00,
  ICON_00_DARK,
  ICON_01,
  ICON_01_DARK,
  ICON_10,
  ICON_10_DARK,
  ICON_11,
  ICON_11_DARK,
} from "./icons.gen.ts";
import { hasPasswordlessPmset } from "./sudo-permissions.ts";

// Icon per state: pill behind cup = pmset on, filled cup = caffeinate on.
const ICONS = {
  "00": [ICON_00, ICON_00_DARK],
  "10": [ICON_10, ICON_10_DARK],
  "01": [ICON_01, ICON_01_DARK],
  "11": [ICON_11, ICON_11_DARK],
} as const;

// pmset settings applied on battery (-b) when "Modafinilate" is toggled.
const PMSET_ON: string[][] = [["-b", "sleep", "0"], [
  "-b",
  "disablesleep",
  "1",
]];
const PMSET_OFF: string[][] = [["-b", "sleep", "5"], [
  "-b",
  "disablesleep",
  "0",
]];

// sudoers drop-in installed via the "Enable passwordless Modafinilate" menu item.
const SUDOERS_PATH = "/etc/sudoers.d/no-sleep";
const SUDOERS_LINE = `${Deno.env.get("USER") ?? "ALL"} ALL=(ALL) NOPASSWD: ` +
  `/usr/bin/pmset -b sleep *, /usr/bin/pmset -b disablesleep *`;

const CAFFEINATE_PATTERN = "^(/usr/bin/)?caffeinate -d$";
const POLL_MS = 2000;
const LOG_PATH = `${Deno.env.get("HOME")}/Library/Logs/no-sleep.log`;
const APP_NAME = "Cafmoda";

function logErr(e: unknown): void {
  const line = `[${new Date().toISOString()}] ` +
    `${e instanceof Error ? e.stack ?? e.message : String(e)}\n`;
  try {
    Deno.stderr.writeSync(new TextEncoder().encode(line));
    Deno.writeTextFileSync(LOG_PATH, line, { append: true, create: true });
  } catch { /* logging must never throw */ }
}

// A stray exception must never kill the process: at exit, the backend's tray
// teardown runs off the main thread and crashes AppKit. Log and carry on.
globalThis.addEventListener("error", (e) => {
  e.preventDefault();
  logErr(e.error ?? e.message);
});
globalThis.addEventListener("unhandledrejection", (e) => {
  e.preventDefault();
  logErr(e.reason);
});

type CmdResult = { ok: boolean; out: string; err: string };

async function run(cmd: string, args: string[]): Promise<CmdResult> {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    env: { LC_ALL: "C" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return {
    ok: code === 0,
    out: dec.decode(stdout),
    err: dec.decode(stderr),
  };
}

// --- state ---

async function caffeinateRunning(): Promise<boolean> {
  const r = await run("/usr/bin/pgrep", ["-f", CAFFEINATE_PATTERN]);
  return r.ok;
}

// "Modafinilate" is on when disablesleep is set or battery sleep timer is 0.
async function pmsetPreventingSleep(): Promise<boolean> {
  const g = await run("/usr/bin/pmset", ["-g"]);
  if (/^\s*SleepDisabled\s+1\s*$/m.test(g.out)) return true;
  const custom = await run("/usr/bin/pmset", ["-g", "custom"]);
  const battery =
    custom.out.split("Battery Power:")[1]?.split("AC Power:")[0] ??
      "";
  return /^\s*sleep\s+0\s*$/m.test(battery);
}

// Inspect passwordless rules without changing settings or using cached auth.
// pmset -g is deliberately outside the app's sudoers rule.
async function sudoConfigured(): Promise<boolean> {
  const r = await run("/usr/bin/sudo", ["-n", "-k", "-ll"]);
  return r.ok && hasPasswordlessPmset(r.out, [...PMSET_ON, ...PMSET_OFF]);
}

// --- actions ---

let caffeinate: Deno.ChildProcess | null = null;

async function setCaffeinate(on: boolean): Promise<void> {
  if (on) {
    caffeinate = new Deno.Command("caffeinate", {
      args: ["-d"],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    caffeinate.status.then(() => (caffeinate = null));
  } else {
    await run("/usr/bin/pkill", ["-f", CAFFEINATE_PATTERN]);
  }
}

async function setPmset(on: boolean): Promise<boolean> {
  for (const args of on ? PMSET_ON : PMSET_OFF) {
    const r = await run("/usr/bin/sudo", ["-n", "/usr/bin/pmset", ...args]);
    if (!r.ok) {
      logErr(new Error(`pmset failed: ${r.err.trim()}`));
      return false;
    }
  }
  return true;
}

// One-time setup: write the sudoers line to a temp file, then install it as
// root through the native macOS admin prompt (osascript).
async function installSudoers(): Promise<boolean> {
  const tmp = await Deno.makeTempFile({ suffix: ".sudoers" });
  await Deno.writeTextFile(tmp, SUDOERS_LINE + "\n", { mode: 0o440 });
  const script = `do shell script "/usr/sbin/visudo -cf ${tmp} >/dev/null && ` +
    `/usr/bin/install -m 0440 -o root -g wheel ${tmp} ${SUDOERS_PATH}" ` +
    `with administrator privileges`;
  const r = await run("/usr/bin/osascript", ["-e", script]);
  await Deno.remove(tmp).catch(() => {});
  if (!r.ok) logErr(new Error(`sudoers install failed: ${r.err.trim()}`));
  return r.ok && await sudoConfigured();
}

// --- tray UI ---

Deno.dock.setVisible(false); // menu-bar-only app: no dock icon, no Cmd-Tab

// Adopt the regular startup window. A noActivate window is an NSPanel and
// does not keep macOS alive when a dropdown closes. Zero opacity makes this
// window invisible while show() keeps it eligible for the last-window check.
const menuHost = new Deno.BrowserWindow({
  frameless: true,
  opacity: 0,
  width: 2,
  height: 2,
  resizable: false,
});
menuHost.addEventListener("close", (e) => e.preventDefault());
menuHost.show();

const tray = new Deno.Tray();
let sudoOk = false;
let lastMenuKey = "";
let currentMenu: Deno.MenuItem[] = [];

interface State {
  caffeinate: boolean;
  pmset: boolean;
}

async function readState(): Promise<State> {
  const [caf, pm] = await Promise.all([
    caffeinateRunning(),
    pmsetPreventingSleep(),
  ]);
  return { caffeinate: caf || caffeinate !== null, pmset: pm };
}

function buildMenu(s: State): Deno.MenuItem[] {
  const menu: Deno.MenuItem[] = [
    { item: { label: APP_NAME, enabled: false } },
    "separator",
    {
      item: {
        label: `Caffeinate (Keep Display Awake): ${
          s.caffeinate ? "On" : "Off"
        }`,
        id: "toggle-caffeinate",
        enabled: true,
      },
    },
    {
      item: {
        label: `Modafinilate (Prevent System Sleep): ${s.pmset ? "On" : "Off"}`,
        id: "toggle-pmset",
        enabled: true,
      },
    },
  ];
  if (!sudoOk) {
    menu.push({
      item: {
        label: "Enable passwordless Modafinilate…",
        id: "setup-sudo",
        enabled: true,
      },
    });
  }
  menu.push(
    "separator",
    {
      item: {
        label: s.caffeinate || s.pmset
          ? "Turn Everything Off"
          : "Turn Everything On",
        id: "toggle-all",
        enabled: true,
      },
    },
    "separator",
    {
      item: { label: `Quit ${APP_NAME}`, id: "quit", enabled: true },
    },
  );
  return menu;
}

async function refresh(): Promise<State> {
  const s = await readState();
  const key = `${s.caffeinate}|${s.pmset}|${sudoOk}`;
  if (key !== lastMenuKey) {
    lastMenuKey = key;
    const iconKey = `${s.caffeinate ? 1 : 0}${
      s.pmset ? 1 : 0
    }` as keyof typeof ICONS;
    tray.setIcon(ICONS[iconKey][0]);
    tray.setIconDark(ICONS[iconKey][1]);
    tray.setTooltip(
      `${APP_NAME} — Caffeinate (Keep Display Awake) ${
        s.caffeinate ? "on" : "off"
      }, ` +
        `Modafinilate (Prevent System Sleep) ${s.pmset ? "on" : "off"}`,
    );
    currentMenu = buildMenu(s);
    tray.setMenu(currentMenu);
  }
  return s;
}

let busy = false;

async function withRefresh(fn: (s: State) => Promise<void>): Promise<void> {
  if (busy) return; // ignore clicks while a toggle is in flight
  busy = true;
  try {
    await fn(await readState());
  } catch (e) {
    logErr(e);
  } finally {
    busy = false;
    await refresh().catch(logErr);
  }
}

// AppKit needs the context-menu host active before opening a window-based
// menu. Defer the popup to the next event-loop turn so activation can settle.
// Quick repeat clicks arrive as dblclick rather than click in the backend.
let openingMenu = false;
async function openTrayMenu(): Promise<void> {
  if (openingMenu) return;
  openingMenu = true;
  try {
    await menuReady;
    const b = tray.getBounds();
    if (b === null || currentMenu.length === 0) return;
    menuHost.setPosition(b.x, b.y + b.height);
    menuHost.focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    // The macOS WebView backend uses bottom-origin content coordinates.
    // Anchor at the host's top edge, directly below the status item's bounds.
    menuHost.showContextMenu(0, menuHost.getSize()[1], currentMenu);
  } catch (e) {
    logErr(e);
  } finally {
    openingMenu = false;
  }
}
tray.addEventListener("click", () => void openTrayMenu());
tray.addEventListener("dblclick", () => void openTrayMenu());

function handleMenuClick(id: string | undefined): void {
  switch (id) {
    case "toggle-caffeinate":
      void withRefresh(async (s) => await setCaffeinate(!s.caffeinate));
      break;
    case "toggle-pmset":
      void withRefresh(async (s) => {
        if (!sudoOk) {
          sudoOk = await installSudoers();
          if (!sudoOk) return;
        }
        await setPmset(!s.pmset);
      });
      break;
    case "toggle-all":
      void withRefresh(async (s) => {
        const target = !(s.caffeinate || s.pmset);
        if (target !== s.pmset) {
          if (!sudoOk) {
            sudoOk = await installSudoers();
            if (!sudoOk) return;
          }
          if (!(await setPmset(target))) return;
        }
        if (target !== s.caffeinate) await setCaffeinate(target);
      });
      break;
    case "setup-sudo":
      void withRefresh(async () => {
        sudoOk = await installSudoers();
      });
      break;
    case "quit":
      void (async () => {
        if (caffeinate !== null) {
          await run("/usr/bin/pkill", ["-f", CAFFEINATE_PATTERN]);
        }
        // Destroy the tray, then self-SIGKILL: exit() runs C++ static
        // destructors off the main thread, where NSStatusItem teardown
        // crashes AppKit ("Must only be used from the main thread").
        try {
          tray.destroy();
        } catch (e) {
          logErr(e);
        }
        await run("/bin/kill", ["-KILL", String(Deno.pid)]);
        Deno.exit(0); // unreachable unless kill fails
      })();
      break;
  }
}

tray.addEventListener("menuclick", (e) => {
  handleMenuClick(e.detail?.id);
});
menuHost.addEventListener("contextmenuclick", (e) => {
  handleMenuClick(e.detail?.id);
});

if (tray.trayId === 0) {
  console.error("Could not create a menu bar item on this system.");
  Deno.exit(1);
}

const menuReady = (async () => {
  sudoOk = await sudoConfigured();
  await refresh();
})();
await menuReady;
setInterval(() => refresh().catch(logErr), POLL_MS);
console.log(
  `${APP_NAME} running, tray id ${tray.trayId}, ` +
    `sudo ${sudoOk ? "ok" : "not configured"}`,
);
