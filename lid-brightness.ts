export interface BrightnessBackend {
  lidClosed(): boolean | null;
  builtinDisplay(): number | null;
  getBrightness(display: number): number | null;
  setBrightness(display: number, brightness: number): boolean;
}

// Keep the last open-lid sample: macOS can remove the built-in display from
// the online list before we observe the lid closing.
export class LidBrightness {
  #saved: { display: number; brightness: number } | null = null;
  #dimmed = false;

  constructor(private readonly backend: BrightnessBackend) {}

  poll(): void {
    const closed = this.backend.lidClosed();
    if (closed === null) return;
    const display = this.backend.builtinDisplay() ?? this.#saved?.display;
    if (!closed) {
      this.restore();
      if (display) {
        const brightness = this.backend.getBrightness(display);
        if (brightness !== null) this.#saved = { display, brightness };
      }
      return;
    }
    if (!display) return;
    if (!this.#dimmed) {
      // Prefer the open-lid sample: the system may already have dimmed the
      // panel by the time the closed state becomes visible. Read while closed
      // only when Cafmoda started with the lid shut and has no prior sample.
      const brightness = this.#saved?.display === display
        ? this.#saved.brightness
        : this.backend.getBrightness(display);
      // Do not dim unless there is a known level to restore.
      if (brightness === null) return;
      this.#saved = { display, brightness };
      this.#dimmed = true;
    } else if (this.backend.getBrightness(display) === 0) {
      return;
    }
    if (!this.backend.setBrightness(display, 0)) {
      throw new Error("Could not dim the built-in display; will retry");
    }
  }

  restore(): void {
    if (!this.#dimmed || !this.#saved) return;
    const display = this.backend.builtinDisplay() ?? this.#saved.display;
    if (!this.backend.setBrightness(display, this.#saved.brightness)) {
      // Retain the original level across failed writes and display wake-up.
      throw new Error(
        "Could not restore built-in display brightness; will retry",
      );
    }
    this.#dimmed = false;
    this.#saved = null;
  }
}

const symbols = {
  cafmoda_brightness_available: { parameters: [], result: "i32" },
  cafmoda_lid_closed: { parameters: [], result: "i32" },
  cafmoda_builtin_display: { parameters: [], result: "u32" },
  cafmoda_get_brightness: { parameters: ["u32", "buffer"], result: "i32" },
  cafmoda_set_brightness: { parameters: ["u32", "f32"], result: "i32" },
} as const;

export async function watchLidBrightness(
  onError: (error: unknown) => void,
  subscribe?: (listener: () => void) => () => void,
): Promise<() => void> {
  const bytes = await Deno.readFile(
    new URL("./native/lid-brightness.dylib", import.meta.url),
  );
  const directory = await Deno.makeTempDir({ prefix: "cafmoda-brightness-" });
  let library: Deno.DynamicLibrary<typeof symbols>;
  try {
    const path = `${directory}/lid-brightness.dylib`;
    await Deno.writeFile(path, bytes, { mode: 0o500 });
    library = Deno.dlopen(path, symbols);
  } finally {
    await Deno.remove(directory, { recursive: true });
  }
  const native = library.symbols;
  if (native.cafmoda_brightness_available() !== 1) {
    library.close();
    throw new Error("Lid dimming unavailable: macOS brightness APIs not found");
  }
  const controller = new LidBrightness({
    lidClosed() {
      const state = native.cafmoda_lid_closed();
      return state < 0 ? null : state === 1;
    },
    builtinDisplay: () => native.cafmoda_builtin_display() || null,
    getBrightness(display) {
      const value = new Float32Array(1);
      return native.cafmoda_get_brightness(display, value) === 1
        ? value[0]
        : null;
    },
    setBrightness: (display, brightness) =>
      native.cafmoda_set_brightness(display, brightness) === 1,
  });
  let lastError = "";
  const poll = () => {
    try {
      controller.poll();
      lastError = "";
    } catch (error) {
      if (String(error) !== lastError) onError(error);
      lastError = String(error);
    }
  };
  poll();
  // Lid/power notifications drive updates. A slow fallback samples brightness
  // and retries failed writes; no half-second wakeups while the app is idle.
  const unsubscribe = subscribe?.(poll);
  const timer = setInterval(poll, 30_000);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    unsubscribe?.();
    clearInterval(timer);
    try {
      controller.restore();
    } catch (error) {
      onError(error);
    } finally {
      library.close();
    }
  };
}
