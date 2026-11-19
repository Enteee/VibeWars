import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import { DEFAULT_KEYMAP, KEYMAP_PRESETS, type Keymap } from "../input/keymap.js";

import { controlsSection, KeysEditor, noKeyWarning, type KeyPress } from "./controls-section.js";
import { FakeElement } from "./fake-dom.test-support.js";

function key(code: string, held: Partial<Omit<KeyPress, "code">> = {}): KeyPress {
  return { code, ctrlKey: false, altKey: false, metaKey: false, ...held };
}

function editor(map: Keymap = KEYMAP_PRESETS.vibewars): {
  readonly editor: KeysEditor;
  readonly save: ReturnType<typeof vi.fn<(map: Keymap) => void>>;
} {
  const save = vi.fn<(map: Keymap) => void>();
  return { editor: new KeysEditor(map, save), save };
}

const SKILL_1 = { action: "skill-1", index: 0 } as const;

describe("KeysEditor (#309)", () => {
  it("binds the next key a waiting cell hears, and saves it", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.cellText(SKILL_1)).toBe(t("controls.pressAKey"));

    expect(keys.press(key("KeyZ"))).toBe(true);
    expect(keys.map["skill-1"]).toEqual(["KeyZ"]);
    expect(keys.capturing).toBeUndefined();
    expect(keys.cellText(SKILL_1)).toBe("Z");
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenLastCalledWith(keys.map);
  });

  it("cancels on Esc and leaves the cell as it was", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("Escape"))).toBe(true);
    expect(keys.capturing).toBeUndefined();
    expect(keys.map).toBe(KEYMAP_PRESETS.vibewars);
    expect(save).not.toHaveBeenCalled();
  });

  it.each(["Backspace", "Delete"])("clears the cell on %s", (code) => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key(code))).toBe(true);
    expect(keys.map["skill-1"]).toEqual([]);
    expect(keys.cellText(SKILL_1)).toBe("-");
    expect(save).toHaveBeenCalledOnce();
  });

  it("refuses Ctrl+Z with the reason, and keeps waiting", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("KeyZ", { ctrlKey: true }))).toBe(false);
    expect(keys.line).toBe(t("controls.shortcutRefusal"));
    expect(keys.capturing).toEqual(SKILL_1);
    expect(save).not.toHaveBeenCalled();

    // The Enter a refused press lets through clicks the cell again; the
    // reason stays.
    keys.startCapture(SKILL_1);
    expect(keys.line).toBe(t("controls.shortcutRefusal"));
  });

  it("refuses a modifier key on its own, Alt and Meta as Ctrl", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    for (const press of [
      key("ControlLeft", { ctrlKey: true }),
      key("KeyQ", { altKey: true }),
      key("MetaLeft"),
    ]) {
      expect(keys.press(press)).toBe(false);
      expect(keys.line).toBe(t("controls.shortcutRefusal"));
    }
    expect(keys.capturing).toEqual(SKILL_1);
  });

  it("refuses F5: the browser's", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("F5"))).toBe(false);
    expect(keys.line).toBe(t("controls.browserKey", { key: "F5" }));
    expect(keys.capturing).toEqual(SKILL_1);
    expect(save).not.toHaveBeenCalled();
  });

  it("binds Shift and Tab, which are game keys", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("Tab"))).toBe(true);
    expect(keys.map["skill-1"]).toEqual(["Tab"]);
    keys.startCapture(SKILL_1);
    expect(keys.press(key("ShiftLeft"))).toBe(true);
    expect(keys.map["skill-1"]).toEqual(["ShiftLeft"]);
  });

  it("moves Q off Skill 1 when Skill 2 takes it, flashes the emptied cell and says so", () => {
    const { editor: keys } = editor();
    keys.startCapture({ action: "skill-2", index: 0 });
    keys.press(key("KeyQ"));
    expect(keys.map["skill-2"]).toEqual(["KeyQ"]);
    expect(keys.map["skill-1"]).toEqual([]);
    expect(keys.flashed).toEqual(SKILL_1);
    expect(keys.line).toBe(
      t("controls.displacedNoKey", { key: "Q", action: t("controls.skill1") }),
    );
  });

  it("says what a displaced action keeps, when it had a second key", () => {
    const { editor: keys } = editor(KEYMAP_PRESETS.classic);
    keys.startCapture(SKILL_1);
    keys.press(key("KeyW"));
    expect(keys.map["move-up"]).toEqual(["ArrowUp"]);
    expect(keys.flashed).toEqual({ action: "move-up", index: 0 });
    expect(keys.line).toBe(
      t("controls.displacedKeeps", { key: "W", action: t("controls.moveUp"), left: "↑" }),
    );
  });

  it("replaces the whole map with a preset, and reads Custom once edited", () => {
    const { editor: keys, save } = editor(DEFAULT_KEYMAP);
    expect(keys.preset).toBe("classic");
    keys.choosePreset("vibewars");
    expect(keys.map).toBe(KEYMAP_PRESETS.vibewars);
    expect(keys.preset).toBe("vibewars");

    keys.startCapture(SKILL_1);
    keys.press(key("KeyZ"));
    expect(keys.preset).toBe("custom");

    // Picking the preset again is how its keys come back (#3631).
    keys.choosePreset("vibewars");
    expect(keys.map).toBe(KEYMAP_PRESETS.vibewars);
    expect(save.mock.calls.map(([map]) => map)).toEqual([
      KEYMAP_PRESETS.vibewars,
      expect.objectContaining({ "skill-1": ["KeyZ"] }),
      KEYMAP_PRESETS.vibewars,
    ]);
  });

  it("brings Classic back from a custom map by picking it (#3631)", () => {
    const { editor: keys } = editor(KEYMAP_PRESETS.classic);
    keys.startCapture(SKILL_1);
    keys.press(key("KeyZ"));
    expect(keys.preset).toBe("custom");

    keys.choosePreset("classic");
    expect(keys.map).toBe(KEYMAP_PRESETS.classic);
    expect(keys.preset).toBe("classic");
  });

  it("ignores keys while no cell waits", () => {
    const { editor: keys, save } = editor();
    expect(keys.press(key("KeyZ"))).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("labels keys by the layout once it is known", () => {
    const { editor: keys } = editor();
    keys.label = (code) => (code === "KeyQ" ? "A" : code);
    expect(keys.cellText(SKILL_1)).toBe("A");
  });
});

describe("KeysEditor's Previous target (#3630)", () => {
  it("reads Shift with each Next target key, and no key where Shift cannot go", () => {
    const { editor: keys } = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": ["Tab", "KeyX"] });
    expect(keys.previousTargetText(0)).toBe(t("controls.withShift", { key: "Tab" }));
    expect(keys.previousTargetText(1)).toBe(t("controls.withShift", { key: "X" }));

    const one = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": ["Tab"] }).editor;
    expect(one.previousTargetText(1)).toBe("");
    const none = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": [] }).editor;
    expect(none.previousTargetText(0)).toBe(t("controls.noKey"));
    const shift = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": ["ShiftLeft"] }).editor;
    expect(shift.previousTargetText(0)).toBe(t("controls.noKey"));
  });
});

describe("noKeyWarning (#309)", () => {
  it("warns on a skill or move with no key, and says how to move without one", () => {
    const empty: Keymap = { ...DEFAULT_KEYMAP, "skill-3": [], "move-up": [], mute: [] };
    expect(noKeyWarning(empty, "skill-3")).toBe(t("controls.noKey"));
    expect(noKeyWarning(empty, "move-up")).toBe(t("controls.noKeyWalk"));
    expect(noKeyWarning(empty, "mute")).toBe("");
    expect(noKeyWarning(empty, "skill-1")).toBe("");
  });
});

describe("Options > Controls (#3631)", () => {
  /** A fake element that remembers which tag made it. */
  class TaggedElement extends FakeElement {
    readonly tag: string;
    constructor(tag: string) {
      super();
      this.tag = tag;
    }
  }
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new TaggedElement(tag) });
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Every button under `element` that is not inside the keys table. */
  const loose = (element: FakeElement): FakeElement[] =>
    element.children.flatMap((child) =>
      child.classList.contains("keys-table")
        ? []
        : [
            ...(child instanceof TaggedElement && child.tag === "button" ? [child] : []),
            ...loose(child),
          ],
    );

  it("has no reset button: the preset picker is the only way back to a preset", () => {
    const container = new FakeElement();
    const unmount = controlsSection.mount(container as unknown as HTMLElement);
    expect(container.all("keys-table")).toHaveLength(1);
    expect(container.all("keys-preset")).toHaveLength(1);
    expect(loose(container)).toEqual([]);
    unmount();
  });

  /** `value`, which the test needs to be there. */
  const present = <T>(value: T | undefined): T => {
    if (value === undefined) {
      throw new Error("missing");
    }
    return value;
  };

  /** The keys table's rows, each as its action's name and its cells' text. */
  const rows = (container: FakeElement): string[][] =>
    container
      .all("keys-action")
      .map((name) => [
        name.textContent,
        ...(name.parent?.children ?? [])
          .filter((cell) => cell.classList.contains("key-cell"))
          .map((cell) => cell.textContent),
      ]);

  it("shows Previous target under Next target, as Shift with its key, and it follows a rebind (#3630)", () => {
    const container = new FakeElement();
    const unmount = controlsSection.mount(container as unknown as HTMLElement);
    const names = rows(container).map(([name]) => name);
    const next = names.indexOf(t("controls.targetNext"));
    expect(names[next + 1]).toBe(t("controls.targetPrevious"));
    const previous = (): string[] | undefined => rows(container)[next + 1];
    expect(previous()).toEqual([
      t("controls.targetPrevious"),
      t("controls.withShift", { key: "Tab" }),
      "",
    ]);
    // Not a key of its own: no capture buttons, and a click starts nothing.
    const row = present(present(container.all("keys-action")[next + 1]).parent);
    expect(row.classList.contains("is-fixed")).toBe(true);
    expect(row.all("key-cell").every((cell) => cell.dataset.action === undefined)).toBe(true);
    row.click();
    expect(container.all("is-capturing")).toEqual([]);

    // Next target rebound to X: the row says Shift + X at once.
    const nextButton = present(
      container
        .all("key-cell")
        .find((cell) => cell.dataset.action === "target-next" && cell.dataset.index === "0"),
    );
    nextButton.click();
    const [keydown] = present(container.all("keys-screen")[0]).listeners.get("keydown") ?? [];
    present(keydown)({
      ...key("KeyX"),
      key: "x",
      target: nextButton,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    });
    expect(previous()?.[1]).toBe(t("controls.withShift", { key: "X" }));
    unmount();
  });
});
