export type TrayMenuItem = "separator" | {
  item: {
    label: string;
    id?: string;
    enabled: boolean;
    checked?: boolean;
    tooltip?: string;
  };
};

const symbols = {
  cafmoda_tray_create: { parameters: ["function"], result: "i32" },
  cafmoda_tray_destroy: { parameters: [], result: "void" },
  cafmoda_tray_set_icon: {
    parameters: ["buffer", "u32", "i32"],
    result: "void",
  },
  cafmoda_tray_set_tooltip: { parameters: ["buffer"], result: "void" },
  cafmoda_tray_set_menu: { parameters: ["buffer"], result: "i32" },
} as const;
const clickSignature = { parameters: ["pointer"], result: "void" } as const;
const encoder = new TextEncoder();

export class NativeTray extends EventTarget {
  readonly #library: Deno.DynamicLibrary<typeof symbols>;
  readonly #callback: Deno.UnsafeCallback<typeof clickSignature>;

  private constructor(library: Deno.DynamicLibrary<typeof symbols>) {
    super();
    this.#library = library;
    this.#callback = Deno.UnsafeCallback.threadSafe(
      clickSignature,
      (pointer) => {
        if (!pointer) return;
        const id = new Deno.UnsafePointerView(pointer).getCString();
        // Return to AppKit before running actions that may synchronously use it.
        setTimeout(() =>
          this.dispatchEvent(
            new CustomEvent("menuclick", {
              detail: { id },
            }),
          ), 0);
      },
    );
    if (library.symbols.cafmoda_tray_create(this.#callback.pointer) !== 1) {
      this.#callback.close();
      throw new Error("Could not create the macOS menu bar item");
    }
  }

  static async create(): Promise<NativeTray> {
    const bytes = await Deno.readFile(
      new URL("./native/tray-menu.dylib", import.meta.url),
    );
    const directory = await Deno.makeTempDir({ prefix: "cafmoda-tray-" });
    try {
      const path = `${directory}/tray-menu.dylib`;
      await Deno.writeFile(path, bytes, { mode: 0o500 });
      return new NativeTray(Deno.dlopen(path, symbols));
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  }

  setIcon(bytes: Uint8Array): void {
    this.#library.symbols.cafmoda_tray_set_icon(bytes, bytes.length, 0);
  }

  setIconDark(bytes: Uint8Array): void {
    this.#library.symbols.cafmoda_tray_set_icon(bytes, bytes.length, 1);
  }

  setTooltip(text: string): void {
    this.#library.symbols.cafmoda_tray_set_tooltip(encoder.encode(text + "\0"));
  }

  setMenu(menu: TrayMenuItem[]): void {
    if (
      this.#library.symbols.cafmoda_tray_set_menu(
        encoder.encode(JSON.stringify(menu) + "\0"),
      ) !== 1
    ) throw new Error("Could not update the macOS tray menu");
  }

  destroy(): void {
    this.#library.symbols.cafmoda_tray_destroy();
    this.#callback.close();
    // Keep the library mapped: Objective-C classes outlive their instances.
  }
}
