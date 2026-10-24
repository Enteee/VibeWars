import { describe, expect, it } from "vitest";

import { TRAINING_SCENARIOS } from "@vibewars/game-core";

import { newCharacter, setProfessions, setSkill } from "../ui/build-editor.js";
import { TRAINING_MAPS } from "./maps.js";
import { SELF_ID, playerArming, playerSpawn, setupScenario } from "./scenario-setup.js";

describe("every training scenario", () => {
  it.each(TRAINING_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s: its map exists and everyone stands inside it",
    (_id, scenario) => {
      const map = TRAINING_MAPS.get(scenario.mapId);
      expect(map, `no training map ${scenario.mapId}`).toBeDefined();
      if (map === undefined) {
        return;
      }
      const spawn = playerSpawn(map);
      for (const position of [spawn, ...scenario.dummies.map((dummy) => dummy.position)]) {
        expect(position.x).toBeGreaterThanOrEqual(0);
        expect(position.x).toBeLessThanOrEqual(map.width);
        expect(position.y).toBeGreaterThanOrEqual(0);
        expect(position.y).toBeLessThanOrEqual(map.height);
      }
    },
  );
});

describe("the participant cap", () => {
  it("no scenario puts more than 8 in the arena, the player included (ADR-0020)", () => {
    for (const scenario of TRAINING_SCENARIOS) {
      expect(scenario.dummies.length + 1, scenario.id).toBeLessThanOrEqual(8);
    }
  });
});

describe("setupScenario", () => {
  it("puts the player and every dummy in the simulation, and names the dummies", () => {
    const scenario = TRAINING_SCENARIOS[0];
    if (scenario === undefined) {
      throw new Error("no scenarios");
    }
    const setup = setupScenario(scenario, newCharacter("c1"));
    const ids = [...setup.simulation.participants()].map((p) => p.id);
    expect(ids).toEqual([SELF_ID, ...scenario.dummies.map((dummy) => dummy.id)]);
    for (const dummy of scenario.dummies) {
      expect(setup.names.get(dummy.id)).toBe(dummy.label);
    }
  });
});

describe("playerArming", () => {
  it("packs the bar, as the server does", () => {
    const character = setSkill(
      setProfessions(newCharacter("c1"), "elementalist", undefined),
      3,
      "elementalist.fireball",
    );
    const arming = playerArming(character);
    expect(arming.problem).toBeUndefined();
    expect(arming.skillBar).toEqual(["elementalist.fireball"]);
  });

  it("an empty bar is legal", () => {
    expect(playerArming(newCharacter("c1")).problem).toBeUndefined();
  });

  it("an illegal build is parked with an empty bar, not given the house loadout", () => {
    const character = newCharacter("c1");
    // A skill the profession cannot use. No path through the editor makes
    // this; a hand-edited or imported record could.
    const illegal = {
      ...character,
      skillBar: ["monk.orison-of-healing", ...character.skillBar.slice(1)],
    };
    const arming = playerArming(illegal);
    expect(arming.problem).toBeDefined();
    expect(arming.skillBar).toEqual([]);
  });
});
