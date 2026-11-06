const LABEL = "dev.osim.cafmoda.login";

function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[
        char
      ]!,
  );
}

export class LaunchAtLogin {
  readonly #directory: string;
  readonly #path: string;
  readonly #appPath: string | undefined;

  constructor(home: string, appPath: string | undefined) {
    this.#directory = `${home}/Library/LaunchAgents`;
    this.#path = `${this.#directory}/${LABEL}.plist`;
    // The packaged launcher supplies the outer bundle, rather than the
    // extracted runtime in a version-specific cache. HMR has no app bundle.
    this.#appPath = appPath?.startsWith("/") && appPath.endsWith(".app")
      ? appPath
      : undefined;
  }

  get available(): boolean {
    return this.#appPath !== undefined;
  }

  async isEnabled(): Promise<boolean> {
    try {
      return (await Deno.stat(this.#path)).isFile;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) return false;
      throw error;
    }
  }

  async updateRegistration(): Promise<void> {
    // Preserve the user's choice while replacing legacy /usr/bin/open entries
    // and keeping the login helper pointed at the current installed bundle.
    if (this.available && await this.isEnabled()) await this.setEnabled(true);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) {
      try {
        await Deno.remove(this.#path);
      } catch (error) {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      }
      return;
    }
    if (!this.#appPath) {
      throw new Error("Launch at Login is available in the packaged app");
    }
    const helper = `${this.#appPath}/Contents/MacOS/cafmoda-anti-sleep`;
    await Deno.stat(helper);
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(helper)}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
</dict>
</plist>
`;
    await Deno.mkdir(this.#directory, { recursive: true });
    const temporary = await Deno.makeTempFile({ dir: this.#directory });
    try {
      await Deno.writeTextFile(temporary, plist, { mode: 0o600 });
      await Deno.rename(temporary, this.#path);
    } finally {
      await Deno.remove(temporary).catch((error) => {
        if (!(error instanceof Deno.errors.NotFound)) throw error;
      });
    }
  }
}
