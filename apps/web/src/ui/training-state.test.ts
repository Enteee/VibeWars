import { describe, expect, it } from "vitest";

import { NO_UPGRADES, TRAINING_SCENARIOS } from "@vibewars/game-core";

import { DEFAULT_KEYMAP, KEYMAP_PRESETS } from "../input/keymap.js";
import { newCharacter, setProfessions, setRank, setSkill } from "./build-editor.js";
import {
  SCENARIO_STORAGE_KEY,
  armedHint,
  buildSignature,
  escapeStep,
  loadScenarioChoice,
  logActorName,
  overlayMessage,
  resolveScenarioId,
  saveScenarioChoice,
  shouldRestoreFocus,
} from "./training-state.js";

const elementalist = setProfessions(newCharacter("c1"), "elementalist", undefined);

describe("buildSignature", () => {
  it("ignores the name and updatedAt: renaming is not re-arming", () => {
    const renamed = { ...elementalist, name: "Pyro", updatedAt: elementalist.updatedAt + 1 };
    expect(buildSignature(renamed)).toBe(buildSignature(elementalist));
  });

  it("is equal for an equal build in a new object, as storage hands it back (#1734)", () => {
    const built = setSkill(
      setRank(elementalist, "elementalist.fire-magic", 3),
      0,
      "elementalist.fireball",
    );
    const stored = JSON.parse(JSON.stringify(built)) as typeof built;
    expect(buildSignature(structuredClone(built))).toBe(buildSignature(built));
    expect(buildSignature(stored)).toBe(buildSignature(built));
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
        weaponSets: [
          {
            ...elementalist.equipment.weaponSets[0],
            offHand: {
              offhandId: "shield" as const,
              requirementAttributeId: null,
              upgrades: NO_UPGRADES,
            },
          },
          null,
          null,
          null,
        ] as const,
      },
    };
    expect(buildSignature(shielded)).not.toBe(base);
  });
});

describe("armedHint (#302)", () => {
  it("names the keymap's keys: arrows and Q–F by default, WASD and 1–8 in Classic", () => {
    expect(armedHint(DEFAULT_KEYMAP)).toBe(
      "arrows move · Q–F cast · tab/right-click to target · space/double right-click attack · esc to release",
    );
    expect(armedHint(KEYMAP_PRESETS.classic)).toBe(
      "WASD move · 1–8 cast · tab/right-click to target · space/double right-click attack · esc to release",
    );
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

describe("escapeStep (#495)", () => {
  it("does the match's Esc first, then collapses an expanded arena, then releases control", () => {
    expect(escapeStep("cancel", true)).toBe("cancel");
    expect(escapeStep("cancel", false)).toBe("cancel");
    expect(escapeStep("clear-target", true)).toBe("clear-target");
    expect(escapeStep("clear-target", false)).toBe("clear-target");
    expect(escapeStep(undefined, true)).toBe("collapse");
    expect(escapeStep(undefined, false)).toBe("release");
  });
});

describe("overlayMessage", () => {
  it("names the problem of an illegal build", () => {
    expect(overlayMessage("too many points")).toBe("This build cannot be tested: too many points");
  });

  it("covers nothing for a legal build, even with an empty bar (#360)", () => {
    expect(overlayMessage(undefined)).toBeUndefined();
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

describe("logActorName", () => {
  const names = new Map([["dummy", "Target dummy"]]);
  const players = [
    { sessionId: "dummy", name: "dummy" },
    { sessionId: "you/c1", name: "Recuperation" },
  ];

  it("names a dummy as the scenario does, and a spirit you summoned as the match does (#1064)", () => {
    expect(logActorName("dummy", names, players)).toBe("Target dummy");
    expect(logActorName("you/c1", names, players)).toBe("Recuperation");
  });

  it("falls back to the id for someone neither knows", () => {
    expect(logActorName("gone", names, players)).toBe("gone");
    expect(logActorName("gone", undefined, undefined)).toBe("gone");
  });
});
