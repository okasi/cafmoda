import assert from "node:assert/strict";
import {
  type Journal,
  parseJournal,
  parseSettings,
  type PowerBackend,
  PowerPolicy,
  PowerSettings,
  type PowerState,
  type SettingKey,
  type Settings,
  stopReason,
} from "./power-policy.ts";
import { powerBackend } from "./power-runtime.ts";

class Backend implements PowerBackend {
  values: Settings = { sleep: 17, disablesleep: 0, lowpowermode: 0 };
  journal: Journal = { version: 1, changes: [] };
  writes: [SettingKey, number][] = [];
  failWrite: SettingKey | null = null;
  failSave = false;
  ignoreWrite = false;
  read = () => Promise.resolve({ ...this.values });
  load = () => Promise.resolve(structuredClone(this.journal));
  async save(journal: Journal) {
    if (this.failSave) throw new Error("Disk unavailable");
    this.journal = structuredClone(journal);
  }
  async write(key: SettingKey, value: number) {
    assert(
      this.journal.changes.some((c) => c.key === key),
      "Durable intent before write",
    );
    if (this.failWrite === key) throw new Error("Permission denied");
    this.writes.push([key, value]);
    if (!this.ignoreWrite) this.values[key] = value;
  }
}
const power = (overrides: Partial<PowerState> = {}): PowerState => ({
  batteryPresent: true,
  onBattery: true,
  percent: 60,
  lidClosed: false,
  lowPowerMode: false,
  ...overrides,
});

Deno.test("Modafinilate restores exact sleep timer and global baseline", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  assert.deepEqual(backend.values, {
    sleep: 0,
    disablesleep: 1,
    lowpowermode: 0,
  });
  await policy.setModafinilate(false);
  assert.deepEqual(backend.values, {
    sleep: 17,
    disablesleep: 0,
    lowpowermode: 0,
  });
  assert.deepEqual(backend.journal.changes, []);
});

Deno.test("preexisting never-sleep settings are preserved without claiming ownership", async () => {
  const backend = new Backend();
  backend.values = { sleep: 0, disablesleep: 1, lowpowermode: 1 };
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  await policy.reconcile(
    power({ percent: 8, lidClosed: true, lowPowerMode: true }),
    true,
  );
  assert.equal(policy.modafinilate, false);
  assert.deepEqual(backend.values, {
    sleep: 0,
    disablesleep: 1,
    lowpowermode: 1,
  });
  assert.deepEqual(backend.writes, []);
});

Deno.test("cutoff is inclusive at 8%, applies on battery, and does not resume sessions", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  await policy.reconcile(power({ percent: 8.1 }), true);
  assert.equal(policy.modafinilate, true);
  await policy.reconcile(power({ percent: 8 }), true);
  assert.equal(policy.modafinilate, false);
  assert.equal(backend.values.sleep, 17);
  await policy.reconcile(power({ percent: 90 }), true);
  assert.equal(policy.modafinilate, false);
  assert.equal(
    stopReason(power({ percent: 1, onBattery: false }), false),
    null,
  );
  assert.equal(
    stopReason(power({ percent: null }), false),
    "Battery level unavailable",
  );
});

Deno.test("user-enabled Low Power Mode stops sessions without changing their energy setting", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  backend.values.lowpowermode = 1;
  await policy.reconcile(power({ lowPowerMode: true, lidClosed: true }), true);
  assert.equal(policy.modafinilate, false);
  assert.equal(policy.reason, "Respecting your Low Power Mode");
  assert.equal(backend.values.lowpowermode, 1);
  assert.equal(backend.writes.some(([key]) => key === "lowpowermode"), false);
});

Deno.test("closed lid on battery enables owned Low Power Mode without ending awake session", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  await policy.reconcile(power({ lidClosed: true }), true);
  assert.equal(backend.values.lowpowermode, 1);
  await policy.reconcile(power({ lidClosed: true, lowPowerMode: true }), true);
  assert.equal(policy.modafinilate, true);
  assert.equal(policy.reason, null);
  await policy.reconcile(power({ lidClosed: false, lowPowerMode: true }), true);
  assert.equal(backend.values.lowpowermode, 0);
});

Deno.test("connecting power restores only battery energy mode; AC Low Power Mode remains user-owned", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.setModafinilate(true);
  await policy.reconcile(power({ lidClosed: true }), true);
  await policy.reconcile(
    power({ onBattery: false, lidClosed: true, lowPowerMode: true }),
    true,
  );
  assert.equal(backend.values.lowpowermode, 0);
  assert.equal(policy.modafinilate, false);
  assert.equal(policy.reason, "Respecting your Low Power Mode");
});

Deno.test("modern powermode restores an original high-power value exactly", async () => {
  const backend = new Backend();
  backend.values = { sleep: 17, disablesleep: 0, powermode: 2 };
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.reconcile(power({ lidClosed: true }), true);
  assert.equal(backend.values.powermode, 1);
  await policy.reconcile(power({ onBattery: false, lidClosed: true }), true);
  assert.equal(backend.values.powermode, 2);
});

Deno.test("manual override of automatic Low Power Mode wins until lid opens or power changes", async () => {
  const backend = new Backend();
  const policy = new PowerPolicy(new PowerSettings(backend));
  await policy.reconcile(power({ lidClosed: true }), true);
  backend.values.lowpowermode = 0;
  await policy.reconcile(power({ lidClosed: true }), true);
  await policy.reconcile(power({ lidClosed: null }), true);
  await policy.reconcile(power({ lidClosed: true }), true);
  assert.equal(backend.values.lowpowermode, 0);
  await policy.reconcile(power({ lidClosed: false }), true);
  await policy.reconcile(power({ lidClosed: true }), true);
  assert.equal(backend.values.lowpowermode, 1);
});

Deno.test("no automatic energy mutation with unknown lid, no permission, or AC power", async () => {
  for (
    const [state, permission] of [
      [power({ lidClosed: null }), true],
      [power({ lidClosed: true }), false],
      [power({ lidClosed: true, onBattery: false }), true],
    ] as const
  ) {
    const backend = new Backend();
    await new PowerPolicy(new PowerSettings(backend)).reconcile(
      state,
      permission,
    );
    assert.deepEqual(backend.writes, []);
  }
});

Deno.test("partial enable failure rolls back the first write", async () => {
  const backend = new Backend();
  backend.failWrite = "disablesleep";
  const policy = new PowerPolicy(new PowerSettings(backend));
  await assert.rejects(() => policy.setModafinilate(true));
  assert.equal(backend.values.sleep, 17);
  assert.equal(policy.modafinilate, false);
  assert.deepEqual(backend.journal.changes, []);
});

Deno.test("failed restore keeps durable recovery and succeeds on a later launch", async () => {
  const backend = new Backend();
  const settings = new PowerSettings(backend);
  await settings.set("sleep", 0);
  backend.failWrite = "sleep";
  await assert.rejects(() => settings.restore());
  assert.equal(backend.journal.changes.length, 1);
  backend.failWrite = null;
  await new PowerSettings(backend).recover();
  assert.equal(backend.values.sleep, 17);
  assert.deepEqual(backend.journal.changes, []);
});

Deno.test("recovery preserves changes made by other writers", async () => {
  const backend = new Backend();
  const settings = new PowerSettings(backend);
  await settings.set("sleep", 0);
  backend.values.sleep = 42;
  await new PowerSettings(backend).recover();
  assert.equal(backend.values.sleep, 42);
  assert.deepEqual(backend.journal.changes, []);
});

Deno.test("unreadable restoration value retains journal rather than inventing defaults", async () => {
  const backend = new Backend();
  const settings = new PowerSettings(backend);
  await settings.set("sleep", 0);
  delete backend.values.sleep;
  await assert.rejects(() => settings.restore());
  assert.equal(backend.journal.changes.length, 1);
});

Deno.test("no power mutation unless recovery intent can be saved", async () => {
  const backend = new Backend();
  backend.failSave = true;
  const settings = new PowerSettings(backend);
  await assert.rejects(() => settings.set("sleep", 0));
  assert.deepEqual(backend.writes, []);
  assert.deepEqual(settings.changes, []);
});

Deno.test("writes must be verified", async () => {
  const backend = new Backend();
  backend.ignoreWrite = true;
  const settings = new PowerSettings(backend);
  await assert.rejects(() => settings.set("sleep", 0), /confirm sleep/);
  assert.equal(backend.journal.changes.length, 1);
  await settings.restore();
  assert.deepEqual(backend.journal.changes, []);
});

Deno.test("settings parser keeps battery and global scope separate", () => {
  assert.deepEqual(
    parseSettings(
      "SleepDisabled 1\n",
      "Battery Power:\n sleep 17\n lowpowermode 0\nAC Power:\n sleep 0\n lowpowermode 1",
    ),
    {
      sleep: 17,
      disablesleep: 1,
      lowpowermode: 0,
      powermode: undefined,
    },
  );
  assert.equal(parseSettings("", "AC Power:\n sleep 0").sleep, undefined);
});

Deno.test("recovery journal rejects malformed, duplicate and non-power commands", () => {
  for (
    const value of [
      null,
      {},
      { version: 2, changes: [] },
      { version: 1, changes: [{ key: "sleep", before: -1, after: 0 }] },
      { version: 1, changes: [{ key: "sleep", before: true, after: 0 }] },
      { version: 1, changes: [{ key: "sleep; reboot", before: 1, after: 0 }] },
      { version: 1, changes: [{ key: "powermode", before: 3, after: 1 }] },
      {
        version: 1,
        changes: [{ key: "sleep", before: 17, after: 0 }, {
          key: "sleep",
          before: 42,
          after: 0,
        }],
      },
    ]
  ) assert.throws(() => parseJournal(value));
});

Deno.test("disk journal survives a new backend instance and refuses corrupt data", async () => {
  const directory = await Deno.makeTempDir({ prefix: "cafmoda-power-test-" });
  try {
    const path = `${directory}/recovery.json`;
    const journal: Journal = {
      version: 1,
      changes: [{ key: "sleep", before: 17, after: 0 }],
    };
    await powerBackend(path).save(journal);
    assert.deepEqual(await powerBackend(path).load(), journal);
    await Deno.writeTextFile(path, "broken");
    await assert.rejects(() => powerBackend(path).load());
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("corrupt recovery data cannot be silently replaced by a new session", async () => {
  const backend = new Backend();
  backend.load = () =>
    Promise.resolve({ version: 7, changes: [] } as unknown as Journal);
  const settings = new PowerSettings(backend);
  await assert.rejects(() => settings.recover());
  await assert.rejects(
    () => settings.set("sleep", 0),
    /unreadable recovery journal/,
  );
  assert.deepEqual(backend.writes, []);
});
