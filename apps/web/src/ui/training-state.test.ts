import { describe, expect, it } from "vitest";

import { TRAINING_SCENARIOS } from "@vibewars/game-core";

import { newCharacter, setProfessions, setRank, setSkill } from "./build-editor.js";
import {
  SCENARIO_STORAGE_KEY,
  buildSignature,
  loadScenarioChoice,
  overlayMessage,
  resolveScenarioId,
  saveScenarioChoice,
  shouldRestoreFocus,
  slotForKey,
} from "./training-state.js";

const elementalist = setProfessions(newCharacter("c1"), "elementalist", undefined);

describe("buildSignature", () => {
  it("ignores the name and updatedAt: renaming is not re-arming", () => {
    const renamed = { ...elementalist, name: "Pyro", updatedAt: elementalist.updatedAt + 1 };
    expect(buildSignature(renamed)).toBe(buildSignature(elementalist));
  });

  it("ignores the order attributes were raised in", () => {
    const fireThenEarth = setRank(
      setRank(elementalist, "elementalist.fire-magic", 3),
      "elementalist.earth-magic",
      2,
    );
    const earthThenFire = setRank(
      setRank(elementalist, "elementalist.earth-magic", 2),
      "elementalist.fire-magic",
      3,
    );
    expect(fireThenEarth.attributes).not.toEqual(earthThenFire.attributes);
    expect(buildSignature(fireThenEarth)).toBe(buildSignature(earthThenFire));
  });

  it("changes with ranks, skills, professions and equipment", () => {
    const base = buildSignature(elementalist);
    expect(buildSignature(setRank(elementalist, "elementalist.fire-magic", 1))).not.toBe(base);
    expect(buildSignature(setSkill(elementalist, 0, "elementalist.fireball"))).not.toBe(base);
    expect(buildSignature(setProfessions(elementalist, "elementalist", "monk"))).not.toBe(base);
    const shielded = {
      ...elementalist,
      equipment: {
        ...elementalist.equipment,
        offHand: { offhandId: "shield" as const, requirementAttributeId: null },
      },
    };
    expect(buildSignature(shielded)).not.toBe(base);
  });
});

describe("slotForKey", () => {
  it("maps 1–8 to slots that exist, and nothing else", () => {
    expect(slotForKey("1", 2)).toBe(0);
    expect(slotForKey("2", 2)).toBe(1);
    expect(slotForKey("3", 2)).toBeUndefined();
    expect(slotForKey("8", 8)).toBe(7);
    expect(slotForKey("9", 8)).toBeUndefined();
    expect(slotForKey("0", 8)).toBeUndefined();
    expect(slotForKey("w", 8)).toBeUndefined();
  });
});

describe("shouldRestoreFocus", () => {
  it("only when the player had control and nothing else took the keyboard", () => {
    expect(shouldRestoreFocus(true, true)).toBe(true);
    expect(shouldRestoreFocus(true, false)).toBe(false);
    expect(shouldRestoreFocus(false, true)).toBe(false);
  });
});

describe("resolveScenarioId", () => {
  it("keeps a stored choice that exists, else opens on the first scenario", () => {
    const second = TRAINING_SCENARIOS[1]?.id;
    expect(resolveScenarioId(second, TRAINING_SCENARIOS)).toBe(second);
    expect(resolveScenarioId("gone", TRAINING_SCENARIOS)).toBe(TRAINING_SCENARIOS[0]?.id);
    expect(resolveScenarioId(undefined, TRAINING_SCENARIOS)).toBe(TRAINING_SCENARIOS[0]?.id);
    expect(resolveScenarioId("x", [])).toBeUndefined();
  });
});

describe("overlayMessage", () => {
  const skills = { exercises: ["spell-damage"] } as const;
  const drill = { exercises: ["dodging"] } as const;

  it("names the problem of an illegal build", () => {
    expect(overlayMessage("too many points", [], drill)).toBe(
      "This build cannot be tested: too many points",
    );
  });

  it("hints at an empty bar, which is legal", () => {
    expect(overlayMessage(undefined, [], skills)).toBe("Equip a skill to start testing.");
  });

  it("covers nothing for a legal, armed build", () => {
    expect(overlayMessage(undefined, ["elementalist.fireball"], skills)).toBeUndefined();
  });

  it("covers nothing in a weapon drill, bar or no bar (#162)", () => {
    expect(overlayMessage(undefined, [], drill)).toBeUndefined();
    expect(overlayMessage(undefined, [], { exercises: ["auto-attacks"] })).toBeUndefined();
  });
});

describe("the scenario choice in storage", () => {
  function memoryStorage(): Storage {
    const items = new Map<string, string>();
    return {
      get length() {
        return items.size;
      },
      clear: () => {
        items.clear();
      },
      getItem: (key) => items.get(key) ?? null,
      key: (index) => [...items.keys()][index] ?? null,
      removeItem: (key) => {
        items.delete(key);
      },
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
  }

  it("round-trips", () => {
    const storage = memoryStorage();
    saveScenarioChoice(() => storage, "armor-ladder");
    expect(storage.getItem(SCENARIO_STORAGE_KEY)).toBe("armor-ladder");
    expect(loadScenarioChoice(() => storage)).toBe("armor-ladder");
  });

  it("reads nothing, and throws nothing, when storage is unavailable", () => {
    const blocked = (): Storage => {
      throw new Error("SecurityError");
    };
    expect(loadScenarioChoice(blocked)).toBeUndefined();
    expect(() => {
      saveScenarioChoice(blocked, "armor-ladder");
    }).not.toThrow();
    expect(loadScenarioChoice(memoryStorage)).toBeUndefined();
  });
});
