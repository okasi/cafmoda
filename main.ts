// Cafmoda - menu bar app to keep the display and system awake.
// Run with: deno task dev   (or bundle with: deno task build)
//
// Menu delivery:
// Both mouse buttons open the same NSStatusItem.menu directly through AppKit.
//
// The webview backend quits when the last regular window closes. macOS
// excludes utility panels from that check, so retain the regular startup
// window, ordered on screen at zero opacity, to keep the backend alive.

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
import { NativeTray, type TrayMenuItem } from "./tray-menu.ts";
import { LaunchAtLogin } from "./launch-at-login.ts";
import { watchLidBrightness } from "./lid-brightness.ts";
import { PowerPolicy, PowerSettings } from "./power-policy.ts";
import { powerBackend, PowerMonitor, run } from "./power-runtime.ts";

// Icon per state: pill behind cup = pmset on, filled cup = caffeinate on.
const ICONS = {
  "00": [ICON_00, ICON_00_DARK],
  "10": [ICON_10, ICON_10_DARK],
  "01": [ICON_01, ICON_01_DARK],
  "11": [ICON_11, ICON_11_DARK],
} as const;

const SLEEP_PERMISSIONS = [["-b", "sleep", "0"], ["-b", "sleep", "5"], [
  "-b",
  "disablesleep",
  "0",
], ["-b", "disablesleep", "1"]];
const ENERGY_PERMISSIONS = [
  ["-b", "lowpowermode", "0"],
  ["-b", "lowpowermode", "1"],
  ["-b", "powermode", "0"],
  ["-b", "powermode", "1"],
  ["-b", "powermode", "2"],
];
const SUDOERS_PATH = "/etc/sudoers.d/cafmoda";
const SUDOERS_LINE = `${Deno.env.get("USER") ?? "ALL"} ALL=(ALL) NOPASSWD: ` +
  [
    "/usr/bin/pmset -b sleep *",
    "/usr/bin/pmset -b disablesleep *",
    ...ENERGY_PERMISSIONS.map((args) => `/usr/bin/pmset ${args.join(" ")}`),
  ].join(", ");
const LOG_PATH = `${Deno.env.get("HOME")}/Library/Logs/cafmoda.log`;
const APP_NAME = "Cafmoda";
const SUPPORT_PATH = `${
  Deno.env.get("HOME")
}/Library/Application Support/dev.osim.cafmoda`;

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

const backend = powerBackend(
  `${SUPPORT_PATH}/power-recovery.json`,
  (key, value) => monitor.write(key, value),
);
const settings = new PowerSettings(backend);
const policy = new PowerPolicy(settings);
let energyKey = "lowpowermode";
async function sudoConfigured(): Promise<boolean> {
  const r = await run("/usr/bin/sudo", ["-n", "-k", "-ll"]);
  return r.ok && hasPasswordlessPmset(r.out, [
    ...SLEEP_PERMISSIONS,
    ...ENERGY_PERMISSIONS.filter((args) => args[1] === energyKey),
  ]);
}

// Keep a handle to our own assertion. -w also releases it on a force quit.
let caffeinate: Deno.ChildProcess | null = null;
async function setCaffeinate(on: boolean): Promise<void> {
  if (on && !caffeinate) {
    const child = new Deno.Command("/usr/bin/caffeinate", {
      args: ["-d", "-w", String(Deno.pid)],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    }).spawn();
    caffeinate = child;
    void child.status.then(() => {
      if (caffeinate === child) {
        caffeinate = null;
        scheduleRefresh();
      }
    });
  } else if (!on && caffeinate) {
    const child = caffeinate;
    caffeinate = null;
    try {
      child.kill("SIGTERM");
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
    }
    await child.status;
  }
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
// Tray clicks never focus or reposition this window.
const keepAliveWindow = new Deno.BrowserWindow({
  frameless: true,
  opacity: 0,
  width: 2,
  height: 2,
  resizable: false,
});
keepAliveWindow.addEventListener("close", (e) => e.preventDefault());
keepAliveWindow.show();

const tray = await NativeTray.create();
const monitor = await PowerMonitor.create(
  SUPPORT_PATH,
  `${SUPPORT_PATH}/power-recovery.json`,
  logErr,
);
const stopLidBrightness = await watchLidBrightness(logErr, monitor.subscribe)
  .catch((error) => {
    logErr(error);
    return () => {};
  });
globalThis.addEventListener("unload", stopLidBrightness);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  Deno.addSignalListener(signal, () => {
    void quit();
  });
}
let sudoOk = false;
let lastMenuKey = "";
const launchAtLogin = new LaunchAtLogin(
  Deno.env.get("HOME")!,
  Deno.env.get("CAFMODA_APP_PATH"),
);

interface State {
  caffeinate: boolean;
  pmset: boolean;
  launchAtLogin: boolean;
  blocked: string | null;
  baselinePreventsSleep: boolean;
  autoLowPower: boolean;
}
let recoveryPending = false;
let operationError: string | null = null;
let quitting = false;
let initialized = false;
let fallback: ReturnType<typeof setInterval> | undefined;

async function readState(): Promise<State> {
  const [live, login] = await Promise.all([
    settings.read(),
    launchAtLogin.isEnabled(),
  ]);
  return {
    caffeinate: caffeinate !== null,
    pmset: policy.modafinilate,
    launchAtLogin: login,
    blocked: !monitor.available
      ? "Power monitoring unavailable"
      : recoveryPending
      ? "Power settings recovery pending"
      : policy.reason,
    baselinePreventsSleep: !policy.modafinilate &&
      (live.disablesleep === 1 || live.sleep === 0),
    autoLowPower: settings.changes.some((c) => c.key === energyKey),
  };
}

function buildMenu(s: State): TrayMenuItem[] {
  const menu: TrayMenuItem[] = [
    { item: { label: APP_NAME, enabled: false } },
    {
      item: {
        label: s.blocked ??
          (s.autoLowPower
            ? "Low Power Mode · closed lid on battery"
            : "Battery protection · cutoff at 8%"),
        enabled: false,
      },
    },
    ...(s.baselinePreventsSleep
      ? [{
        item: {
          label: "Existing settings also prevent system sleep",
          enabled: false,
        },
      }]
      : []),
    ...(operationError
      ? [{ item: { label: operationError, enabled: false } }]
      : []),
    "separator",
    {
      item: {
        label: `Caffeinate (Keep Display Awake): ${
          s.caffeinate ? "On" : "Off"
        }`,
        id: "toggle-caffeinate",
        enabled: !s.blocked || s.caffeinate,
        checked: s.caffeinate,
      },
    },
    {
      item: {
        label: `Modafinilate (Prevent System Sleep): ${s.pmset ? "On" : "Off"}`,
        id: "toggle-pmset",
        enabled: !s.blocked || s.pmset,
        checked: s.pmset,
      },
    },
  ];
  if (!sudoOk) {
    menu.push({
      item: {
        label: "Enable power controls…",
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
        enabled: !s.blocked || s.caffeinate || s.pmset,
      },
    },
    "separator",
    {
      item: {
        label: "Launch at Login",
        id: "toggle-launch-at-login",
        enabled: launchAtLogin.available,
        checked: s.launchAtLogin,
        tooltip: launchAtLogin.available
          ? "Open Cafmoda automatically when you log in to your Mac."
          : "Available when running the built Cafmoda app.",
      },
    },
    {
      item: { label: `Quit ${APP_NAME}`, id: "quit", enabled: true },
    },
  );
  return menu;
}

async function refresh(): Promise<State> {
  const s = await readState();
  const key = JSON.stringify([s, sudoOk, operationError]);
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
    tray.setMenu(buildMenu(s));
  }
  return s;
}

// All actions and native notifications share one queue: a battery or lid
// transition cannot race a settings write, journal update, or user click.
let work = Promise.resolve();
function enqueue(action: () => Promise<void>): Promise<void> {
  work = work.then(async () => {
    if (quitting) return;
    try {
      operationError = null;
      await action();
    } catch (error) {
      recoveryPending ||= settings.changes.length > 0;
      operationError = "Power action failed · see cafmoda.log";
      logErr(error);
    }
    await refresh().catch(logErr);
  });
  return work;
}

async function reconcile(): Promise<void> {
  if (recoveryPending) {
    await setCaffeinate(false);
    policy.modafinilate = false;
    await settings.recover();
    recoveryPending = false;
  }
  if (!monitor.available) {
    await setCaffeinate(false);
    await policy.setModafinilate(false);
    await settings.restore();
    return;
  }
  try {
    await policy.reconcile(monitor.state, sudoOk);
  } finally {
    if (policy.reason) await setCaffeinate(false);
  }
}

function scheduleRefresh(): void {
  if (initialized && !quitting) void enqueue(reconcile);
}
monitor.subscribe(scheduleRefresh);

function handleMenuClick(id: string | undefined): void {
  if (id === "quit") {
    void quit();
    return;
  }
  void enqueue(async () => {
    if (id === "setup-sudo") {
      sudoOk = await installSudoers();
      await reconcile();
      return;
    }
    if (id === "toggle-launch-at-login") {
      await launchAtLogin.setEnabled(!(await launchAtLogin.isEnabled()));
      return;
    }
    await reconcile();
    const s = await readState();
    if (s.blocked && !s.caffeinate && !s.pmset) return;
    if (id === "toggle-caffeinate") {
      if (!s.blocked || s.caffeinate) await setCaffeinate(!s.caffeinate);
    } else if (id === "toggle-pmset" || id === "toggle-all") {
      const on = id === "toggle-all" ? !(s.pmset || s.caffeinate) : !s.pmset;
      if (on && s.blocked) return;
      if (on && !sudoOk) {
        sudoOk = await installSudoers();
        if (!sudoOk) return;
        // The administrator dialog can take long enough for power to change.
        await reconcile();
        if ((await readState()).blocked) return;
      }
      await policy.setModafinilate(on);
      if (id === "toggle-all") await setCaffeinate(on);
    }
  });
}

async function quit(): Promise<void> {
  if (quitting) return;
  quitting = true;
  if (fallback !== undefined) clearInterval(fallback);
  await work;
  stopLidBrightness();
  try {
    await setCaffeinate(false);
    await settings.restore();
  } catch (error) {
    logErr(error);
  }
  try {
    await monitor.close();
  } catch (error) {
    logErr(error);
  }
  try {
    tray.destroy();
  } catch (error) {
    logErr(error);
  }
  Deno.exit(0);
}

tray.addEventListener("menuclick", (e) => {
  handleMenuClick((e as CustomEvent<{ id: string }>).detail.id);
});

await launchAtLogin.updateRegistration();
const initialSettings = await settings.read();
energyKey = initialSettings.powermode !== undefined
  ? "powermode"
  : "lowpowermode";
sudoOk = await sudoConfigured();
try {
  await settings.recover();
} catch (error) {
  recoveryPending = true;
  logErr(error);
}
initialized = true;
await enqueue(reconcile);
// Notifications handle power/lid changes immediately. Reconcile once a minute
// for external pmset/login edits and transient recovery failures.
fallback = setInterval(() => {
  void monitor.refresh().catch(logErr);
  void enqueue(async () => {
    sudoOk = await sudoConfigured();
    await reconcile();
  });
}, 60_000);
console.log(
  `${APP_NAME} running, event-driven power monitoring, cutoff 8%, sudo ${
    sudoOk ? "ok" : "not configured"
  }`,
);
