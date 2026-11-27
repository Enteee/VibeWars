import { describe, expect, it } from "vitest";

import { t } from "../i18n/index.js";
import {
  DEFAULT_KEYMAP,
  KEYMAP_PRESETS,
  KEY_ACTIONS,
  WEAPON_SET_ACTIONS,
  RESERVED_COMBOS,
  actionForBinding,
  actionForEvent,
  actionLabel,
  bindingLabel,
  codeLabel,
  isBindable,
  isShiftedPlain,
  parseKeymap,
  presetOf,
  rebind,
  type KeyBinding,
  type Keymap,
  type Modifier,
} from "./keymap.js";
import { layoutLabeller, loadLayoutLabeller } from "./key-labels.js";

const key = (code: string, ...mods: Modifier[]): KeyBinding => ({ code, mods });
const actionForCode = (map: Keymap, code: string) => actionForBinding(map, key(code));

const presets = Object.entries(KEYMAP_PRESETS);
const VIBEWARS = KEYMAP_PRESETS.vibewars;

describe("the keymap presets (#302)", () => {
  it.each(presets)(
    "%s is a valid keymap that binds every action but the two call keys (#443) and Drop (#1225)",
    (_, map) => {
      expect(parseKeymap(map)).toEqual(map);
      expect(KEY_ACTIONS).toHaveLength(26);
      // The wheel click calls and pings; the keys are for a mouse without
      // one. The Drop button drops the flag.
      const unbound = new Set(["call-target", "ping", "drop-bundle"]);
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
    for (const bindings of Object.values(map)) {
      for (const { code, mods } of bindings) {
        expect(mods).toEqual([]);
        expect(isBindable(code)).toBe(true);
        expect(code).not.toMatch(/^(?:Control|Alt|Meta)/);
      }
    }
  });

  it("defaults to Classic: skills on 1-8, WASD and the arrows move (#3134)", () => {
    expect(DEFAULT_KEYMAP).toBe(KEYMAP_PRESETS.classic);
    expect(presetOf(DEFAULT_KEYMAP)).toBe("classic");
    const action = (code: string): string | undefined => actionForCode(DEFAULT_KEYMAP, code);
    expect(
      ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"].map(action),
    ).toEqual([
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
    expect(["KeyW", "KeyS", "KeyA", "KeyD"].map(action)).toEqual([
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
    expect(action("F1")).toBe("weapon-set-1");
    expect(action("Digit9")).toBeUndefined();
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

  it("targets yourself on F as in GW1, and on G, in Classic only (#3629)", () => {
    expect(KEYMAP_PRESETS.classic["target-self"]).toEqual([key("KeyF"), key("KeyG")]);
    expect(actionForCode(KEYMAP_PRESETS.classic, "KeyF")).toBe("target-self");
    expect(actionForCode(KEYMAP_PRESETS.classic, "KeyG")).toBe("target-self");
    expect(actionForCode(KEYMAP_PRESETS.vibewars, "KeyF")).toBe("skill-8");
    expect(actionForCode(KEYMAP_PRESETS.vibewars, "KeyG")).toBe("target-self");
  });

  it.each(presets)("%s binds every code to one action at most", (_, map) => {
    const codes = Object.values(map)
      .flat()
      .map((binding) => binding.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("parseKeymap", () => {
  const classic = KEYMAP_PRESETS.classic;

  it("rejects a missing action, and an unknown one", () => {
    const { mute: _mute, ...missing } = classic;
    expect(parseKeymap(missing)).toBeUndefined();
    expect(parseKeymap({ ...missing, dance: [key("KeyM")] })).toBeUndefined();
  });

  it("rejects a key bound twice, and three keys on one action", () => {
    expect(parseKeymap({ ...classic, mute: [key("Digit1")] })).toBeUndefined();
    expect(
      parseKeymap({ ...classic, mute: [key("KeyM"), key("KeyN"), key("KeyB")] }),
    ).toBeUndefined();
  });

  it("rejects Ctrl, Esc and anything not a binding", () => {
    expect(parseKeymap({ ...classic, mute: [key("ControlLeft")] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: [key("Escape")] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: [7] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: key("KeyM") })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: [{ code: "KeyM" }] })).toBeUndefined();
    expect(parseKeymap({ ...classic, mute: [{ ...key("KeyM"), extra: 1 }] })).toBeUndefined();
    for (const value of [null, "classic", 7, [], undefined]) {
      expect(parseKeymap(value)).toBeUndefined();
    }
  });

  it("rejects a keymap stored before the weapon-set keys (#489), so the default plays", () => {
    const {
      "weapon-set-1": _one,
      "weapon-set-2": _two,
      "weapon-set-3": _three,
      "weapon-set-4": _four,
      ...stored
    } = classic;
    expect(parseKeymap(stored)).toBeUndefined();
  });

  it("rejects a keymap stored before the Drop key (#1225), so the default plays", () => {
    const { "drop-bundle": _drop, ...stored } = classic;
    expect(parseKeymap(stored)).toBeUndefined();
  });

  it("rejects a keymap of bare codes, as stored before combinations (#4183)", () => {
    const stored = Object.fromEntries(
      Object.entries(classic).map(([action, bindings]) => [
        action,
        bindings.map((binding) => binding.code),
      ]),
    );
    expect(parseKeymap(stored)).toBeUndefined();
  });

  it("accepts a combination, and tells it from its bare key (#4183)", () => {
    const map = { ...classic, mute: [key("Digit1", "shift"), key("KeyM", "ctrl", "alt")] };
    expect(parseKeymap(map)).toEqual(map);
  });

  it("rejects unsorted, repeated or unknown modifiers (#4183)", () => {
    for (const mods of [["shift", "ctrl"], ["shift", "shift"], ["meta"], ["Shift"]]) {
      expect(parseKeymap({ ...classic, mute: [{ code: "KeyM", mods }] })).toBeUndefined();
    }
  });

  it("rejects a combination on a modifier, a held action or the browser's (#4183)", () => {
    expect(parseKeymap({ ...classic, mute: [key("ShiftLeft", "ctrl")] })).toBeUndefined();
    expect(parseKeymap({ ...classic, "move-up": [key("KeyW", "shift")] })).toBeUndefined();
    expect(
      parseKeymap({ ...classic, "show-names": [key("ShiftLeft"), key("KeyN", "alt")] }),
    ).toBeUndefined();
    for (const reserved of RESERVED_COMBOS) {
      expect(parseKeymap({ ...classic, mute: [reserved] })).toBeUndefined();
    }
  });

  it("rejects one combination bound twice (#4183)", () => {
    expect(
      parseKeymap({ ...classic, mute: [key("KeyX", "shift")], ping: [key("KeyX", "shift")] }),
    ).toBeUndefined();
  });

  it("accepts an action with no key", () => {
    expect(parseKeymap({ ...classic, mute: [] })).toEqual({ ...classic, mute: [] });
  });
});

describe("isBindable", () => {
  it("refuses the browser's and the OS's keys, and the game's fixed Esc and F10", () => {
    for (const code of [
      "ControlLeft",
      "AltRight",
      "MetaLeft",
      "OSLeft",
      "Escape",
      "F10",
      "F5",
      "F11",
      "",
    ]) {
      expect(isBindable(code)).toBe(false);
    }
    for (const code of [
      "KeyQ",
      "Digit1",
      "ArrowUp",
      "Space",
      "ShiftLeft",
      "F2",
      "Tab",
      "F1",
      "F3",
      "F4",
    ]) {
      expect(isBindable(code)).toBe(true);
    }
  });
});

describe("actionForEvent (#4183)", () => {
  const none = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };
  const press = (code: string, ...mods: Modifier[]) => ({
    ...none,
    code,
    ctrlKey: mods.includes("ctrl"),
    altKey: mods.includes("alt"),
    shiftKey: mods.includes("shift"),
  });
  const classic = KEYMAP_PRESETS.classic;
  const combos: Keymap = {
    ...classic,
    "skill-3": [key("Tab", "shift")],
    "skill-4": [key("KeyX", "shift")],
    "skill-5": [key("Digit5"), key("KeyX", "ctrl", "alt")],
  };

  it("fires the action bound to the code with exactly the modifiers held", () => {
    expect(actionForEvent(combos, press("KeyX", "shift"))).toBe("skill-4");
    expect(actionForEvent(combos, press("KeyX", "ctrl", "alt"))).toBe("skill-5");
    expect(actionForEvent(combos, press("KeyX"))).toBeUndefined();
    expect(actionForEvent(combos, press("KeyX", "ctrl"))).toBeUndefined();
  });

  it("with Shift alone held, falls back to the bare key: skills fire while names show", () => {
    expect(actionForEvent(classic, press("Digit1", "shift"))).toBe("skill-1");
    expect(actionForEvent(classic, press("ShiftLeft", "shift"))).toBe("show-names");
    expect(actionForEvent(classic, press("ShiftRight", "shift"))).toBe("show-names");
  });

  it("with Ctrl or Alt held and no combination bound, fires nothing: the browser's", () => {
    expect(actionForEvent(classic, press("Digit1", "ctrl"))).toBeUndefined();
    expect(actionForEvent(classic, press("Digit1", "alt"))).toBeUndefined();
    expect(actionForEvent(classic, press("Digit1", "ctrl", "shift"))).toBeUndefined();
    expect(actionForEvent(classic, { ...press("Digit1"), metaKey: true })).toBeUndefined();
    expect(actionForEvent(combos, { ...press("KeyX", "shift"), metaKey: true })).toBeUndefined();
  });

  it("cycles back on Shift+Tab, unless Shift+Tab is bound itself", () => {
    expect(actionForEvent(classic, press("Tab", "shift"))).toBe("target-next");
    expect(isShiftedPlain(classic, press("Tab", "shift"))).toBe(true);
    expect(isShiftedPlain(classic, press("Tab"))).toBe(false);
    expect(actionForEvent(combos, press("Tab", "shift"))).toBe("skill-3");
    expect(isShiftedPlain(combos, press("Tab", "shift"))).toBe(false);
    expect(actionForEvent(combos, press("Tab"))).toBe("target-next");
  });
});

describe("key labels", () => {
  it("reads a code as its key", () => {
    expect(codeLabel("KeyQ")).toBe("Q");
    expect(codeLabel("Digit1")).toBe("1");
    expect(codeLabel("ArrowUp")).toBe("↑");
    expect(codeLabel("ArrowLeft")).toBe("←");
    expect(codeLabel("Space")).toBe(t("keys.space"));
    expect(codeLabel("ShiftLeft")).toBe(t("keys.shift"));
    expect(codeLabel("Tab")).toBe(t("keys.tab"));
  });

  it("labels an action by its first key, and an unbound one as nothing", () => {
    expect(actionLabel(VIBEWARS, "skill-1")).toBe("Q");
    expect(actionLabel(KEYMAP_PRESETS.classic, "move-up")).toBe("W");
    expect(actionLabel({ ...VIBEWARS, mute: [] }, "mute")).toBe("");
  });

  it("labels a combination after its modifiers, or compactly for a badge (#4183)", () => {
    expect(bindingLabel(key("KeyX", "shift"))).toBe(
      t("controls.combo", { mods: t("keys.shift"), key: "X" }),
    );
    expect(bindingLabel(key("Digit1", "ctrl", "alt"))).toBe(
      t("controls.combo", { mods: `${t("keys.control")} + ${t("keys.alt")}`, key: "1" }),
    );
    expect(bindingLabel(key("KeyX"))).toBe("X");
    expect(bindingLabel(key("KeyX", "shift"), true)).toBe(`${t("keys.shiftShort")}X`);
    expect(bindingLabel(key("KeyX", "ctrl"), true)).toBe(`${t("keys.ctrlShort")} X`);
    expect(bindingLabel(key("KeyX", "alt"), true)).toBe(`${t("keys.altShort")} X`);
    const skill = { ...VIBEWARS, "skill-1": [key("KeyQ", "shift")] };
    expect(actionLabel(skill, "skill-1", codeLabel, true)).toBe(`${t("keys.shiftShort")}Q`);
  });

  it("prefers the keyboard layout's character, uppercased, where it has one", () => {
    // AZERTY: the key where QWERTY has Q reads A.
    const azerty = layoutLabeller(
      new Map([
        ["KeyQ", "a"],
        ["Space", " "],
      ]),
    );
    expect(actionLabel(VIBEWARS, "skill-1", azerty)).toBe("A");
    expect(azerty("Space")).toBe(t("keys.space"));
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
  it("treats X and Shift+X as two keys (#4183)", () => {
    const { map, displaced } = rebind(VIBEWARS, "skill-2", 0, key("KeyQ", "shift"));
    expect(displaced).toBeUndefined();
    expect(map["skill-1"]).toEqual([key("KeyQ")]);
    expect(map["skill-2"]).toEqual([key("KeyQ", "shift")]);
    const again = rebind(map, "skill-3", 0, key("KeyQ", "shift"));
    expect(again.displaced).toEqual({ action: "skill-2", binding: key("KeyQ", "shift") });
    expect(again.map["skill-1"]).toEqual([key("KeyQ")]);
  });

  it("binds a free key to the cell asked for", () => {
    const { map, displaced } = rebind(VIBEWARS, "skill-1", 1, key("KeyZ"));
    expect(map["skill-1"]).toEqual([key("KeyQ"), key("KeyZ")]);
    expect(displaced).toBeUndefined();
    expect(parseKeymap(map)).toEqual(map);
  });

  it("replaces the key a cell held", () => {
    const { map } = rebind(VIBEWARS, "skill-1", 0, key("KeyZ"));
    expect(map["skill-1"]).toEqual([key("KeyZ")]);
    expect(actionForCode(map, "KeyQ")).toBeUndefined();
  });

  it("moves a taken key off the action that had it, and says which", () => {
    const { map, displaced } = rebind(VIBEWARS, "skill-2", 0, key("KeyQ"));
    expect(map["skill-2"]).toEqual([key("KeyQ")]);
    expect(map["skill-1"]).toEqual([]);
    expect(displaced).toEqual({ action: "skill-1", binding: key("KeyQ") });
    expect(parseKeymap(map)).toEqual(map);
  });

  it("moves a key between an action's own cells, displacing nothing", () => {
    const { map, displaced } = rebind(KEYMAP_PRESETS.classic, "move-up", 1, key("KeyW"));
    expect(map["move-up"]).toEqual([key("ArrowUp"), key("KeyW")]);
    expect(displaced).toBeUndefined();
  });

  it("clears a cell", () => {
    const { map, displaced } = rebind(VIBEWARS, "mute", 0, null);
    expect(map.mute).toEqual([]);
    expect(displaced).toBeUndefined();
    expect(parseKeymap(map)).toEqual(map);
  });

  it("promotes the secondary when the primary is cleared", () => {
    expect(rebind(KEYMAP_PRESETS.classic, "move-up", 0, null).map["move-up"]).toEqual([
      key("ArrowUp"),
    ]);
    expect(rebind({ ...VIBEWARS, mute: [] }, "mute", 1, key("KeyN")).map.mute).toEqual([
      key("KeyN"),
    ]);
  });

  it("promotes the other action's secondary when its primary is taken", () => {
    const { map } = rebind(KEYMAP_PRESETS.classic, "skill-1", 0, key("KeyW"));
    expect(map["move-up"]).toEqual([key("ArrowUp")]);
    expect(parseKeymap(map)).toEqual(map);
  });

  it("throws on a key the game never binds", () => {
    expect(() => rebind(VIBEWARS, "skill-1", 0, key("ControlLeft"))).toThrow();
    expect(() => rebind(VIBEWARS, "move-up", 0, key("KeyX", "shift"))).toThrow();
    expect(() => rebind(VIBEWARS, "mute", 0, key("KeyW", "ctrl"))).toThrow();
  });
});

describe("presetOf (#309)", () => {
  it("names either preset, and nothing for a custom map", () => {
    expect(presetOf(KEYMAP_PRESETS.vibewars)).toBe("vibewars");
    expect(presetOf(KEYMAP_PRESETS.classic)).toBe("classic");
    expect(presetOf(rebind(VIBEWARS, "skill-1", 0, key("KeyZ")).map)).toBeUndefined();
    expect(presetOf(rebind(VIBEWARS, "mute", 1, key("KeyN")).map)).toBeUndefined();
  });
});

describe("the weapon-set keys (#489)", () => {
  it("are 1 to 4 in vibewars and F1 to F4 in classic, set 1 first (Q116)", () => {
    const keys = (map: Keymap) =>
      WEAPON_SET_ACTIONS.map((action) => map[action].map((binding) => binding.code));
    expect(keys(KEYMAP_PRESETS.vibewars)).toEqual([["Digit1"], ["Digit2"], ["Digit3"], ["Digit4"]]);
    expect(keys(KEYMAP_PRESETS.classic)).toEqual([["F1"], ["F2"], ["F3"], ["F4"]]);
    for (const map of Object.values(KEYMAP_PRESETS)) {
      expect(parseKeymap(map)).toEqual(map);
    }
  });
});
