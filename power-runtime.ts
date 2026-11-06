import {
  parseJournal,
  parseSettings,
  type PowerBackend,
  type PowerState,
  type SettingKey,
} from "./power-policy.ts";

export async function run(cmd: string, args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    env: { LC_ALL: "C" },
    stdout: "piped",
    stderr: "piped",
  }).output();
  return {
    ok: code === 0,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

export function powerBackend(
  path: string,
  writeSetting?: (key: SettingKey, value: number) => Promise<void>,
): PowerBackend {
  return {
    async read() {
      const [global, custom] = await Promise.all([
        run("/usr/bin/pmset", ["-g"]),
        run("/usr/bin/pmset", ["-g", "custom"]),
      ]);
      if (!global.ok || !custom.ok) {
        throw new Error("Cannot read power settings");
      }
      return parseSettings(global.out, custom.out);
    },
    async write(key: SettingKey, value: number) {
      if (writeSetting) return await writeSetting(key, value);
      const result = await run("/usr/bin/sudo", [
        "-n",
        "/usr/bin/pmset",
        "-b",
        key,
        String(value),
      ]);
      if (!result.ok) {
        throw new Error(`Cannot set ${key}: ${result.err.trim()}`);
      }
    },
    async load() {
      try {
        return parseJournal(JSON.parse(await Deno.readTextFile(path)));
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          return { version: 1, changes: [] };
        }
        throw error;
      }
    },
    async save(journal) {
      parseJournal(journal);
      const temporary = await Deno.makeTempFile({
        dir: path.slice(0, path.lastIndexOf("/")),
        prefix: ".power-",
      });
      try {
        const file = await Deno.open(temporary, {
          write: true,
          truncate: true,
          mode: 0o600,
        });
        try {
          const bytes = new TextEncoder().encode(JSON.stringify(journal));
          let offset = 0;
          while (offset < bytes.length) {
            offset += await file.write(bytes.subarray(offset));
          }
          await file.sync();
        } finally {
          file.close();
        }
        await Deno.rename(temporary, path);
      } finally {
        await Deno.remove(temporary).catch(() => {});
      }
    },
  };
}

export class PowerMonitor {
  state!: PowerState;
  available = true;
  #closing = false;
  #child: Deno.ChildProcess;
  #input: WritableStreamDefaultWriter<Uint8Array>;
  #listeners = new Set<() => void>();
  readonly ready: Promise<void>;
  readonly #path: string;
  readonly #journal: string;

  private constructor(
    path: string,
    journal: string,
    onError: (error: unknown) => void,
  ) {
    this.#path = path;
    this.#journal = journal;
    this.#child = new Deno.Command(path, {
      args: ["--watch", journal],
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const child = this.#child;
    this.#input = child.stdin.getWriter();
    let resolve!: () => void, reject!: (error: unknown) => void;
    this.ready = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void (async () => {
      try {
        let pending = "";
        for await (
          const chunk of child.stdout.pipeThrough(new TextDecoderStream())
        ) {
          pending += chunk;
          let end: number;
          while ((end = pending.indexOf("\n")) >= 0) {
            const state = JSON.parse(pending.slice(0, end));
            pending = pending.slice(end + 1);
            if (
              typeof state.onBattery !== "boolean" ||
              typeof state.lowPowerMode !== "boolean" ||
              typeof state.batteryPresent !== "boolean" ||
              !(state.lidClosed === null ||
                typeof state.lidClosed === "boolean") ||
              !(state.percent === null ||
                (Number.isFinite(state.percent) && state.percent >= 0 &&
                  state.percent <= 100))
            ) throw new Error("Invalid native power snapshot");
            this.state = state;
            resolve();
            for (const listener of this.#listeners) listener();
          }
        }
        if (!this.#closing) throw new Error("Native power monitor stopped");
      } catch (error) {
        this.available = false;
        reject(error);
        if (!this.#closing) {
          onError(error);
          for (const listener of this.#listeners) listener();
        }
      }
    })();
    void new Response(this.#child.stderr).text().then((text) => {
      if (text.trim()) onError(new Error(text.trim()));
    });
  }

  static async create(
    directory: string,
    journal: string,
    onError: (error: unknown) => void,
  ): Promise<PowerMonitor> {
    await Deno.mkdir(directory, { recursive: true, mode: 0o700 });
    const bytes = await Deno.readFile(
      new URL("./native/power-monitor", import.meta.url),
    );
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest, (n) => n.toString(16).padStart(2, "0"))
      .join("");
    const path = `${directory}/power-monitor-${hash}`;
    try {
      await Deno.writeFile(path, bytes, { createNew: true, mode: 0o700 });
    } catch (error) {
      if (!(error instanceof Deno.errors.AlreadyExists)) throw error;
    }
    const monitor = new PowerMonitor(path, journal, onError);
    await monitor.ready;
    return monitor;
  }

  subscribe = (listener: () => void): () => void => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  async refresh(): Promise<void> {
    if (this.available && !this.#closing) {
      await this.#input.write(new Uint8Array([10]));
    }
  }

  async write(key: SettingKey, value: number): Promise<void> {
    const result = await run(this.#path, [
      "--write",
      this.#journal,
      key,
      String(value),
    ]);
    if (!result.ok) throw new Error(`Cannot set ${key}: ${result.err.trim()}`);
  }

  async close(): Promise<void> {
    this.#closing = true;
    await this.#input.close().catch(() => {});
    const status = await this.#child.status;
    if (!status.success) {
      throw new Error("Native power recovery incomplete; journal retained");
    }
  }
}
