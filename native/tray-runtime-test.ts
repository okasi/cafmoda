import { NativeTray } from "../tray-menu.ts";

Deno.dock.setVisible(false);
const keepAlive = new Deno.BrowserWindow({
  frameless: true,
  opacity: 0,
  width: 2,
  height: 2,
});
keepAlive.show();
const tray = await NativeTray.create();
const icon = await Deno.readFile(
  new URL("../icons/tray-00.png", import.meta.url),
);
tray.setIcon(icon);
let callbacks = 0;
tray.addEventListener("menuclick", (event) => {
  const id = (event as CustomEvent<{ id: string }>).detail.id;
  if (id !== "test-toggle") throw new Error(`Unexpected menu action: ${id}`);
  callbacks++;
});
tray.setMenu([
  { item: { label: "Cafmoda integration test", enabled: false } },
  "separator",
  {
    item: {
      label: "Test Toggle",
      id: "test-toggle",
      enabled: true,
      checked: true,
    },
  },
]);
const result = Deno.env.get("CAFMODA_TRAY_TEST_RESULT")!;
const timer = setInterval(async () => {
  if (callbacks !== 6) return;
  const nativeResult = await Deno.readTextFile(result).catch(() => "");
  if (nativeResult !== "native menu cycles passed") return;
  clearInterval(timer);
  tray.destroy();
  console.log(
    "PASS: packaged Deno runtime opened both native menus 3 times; all 6 callbacks reached TypeScript; same position; foreground unchanged",
  );
  Deno.exit(0);
}, 100);
setTimeout(() => {
  console.error(
    `FAIL: native tray runtime test timed out after ${callbacks} callbacks`,
  );
  Deno.exit(1);
}, 15000);
