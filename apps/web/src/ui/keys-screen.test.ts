import { describe, expect, it, vi } from "vitest";

import { DEFAULT_KEYMAP, KEYMAP_PRESETS, type Keymap } from "../input/keymap.js";

import { KeysEditor, SHORTCUT_REFUSAL, noKeyWarning, type KeyPress } from "./keys-screen.js";

function key(code: string, held: Partial<Omit<KeyPress, "code">> = {}): KeyPress {
  return { code, ctrlKey: false, altKey: false, metaKey: false, ...held };
}

function editor(map: Keymap = DEFAULT_KEYMAP): {
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
    expect(keys.cellText(SKILL_1)).toBe("press a key...");

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
    expect(keys.map).toBe(DEFAULT_KEYMAP);
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
    expect(keys.line).toBe(SHORTCUT_REFUSAL);
    expect(keys.capturing).toEqual(SKILL_1);
    expect(save).not.toHaveBeenCalled();

    // The Enter a refused press lets through clicks the cell again; the
    // reason stays.
    keys.startCapture(SKILL_1);
    expect(keys.line).toBe(SHORTCUT_REFUSAL);
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
      expect(keys.line).toBe(SHORTCUT_REFUSAL);
    }
    expect(keys.capturing).toEqual(SKILL_1);
  });

  it("refuses F5: the browser's", () => {
    const { editor: keys, save } = editor();
    keys.startCapture(SKILL_1);
    expect(keys.press(key("F5"))).toBe(false);
    expect(keys.line).toBe("F5 belongs to the browser.");
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
    expect(keys.line).toBe("Q was Skill 1; Skill 1 now has no key.");
  });

  it("says what a displaced action keeps, when it had a second key", () => {
    const { editor: keys } = editor(KEYMAP_PRESETS.classic);
    keys.startCapture(SKILL_1);
    keys.press(key("KeyW"));
    expect(keys.map["move-up"]).toEqual(["ArrowUp"]);
    expect(keys.flashed).toEqual({ action: "move-up", index: 0 });
    expect(keys.line).toBe("W was Move up; Move up keeps ↑.");
  });

  it("replaces the whole map with a preset, and reads Custom once edited", () => {
    const { editor: keys, save } = editor();
    expect(keys.preset).toBe("vibewars");
    keys.choosePreset("classic");
    expect(keys.map).toBe(KEYMAP_PRESETS.classic);
    expect(keys.preset).toBe("classic");

    keys.startCapture(SKILL_1);
    keys.press(key("KeyZ"));
    expect(keys.preset).toBe("custom");

    keys.reset();
    expect(keys.map).toBe(KEYMAP_PRESETS.vibewars);
    expect(save.mock.calls.map(([map]) => map)).toEqual([
      KEYMAP_PRESETS.classic,
      expect.objectContaining({ "skill-1": ["KeyZ"] }),
      KEYMAP_PRESETS.vibewars,
    ]);
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

describe("noKeyWarning (#309)", () => {
  it("warns on a skill or move with no key, and says how to move without one", () => {
    const empty: Keymap = { ...DEFAULT_KEYMAP, "skill-3": [], "move-up": [], mute: [] };
    expect(noKeyWarning(empty, "skill-3")).toBe("no key");
    expect(noKeyWarning(empty, "move-up")).toBe("no key; click the ground to walk");
    expect(noKeyWarning(empty, "mute")).toBe("");
    expect(noKeyWarning(empty, "skill-1")).toBe("");
  });
});
