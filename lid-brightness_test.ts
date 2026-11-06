import assert from "node:assert/strict";
import { type BrightnessBackend, LidBrightness } from "./lid-brightness.ts";

class Display implements BrightnessBackend {
  closed: boolean | null = false;
  display: number | null = 42;
  brightness: number | null = 0.7;
  writable = true;
  writes: [number, number][] = [];
  lidClosed = () => this.closed;
  builtinDisplay = () => this.display;
  getBrightness = (_display: number) => this.brightness;
  setBrightness(display: number, brightness: number): boolean {
    this.writes.push([display, brightness]);
    if (!this.writable) return false;
    this.brightness = brightness;
    return true;
  }
}

Deno.test("lid close dims once and reopening restores the last open-lid level", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  controller.poll();
  assert.deepEqual(display.writes, []);
  display.brightness = 0.4; // Track user adjustments while the lid is open.
  controller.poll();
  display.closed = true;
  controller.poll();
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0]]);
  display.closed = false;
  controller.poll();
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0], [42, 0.4]]);
});

Deno.test("system dimming during lid closure does not replace the saved level", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  controller.poll();
  display.closed = true;
  display.brightness = 0;
  controller.poll();
  display.closed = false;
  controller.poll();
  assert.equal(display.brightness, 0.7);
});

Deno.test("cached built-in display survives going offline on lid close", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  controller.poll();
  display.closed = true;
  display.display = null;
  display.brightness = null;
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0]]);
  // Display IDs can change when the panel comes back online.
  display.display = 43;
  display.closed = false;
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0], [43, 0.7]]);
});

Deno.test("starting with a closed lid saves brightness before dimming", () => {
  const display = new Display();
  display.closed = true;
  const controller = new LidBrightness(display);
  controller.poll();
  controller.restore(); // Quitting while closed also restores brightness.
  controller.restore();
  assert.deepEqual(display.writes, [[42, 0], [42, 0.7]]);
});

Deno.test("missing internal display or unreadable brightness never causes a write", () => {
  const display = new Display();
  display.closed = true;
  display.display = null; // An external-only setup must stay untouched.
  const controller = new LidBrightness(display);
  controller.poll();
  display.display = 42;
  display.brightness = null;
  controller.poll();
  controller.restore();
  assert.deepEqual(display.writes, []);
});

Deno.test("unknown lid state neither dims nor prematurely restores", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  display.closed = null;
  controller.poll();
  assert.deepEqual(display.writes, []);
  display.closed = true;
  controller.poll();
  display.closed = null;
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0]]);
  display.closed = false;
  controller.poll();
  assert.equal(display.brightness, 0.7);
});

Deno.test("failed dim and restore retain the original level for retries", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  display.closed = true;
  display.writable = false;
  assert.throws(() => controller.poll(), /Could not dim/);
  display.writable = true;
  controller.poll();
  display.closed = false;
  display.writable = false;
  assert.throws(() => controller.poll(), /Could not restore/);
  assert.equal(display.brightness, 0);
  display.writable = true;
  controller.poll();
  assert.equal(display.brightness, 0.7);
});

Deno.test("wake while closed re-dims without replacing the saved brightness", () => {
  const display = new Display();
  const controller = new LidBrightness(display);
  display.closed = true;
  controller.poll();
  display.brightness = 0.2; // System wake or another brightness controller.
  controller.poll();
  display.closed = false;
  controller.poll();
  assert.deepEqual(display.writes, [[42, 0], [42, 0], [42, 0.7]]);
  display.brightness = 0.5;
  controller.poll();
  display.closed = true;
  controller.poll();
  display.closed = false;
  controller.poll();
  assert.equal(display.brightness, 0.5);
});

Deno.test("an original brightness of zero is preserved", () => {
  const display = new Display();
  display.brightness = 0;
  display.closed = true;
  const controller = new LidBrightness(display);
  controller.poll();
  display.closed = false;
  controller.poll();
  assert.equal(display.brightness, 0);
});
