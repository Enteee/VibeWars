import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import {
  DEFAULT_KEYMAP,
  KEYMAP_PRESETS,
  bindingLabel,
  type KeyBinding,
  type KeyPress,
  type Keymap,
  type Modifier,
} from "../input/keymap.js";

import { controlsSection, KeysEditor, noKeyWarning } from "./controls-section.js";
import { FakeElement } from "./fake-dom.test-support.js";

function key(code: string, held: Partial<Omit<KeyPress, "code">> = {}): KeyPress {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...held };
}

/** A binding: `code` with `mods` held. */
const bound = (code: string, ...mods: Modifier[]): KeyBinding => ({ code, mods });

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
    expect(keys.map["skill-1"]).toEqual([bound("KeyZ")]);
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

  it("refuses Meta+Z with the reason, and keeps waiting", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("KeyZ", { metaKey: true }))).toBe(false);
    expect(keys.line).toBe(t("controls.shortcutRefusal"));
    expect(keys.capturing).toEqual(SKILL_1);
    expect(save).not.toHaveBeenCalled();

    // The Enter a refused press lets through clicks the cell again; the
    // reason stays.
    keys.startCapture(SKILL_1);
    expect(keys.line).toBe(t("controls.shortcutRefusal"));
  });

  it("refuses Meta, alone or held with a key", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    for (const press of [key("MetaLeft", { metaKey: true }), key("KeyX", { metaKey: true })]) {
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
    expect(keys.map["skill-1"]).toEqual([bound("Tab")]);
    keys.startCapture(SKILL_1);
    expect(keys.press(key("ShiftLeft", { shiftKey: true }))).toBe(true);
    expect(keys.release(key("ShiftLeft"))).toBe(true);
    expect(keys.map["skill-1"]).toEqual([bound("ShiftLeft")]);
  });

  it("moves Q off Skill 1 when Skill 2 takes it, flashes the emptied cell and says so", () => {
    const { editor: keys } = editor();
    keys.startCapture({ action: "skill-2", index: 0 });
    keys.press(key("KeyQ"));
    expect(keys.map["skill-2"]).toEqual([bound("KeyQ")]);
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
    expect(keys.map["move-up"]).toEqual([bound("ArrowUp")]);
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
      expect.objectContaining({ "skill-1": [bound("KeyZ")] }),
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
    const { editor: keys } = editor({
      ...KEYMAP_PRESETS.vibewars,
      "target-next": [bound("Tab"), bound("KeyX")],
    });
    expect(keys.previousTargetText(0)).toBe(bindingLabel(bound("Tab", "shift")));
    expect(keys.previousTargetText(1)).toBe(bindingLabel(bound("KeyX", "shift")));

    const one = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": [bound("Tab")] }).editor;
    expect(one.previousTargetText(1)).toBe("");
    const none = editor({ ...KEYMAP_PRESETS.vibewars, "target-next": [] }).editor;
    expect(none.previousTargetText(0)).toBe(t("controls.noKey"));
    const shift = editor({
      ...KEYMAP_PRESETS.vibewars,
      "target-next": [bound("ShiftLeft")],
    }).editor;
    expect(shift.previousTargetText(0)).toBe(t("controls.noKey"));
  });
});

describe("KeysEditor's combinations (#4183)", () => {
  const shift = key("ShiftLeft", { shiftKey: true });
  const ctrl = key("ControlLeft", { ctrlKey: true });

  it("waits on Shift, showing it, and binds Shift+X on X", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(shift)).toBe(true);
    expect(keys.capturing).toEqual(SKILL_1);
    expect(keys.cellText(SKILL_1)).toBe(t("controls.combo", { mods: t("keys.shift"), key: "…" }));
    expect(keys.press(key("KeyX", { shiftKey: true }))).toBe(true);
    expect(keys.map["skill-1"]).toEqual([bound("KeyX", "shift")]);
    expect(keys.cellText(SKILL_1)).toBe(bindingLabel(bound("KeyX", "shift")));
    // Letting Shift go after binds nothing more.
    expect(keys.release(key("ShiftLeft"))).toBe(false);
    expect(keys.map["skill-1"]).toEqual([bound("KeyX", "shift")]);
  });

  it("names every modifier held, Ctrl first, and binds Ctrl+Alt+1", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    keys.press(key("AltLeft", { altKey: true }));
    keys.press(key("ControlLeft", { ctrlKey: true, altKey: true }));
    expect(keys.cellText(SKILL_1)).toBe(
      t("controls.combo", { mods: `${t("keys.control")} + ${t("keys.alt")}`, key: "…" }),
    );
    keys.press(key("Digit1", { ctrlKey: true, altKey: true }));
    expect(keys.map["skill-1"]).toEqual([bound("Digit1", "ctrl", "alt")]);
  });

  it("still waits when one of two modifiers is let go, and binds the last alone", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    keys.press(ctrl);
    keys.press(key("ShiftLeft", { ctrlKey: true, shiftKey: true }));
    expect(keys.release(key("ControlLeft"))).toBe(true);
    expect(keys.capturing).toEqual(SKILL_1);
    expect(keys.cellText(SKILL_1)).toBe(t("controls.combo", { mods: t("keys.shift"), key: "…" }));
    expect(keys.release(key("ShiftLeft"))).toBe(true);
    expect(keys.map["skill-1"]).toEqual([bound("ShiftLeft")]);
  });

  it("refuses Ctrl alone as the browser's, and keeps waiting", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(ctrl)).toBe(true);
    expect(keys.release(key("ControlLeft"))).toBe(false);
    expect(keys.line).toBe(t("controls.browserKey", { key: t("keys.control") }));
    expect(keys.capturing).toEqual(SKILL_1);
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses Ctrl+W, which the browser keeps", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    keys.press(ctrl);
    expect(keys.press(key("KeyW", { ctrlKey: true }))).toBe(false);
    expect(keys.line).toBe(
      t("controls.reservedCombo", { combo: bindingLabel(bound("KeyW", "ctrl")) }),
    );
    expect(keys.capturing).toEqual(SKILL_1);
    // Ctrl let go after the refused W binds nothing.
    keys.release(key("ControlLeft"));
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a combination on a move key, and binds nothing when Shift is let go", () => {
    const { editor: keys, save } = editor();
    const moveUp = { action: "move-up", index: 0 } as const;
    keys.startCapture(moveUp);
    keys.press(shift);
    expect(keys.press(key("KeyW", { shiftKey: true }))).toBe(false);
    expect(keys.line).toBe(t("controls.noComboHere"));
    keys.release(key("ShiftLeft"));
    expect(keys.capturing).toEqual(moveUp);
    expect(save).not.toHaveBeenCalled();
  });

  it("takes Shift+Backspace as a key, never as clearing the cell", () => {
    const { editor: keys } = editor();
    keys.startCapture(SKILL_1);
    keys.press(shift);
    expect(keys.press(key("Backspace", { shiftKey: true }))).toBe(false);
    expect(keys.map["skill-1"]).toEqual([bound("KeyQ")]);
  });

  it("moves a combination off the action that had it, and names it", () => {
    const { editor: keys } = editor({ ...KEYMAP_PRESETS.vibewars, mute: [bound("KeyX", "shift")] });
    keys.startCapture(SKILL_1);
    keys.press(shift);
    keys.press(key("KeyX", { shiftKey: true }));
    expect(keys.map.mute).toEqual([]);
    expect(keys.line).toBe(
      t("controls.displacedNoKey", {
        key: bindingLabel(bound("KeyX", "shift")),
        action: t("controls.mute"),
      }),
    );
  });

  it("reads no Previous target where Shift with Next target's key is bound itself", () => {
    const { editor: keys } = editor({
      ...KEYMAP_PRESETS.vibewars,
      "skill-3": [bound("Tab", "shift")],
    });
    expect(keys.previousTargetText(0)).toBe(t("controls.noKey"));
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
        ...(name.parent?.all("key-cell") ?? []).map((cell) => cell.textContent),
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
      bindingLabel(bound("Tab", "shift")),
      "",
    ]);
    // Not a key of its own: no capture buttons, and a click starts nothing.
    const row = present(present(container.all("keys-action")[next + 1]).parent);
    expect(row.classList.contains("is-fixed")).toBe(true);
    expect(row.all("key-cell").every((cell) => cell.dataset.action === undefined)).toBe(true);
    // Each in a column of its own, as Next target's are, and no empty box.
    expect(row.all("key-cell").map((cell) => cell.parent?.parent)).toEqual([row, row]);
    expect(row.all("key-cell").map((cell) => cell.hidden)).toEqual([false, true]);
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
    expect(previous()?.[1]).toBe(bindingLabel(bound("KeyX", "shift")));
    unmount();
  });
});
