import { describe, expect, it } from "vitest";

import {
  DEFAULT_KEYMAP,
  KEYMAP_PRESETS,
  KEY_ACTIONS,
  actionForCode,
  actionLabel,
  codeLabel,
  isBindable,
  isShortcut,
  parseKeymap,
  presetOf,
  rebind,
} from "./keymap.js";
import { layoutLabeller, loadLayoutLabeller } from "./key-labels.js";

const presets = Object.entries(KEYMAP_PRESETS);

describe("the keymap presets (#302)", () => {
  it.each(presets)(
    "%s is a valid keymap that binds every action but the two call keys (#443)",
    (_, map) => {
      expect(parseKeymap(map)).toEqual(map);
      expect(KEY_ACTIONS).toHaveLength(21);
      // The wheel click calls and pings; the keys are for a mouse without one.
      const unbound = new Set(["call-target", "ping"]);
      for (const action of KEY_ACTIONS) {
        if (unbound.has(action)) {
          expect(map[action], action).toEqual([]);
        } else {
          expect(map[action].length, action).toBeGreaterThan(0);
        }
      }
    },
  );

  it.each(presets)("%s binds no key the browser or the OS owns", (_, map) => {
    for (const codes of Object.values(map)) {
      for (const code of codes) {
        expect(isBindable(code)).toBe(true);
        expect(code).not.toMatch(/^(?:Control|Alt|Meta)/);
      }
    }
  });

  it("defaults to VibeWars: skills on Q-F, arrows move, Shift shows names", () => {
    expect(DEFAULT_KEYMAP).toBe(KEYMAP_PRESETS.vibewars);
    const action = (code: string): string | undefined => actionForCode(DEFAULT_KEYMAP, code);
    expect(["KeyQ", "KeyW", "KeyE", "KeyR", "KeyA", "KeyS", "KeyD", "KeyF"].map(action)).toEqual([
      "skill-1",
      "skill-2",
      "skill-3",
      "skill-4",
      "skill-5",
      "skill-6",
      "skill-7",
      "skill-8",
    ]);
    expect(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].map(action)).toEqual([
      "move-up",
      "move-down",
      "move-left",
      "move-right",
    ]);
    expect(action("Tab")).toBe("target-next");
    expect(action("KeyC")).toBe("target-closest");
    expect(action("KeyT")).toBe("target-called");
    expect(action("KeyG")).toBe("target-self");
    expect(action("Space")).toBe("attack");
    expect(action("ShiftLeft")).toBe("show-names");
    expect(action("ShiftRight")).toBe("show-names");
    expect(action("KeyM")).toBe("mute");
    expect(action("Digit1")).toBeUndefined();
    expect(action("ControlLeft")).toBeUndefined();
  });

  it("has Classic: skills on 1-8, WASD and the arrows both move", () => {
    const action = (code: string): string | undefined =>
      actionForCode(KEYMAP_PRESETS.classic, code);
    expect(action("Digit1")).toBe("skill-1");
    expect(action("Digit8")).toBe("skill-8");
    expect(action("KeyW")).toBe("move-up");
    expect(action("ArrowUp")).toBe("move-up");
    expect(action("KeyD")).toBe("move-right");
    expect(action("KeyC")).toBe("target-closest");
    expect(action("KeyT")).toBe("target-called");
    expect(action("KeyG")).toBe("target-self");
    expect(action("ShiftLeft")).toBe("show-names");
    expect(action("KeyQ")).toBeUndefined();
  });
});

describe("parseKeymap", () => {
  const classic = KEYMAP_PRESETS.classic;

  it("rejects a missing action, and an unknown one", () => {
    const { mute: _mute, ...missing } = classic;
    expect(parseKeymap(missing)).toBeUndefined();
    expect(parseKeymap({ ...missing, dance: ["KeyM"] })).toBeUndefined();
  });

  it("rejects a code bound twice, and three codes on one action", () => {
    expect(parseKeymap({ ...classic, mute: ["Digit1"] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: ["KeyM", "KeyN", "KeyB"] })).toBeUndefined();
  });

  it("rejects Ctrl, Esc and anything not a string", () => {
    expect(parseKeymap({ ...classic, mute: ["ControlLeft"] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: ["Escape"] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: [7] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: "KeyM" })).toBeUndefined();
    for (const value of [null, "classic", 7, [], undefined]) {
      expect(parseKeymap(value)).toBeUndefined();
    }
  });

  it("accepts an action with no key", () => {
    expect(parseKeymap({ ...classic, mute: [] })).toEqual({ ...classic, mute: [] });
  });
});

describe("isBindable and isShortcut", () => {
  it("refuses the browser's and the OS's keys, and the game's fixed Esc and F10", () => {
    for (const code of [
      "ControlLeft",
      "AltRight",
      "MetaLeft",
      "OSLeft",
      "Escape",
      "F10",
      "F5",
      "",
    ]) {
      expect(isBindable(code)).toBe(false);
    }
    for (const code of ["KeyQ", "Digit1", "ArrowUp", "Space", "ShiftLeft", "F2", "Tab"]) {
      expect(isBindable(code)).toBe(true);
    }
  });

  it("counts Ctrl, Alt and Meta as the browser's, and Shift as the game's", () => {
    const none = { ctrlKey: false, altKey: false, metaKey: false };
    expect(isShortcut(none)).toBe(false);
    expect(isShortcut({ ...none, ctrlKey: true })).toBe(true);
    expect(isShortcut({ ...none, altKey: true })).toBe(true);
    expect(isShortcut({ ...none, metaKey: true })).toBe(true);
  });
});

describe("key labels", () => {
  it("reads a code as its key", () => {
    expect(codeLabel("KeyQ")).toBe("Q");
    expect(codeLabel("Digit1")).toBe("1");
    expect(codeLabel("ArrowUp")).toBe("↑");
    expect(codeLabel("ArrowLeft")).toBe("←");
    expect(codeLabel("Space")).toBe("Space");
    expect(codeLabel("ShiftLeft")).toBe("Shift");
    expect(codeLabel("Tab")).toBe("Tab");
  });

  it("labels an action by its first key, and an unbound one as nothing", () => {
    expect(actionLabel(DEFAULT_KEYMAP, "skill-1")).toBe("Q");
    expect(actionLabel(KEYMAP_PRESETS.classic, "move-up")).toBe("W");
    expect(actionLabel({ ...DEFAULT_KEYMAP, mute: [] }, "mute")).toBe("");
  });

  it("prefers the keyboard layout's character, uppercased, where it has one", () => {
    // AZERTY: the key where QWERTY has Q reads A.
    const azerty = layoutLabeller(
      new Map([
        ["KeyQ", "a"],
        ["Space", " "],
      ]),
    );
    expect(actionLabel(DEFAULT_KEYMAP, "skill-1", azerty)).toBe("A");
    expect(azerty("Space")).toBe("Space");
    expect(azerty("ArrowUp")).toBe("↑");
  });

  it("has no layout labels where the browser has no keyboard API, or refuses it", async () => {
    expect(await loadLayoutLabeller({})).toBeUndefined();
    expect(
      await loadLayoutLabeller({
        keyboard: { getLayoutMap: () => Promise.reject(new Error("not allowed")) },
      }),
    ).toBeUndefined();
    const labeller = await loadLayoutLabeller({
      keyboard: { getLayoutMap: () => Promise.resolve(new Map([["KeyW", "z"]])) },
    });
    expect(labeller?.("KeyW")).toBe("Z");
  });
});

describe("rebind (#309)", () => {
  it("binds a free key to the cell asked for", () => {
    const { map, displaced } = rebind(DEFAULT_KEYMAP, "skill-1", 1, "KeyZ");
    expect(map["skill-1"]).toEqual(["KeyQ", "KeyZ"]);
    expect(displaced).toBeUndefined();
    expect(parseKeymap(map)).toEqual(map);
  });

  it("replaces the key a cell held", () => {
    const { map } = rebind(DEFAULT_KEYMAP, "skill-1", 0, "KeyZ");
    expect(map["skill-1"]).toEqual(["KeyZ"]);
    expect(actionForCode(map, "KeyQ")).toBeUndefined();
  });

  it("moves a taken key off the action that had it, and says which", () => {
    const { map, displaced } = rebind(DEFAULT_KEYMAP, "skill-2", 0, "KeyQ");
    expect(map["skill-2"]).toEqual(["KeyQ"]);
    expect(map["skill-1"]).toEqual([]);
    expect(displaced).toEqual({ action: "skill-1", code: "KeyQ" });
    expect(parseKeymap(map)).toEqual(map);
  });

  it("moves a key between an action's own cells, displacing nothing", () => {
    const { map, displaced } = rebind(KEYMAP_PRESETS.classic, "move-up", 1, "KeyW");
    expect(map["move-up"]).toEqual(["ArrowUp", "KeyW"]);
    expect(displaced).toBeUndefined();
  });

  it("clears a cell", () => {
    const { map, displaced } = rebind(DEFAULT_KEYMAP, "mute", 0, null);
    expect(map.mute).toEqual([]);
    expect(displaced).toBeUndefined();
    expect(parseKeymap(map)).toEqual(map);
  });

  it("promotes the secondary when the primary is cleared", () => {
    expect(rebind(KEYMAP_PRESETS.classic, "move-up", 0, null).map["move-up"]).toEqual(["ArrowUp"]);
    expect(rebind({ ...DEFAULT_KEYMAP, mute: [] }, "mute", 1, "KeyN").map.mute).toEqual(["KeyN"]);
  });

  it("promotes the other action's secondary when its primary is taken", () => {
    const { map } = rebind(KEYMAP_PRESETS.classic, "skill-1", 0, "KeyW");
    expect(map["move-up"]).toEqual(["ArrowUp"]);
    expect(parseKeymap(map)).toEqual(map);
  });

  it("throws on a key the game never binds", () => {
    expect(() => rebind(DEFAULT_KEYMAP, "skill-1", 0, "ControlLeft")).toThrow();
  });
});

describe("presetOf (#309)", () => {
  it("names either preset, and nothing for a custom map", () => {
    expect(presetOf(KEYMAP_PRESETS.vibewars)).toBe("vibewars");
    expect(presetOf(KEYMAP_PRESETS.classic)).toBe("classic");
    expect(presetOf(rebind(DEFAULT_KEYMAP, "skill-1", 0, "KeyZ").map)).toBeUndefined();
    expect(presetOf(rebind(DEFAULT_KEYMAP, "mute", 1, "KeyN").map)).toBeUndefined();
  });
});
