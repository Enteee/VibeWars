import { describe, expect, it } from "vitest";

import { bareArmorSet } from "../equipment/armor.js";
import { NO_UPGRADES } from "../equipment/mods.js";
import { resolveLoadout } from "../equipment/resolve.js";
import type { ProfessionId } from "../professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { loadoutSpec, MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;

/** A character in bare armor with a sword, as a build becomes one. */
function bare(id: string, profession: ProfessionId): ParticipantSpec {
  const loadout = resolveLoadout(
    {
      primaryProfession: profession,
      secondaryProfession: undefined,
      allocatedRanks: new Map(),
      equipment: {
        weaponSets: [
          {
            mainHand: { weaponId: "sword", requirementAttributeId: null, upgrades: NO_UPGRADES },
            offHand: null,
          },
          null,
          null,
          null,
        ],
        armor: bareArmorSet(),
      },
    },
    RULES.combat,
  );
  return { id, team: 0, skillBar: [], spawn: vec2(0, 0), facing: 0, ...loadoutSpec(loadout) };
}

describe("a character's base Health is GW1's (#4002)", () => {
  it("spawns a bare Warrior at 480 and a bare Dervish at 505", () => {
    const sim = new MatchSimulation({
      seed: "base-health",
      participants: [bare("w", "warrior"), bare("d", "dervish")],
    });
    for (const [id, health] of [
      ["w", 480],
      ["d", 505],
    ] as const) {
      const combatant = sim.get(id)?.combatant;
      expect(combatant?.maxHealth).toBe(health);
      expect(combatant?.health).toBe(health);
    }
  });
});
