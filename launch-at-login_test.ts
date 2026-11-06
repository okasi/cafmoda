import assert from "node:assert/strict";
import { LaunchAtLogin } from "./launch-at-login.ts";

async function withHome(test: (home: string) => Promise<void>): Promise<void> {
  const home = await Deno.makeTempDir({ prefix: "cafmoda-login-test-" });
  try {
    await test(home);
  } finally {
    await Deno.remove(home, { recursive: true });
  }
}

async function makeApp(path: string): Promise<void> {
  await Deno.mkdir(`${path}/Contents/MacOS`, { recursive: true });
  await Deno.writeTextFile(`${path}/Contents/MacOS/laufey_webview`, "");
}

Deno.test("login startup persists and produces a valid plist for the outer app", async () => {
  await withHome(async (home) => {
    const app = `${home}/Apps & <tools> "quoted" 'single' $(literal).app`;
    await makeApp(app);
    const login = new LaunchAtLogin(home, app);
    assert.equal(login.available, true);
    assert.equal(await login.isEnabled(), false);

    await login.setEnabled(true);
    const path = `${home}/Library/LaunchAgents/dev.osim.cafmoda.login.plist`;
    const result = await new Deno.Command("/usr/bin/plutil", {
      args: ["-convert", "json", "-o", "-", "--", path],
      stdout: "piped",
      stderr: "piped",
    }).output();
    assert.equal(result.code, 0, new TextDecoder().decode(result.stderr));
    const plist = JSON.parse(new TextDecoder().decode(result.stdout));
    assert.deepEqual(plist, {
      Label: "dev.osim.cafmoda.login",
      ProgramArguments: ["/usr/bin/open", "-g", app],
      RunAtLoad: true,
      LimitLoadToSessionType: "Aqua",
    });
    assert.equal(await new LaunchAtLogin(home, app).isEnabled(), true);
    assert.equal((await Deno.stat(path)).mode! & 0o777, 0o600);

    await login.setEnabled(true);
    const entries = Array.fromAsync(
      Deno.readDir(`${home}/Library/LaunchAgents`),
    );
    assert.equal((await entries).length, 1);
  });
});

Deno.test("disabling survives restart and preserves other login agents", async () => {
  await withHome(async (home) => {
    const app = `${home}/Cafmoda.app`;
    await makeApp(app);
    const login = new LaunchAtLogin(home, app);
    await login.setEnabled(false);
    await login.setEnabled(true);
    const other = `${home}/Library/LaunchAgents/other.plist`;
    await Deno.writeTextFile(other, "unrelated");
    await login.setEnabled(false);
    await login.setEnabled(false);
    assert.equal(await new LaunchAtLogin(home, app).isEnabled(), false);
    assert.equal(await Deno.readTextFile(other), "unrelated");
  });
});

Deno.test("development and missing bundles cannot create login startup entries", async () => {
  await withHome(async (home) => {
    for (const app of [undefined, "relative/Cafmoda.app", `${home}/runtime`]) {
      const login = new LaunchAtLogin(home, app);
      assert.equal(login.available, false);
      await assert.rejects(() => login.setEnabled(true));
      assert.equal(await login.isEnabled(), false);
    }
    const missing = new LaunchAtLogin(home, `${home}/Missing.app`);
    await assert.rejects(() => missing.setEnabled(true), Deno.errors.NotFound);
    assert.equal(await missing.isEnabled(), false);
  });
});
