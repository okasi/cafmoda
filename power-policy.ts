export interface PowerState {
  batteryPresent: boolean;
  onBattery: boolean;
  percent: number | null;
  lidClosed: boolean | null;
  lowPowerMode: boolean;
}

export type SettingKey =
  | "sleep"
  | "disablesleep"
  | "lowpowermode"
  | "powermode";
export type Settings = Partial<Record<SettingKey, number>>;
export interface Change {
  key: SettingKey;
  before: number;
  after: number;
}
export interface Journal {
  version: 1;
  changes: Change[];
}
export interface PowerBackend {
  read(): Promise<Settings>;
  write(key: SettingKey, value: number): Promise<void>;
  save(journal: Journal): Promise<void>;
  load(): Promise<Journal>;
}

export function parseJournal(value: unknown): Journal {
  const journal = value as Journal;
  if (journal?.version !== 1 || !Array.isArray(journal.changes)) {
    throw new Error("Invalid power recovery journal");
  }
  const keys = new Set<string>();
  for (const change of journal.changes) {
    if (
      !change ||
      !["sleep", "disablesleep", "lowpowermode", "powermode"].includes(
        change.key,
      ) ||
      keys.has(change.key) ||
      ![change.before, change.after].every((n) =>
        Number.isSafeInteger(n) && n >= 0 &&
        n <=
          (change.key === "sleep"
            ? 2147483647
            : change.key === "powermode"
            ? 2
            : 1)
      )
    ) throw new Error("Invalid power recovery change");
    keys.add(change.key);
  }
  return { version: 1, changes: journal.changes.map((c) => ({ ...c })) };
}

export function parseSettings(global: string, custom: string): Settings {
  const battery = custom.split("Battery Power:")[1]?.split("AC Power:")[0] ??
    "";
  const value = (text: string, key: string) => {
    const match = text.match(new RegExp(`^\\s*${key}\\s+(\\d+)(?:\\s|$)`, "m"));
    return match ? Number(match[1]) : undefined;
  };
  return {
    sleep: value(battery, "sleep"),
    disablesleep: value(global, "SleepDisabled"),
    lowpowermode: value(battery, "lowpowermode"),
    powermode: value(battery, "powermode"),
  };
}

// Only owned mutations are reversed. If another writer changed a value, keep
// its choice and discard our obsolete recovery entry.
export class PowerSettings {
  #changes: Change[] = [];
  #loadFailed = false;
  constructor(private backend: PowerBackend) {}

  get changes(): readonly Change[] {
    return this.#changes;
  }
  read(): Promise<Settings> {
    return this.backend.read();
  }

  async recover(): Promise<void> {
    try {
      this.#changes = parseJournal(await this.backend.load()).changes;
      this.#loadFailed = false;
    } catch (error) {
      this.#loadFailed = true;
      throw error;
    }
    await this.restore();
  }

  async set(key: SettingKey, after: number): Promise<void> {
    if (this.#loadFailed) {
      throw new Error(
        "Repair the unreadable recovery journal before changing settings",
      );
    }
    const current = (await this.backend.read())[key];
    if (current === undefined) {
      throw new Error(`Cannot read ${key}; no settings changed`);
    }
    if (current === after) return;
    const existing = this.#changes.find((c) => c.key === key);
    if (existing) throw new Error(`Pending ${key} restoration`);
    const change = { key, before: current, after };
    this.#changes.push(change);
    // Durable intent precedes the write, including writes that partially fail.
    try {
      await this.persist();
    } catch (error) {
      this.#changes.pop();
      throw error;
    }
    await this.backend.write(key, after);
    if ((await this.backend.read())[key] !== after) {
      throw new Error(`Could not confirm ${key}`);
    }
  }

  async restore(keys?: SettingKey[]): Promise<void> {
    const errors: unknown[] = [];
    for (const change of [...this.#changes].reverse()) {
      if (keys && !keys.includes(change.key)) continue;
      try {
        const current = (await this.backend.read())[change.key];
        if (current === undefined) {
          throw new Error(`Cannot read ${change.key} for recovery`);
        }
        if (current === change.after) {
          await this.backend.write(change.key, change.before);
          if ((await this.backend.read())[change.key] !== change.before) {
            throw new Error(`Could not restore ${change.key}`);
          }
        }
        const remaining = this.#changes.filter((c) => c !== change);
        await this.backend.save({ version: 1, changes: remaining });
        this.#changes = remaining;
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Power settings recovery pending");
    }
  }

  private persist(): Promise<void> {
    return this.backend.save({ version: 1, changes: this.#changes });
  }
}

export function stopReason(
  power: PowerState,
  ownsLowPower: boolean,
): string | null {
  if (power.onBattery && (power.percent === null || power.percent <= 8)) {
    return power.percent === null
      ? "Battery level unavailable"
      : "Stopped at 8% battery";
  }
  if (power.lowPowerMode && !ownsLowPower) {
    return "Respecting your Low Power Mode";
  }
  return null;
}

export class PowerPolicy {
  modafinilate = false;
  reason: string | null = null;
  #autoSuppressed = false;

  constructor(readonly settings: PowerSettings) {}

  async setModafinilate(on: boolean): Promise<void> {
    if (!on) {
      this.modafinilate = false;
      await this.settings.restore(["sleep", "disablesleep"]);
      return;
    }
    try {
      await this.settings.set("sleep", 0);
      await this.settings.set("disablesleep", 1);
      this.modafinilate = true;
    } catch (error) {
      this.modafinilate = false;
      await this.settings.restore(["sleep", "disablesleep"]);
      throw error;
    }
  }

  async reconcile(power: PowerState, canSetLowPower: boolean): Promise<void> {
    const closedOnBattery = power.onBattery && power.lidClosed === true;
    if (!power.onBattery || power.lidClosed === false) {
      this.#autoSuppressed = false;
    }
    let energy = this.settings.changes.find((c) =>
      c.key === "lowpowermode" || c.key === "powermode"
    );
    if (energy) {
      const live = (await this.settings.read())[energy.key];
      if (live !== energy.after) {
        // A user override wins for the remainder of this lid/power cycle.
        await this.settings.restore([energy.key]);
        this.#autoSuppressed = true;
        energy = undefined;
      }
    }
    this.reason = stopReason(power, !!energy && power.onBattery);
    if (this.reason) await this.setModafinilate(false);
    if (!power.onBattery || power.lidClosed === false) {
      await this.settings.restore(["lowpowermode", "powermode"]);
    } else if (
      closedOnBattery && canSetLowPower && !this.#autoSuppressed && !energy &&
      !power.lowPowerMode
    ) {
      const live = await this.settings.read();
      const key = live.powermode !== undefined ? "powermode" : "lowpowermode";
      if (live[key] !== undefined) await this.settings.set(key, 1);
    }
  }
}
