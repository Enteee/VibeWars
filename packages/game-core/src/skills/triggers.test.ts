import { describe, expect, it } from "vitest";

import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { makeCombatant } from "./testing.js";
import type { StatusId } from "./status.js";
import { fireTriggers } from "./triggers.js";
import type { Combatant } from "./types.js";

describe("fireTriggers", () => {
  /** A bearer singing a paragon's song and hexed with a necromancer's Spiteful Spirit. */
  function bearer(): { bearer: Combatant; sources: Map<string, Combatant> } {
    const self = makeCombatant({ id: "b", team: 0, health: 200 });
    const sources = new Map([
      ["p", makeCombatant({ id: "p", team: 0 })],
      ["n", makeCombatant({ id: "n", team: 1 })],
    ]);
    self.statuses.apply("song-of-restoration", 10, "p");
    self.statuses.apply("spiteful-spirit", 8, "n");
    return { bearer: self, sources };
  }

  const fired = (spared: ReadonlySet<StatusId>): string[] => {
    const { bearer: self, sources } = bearer();
    return fireTriggers(
      self,
      "bearer-uses-skill",
      {
        sourceOf: (id) => sources.get(id),
        rng: createRng(1),
        rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
        surroundings: new Map(),
        usedSkillId: "paragon.song-of-restoration",
      },
      spared,
    ).map(({ skillId }) => skillId);
  };

  it("fires every status that answers the use", () => {
    expect(fired(new Set())).toEqual([
      "paragon.song-of-restoration",
      "necromancer.spiteful-spirit",
    ]);
  });

  it("fires nothing for a status the skill put on its own user, and the rest still (#999)", () => {
    expect(fired(new Set(["song-of-restoration"]))).toEqual(["necromancer.spiteful-spirit"]);
  });
});
