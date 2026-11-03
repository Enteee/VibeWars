import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects } from "./effects.js";
import { NO_RANKS, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/** Purge Signet, Cautery Signet and Blessed Signet (#2260): the corpus's numbers. */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const ENCHANTMENTS = ["way-of-perfection", "critical-defenses", "mystic-regeneration"] as const;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function bearing(
  id: string,
  statuses: readonly StatusId[],
  overrides: Partial<Combatant> = {},
): Combatant {
  const combatant = makeCombatant({ id, ...overrides });
  for (const status of statuses) {
    combatant.statuses.apply(status, 20, "x", NO_RANKS);
  }
  return combatant;
}

/** `user` pays for `skillId` and it lands on `target`; `party` stands 100 apart beside them. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  party: readonly Combatant[] = [],
): void {
  payCost(skill(skillId), user);
  resolveSkillEffects({
    surroundings: new Map(
      [...new Set([user, target, ...party])].map((combatant, index) => [
        combatant.id,
        { combatant, position: vec2(index * 100, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

describe("the three are the corpus's (#2260)", () => {
  it.each([
    ["monk.purge-signet", 295, undefined, 2, 20, false, "single-ally"],
    ["ritualist.cautery-signet", 1588, undefined, 2, 15, true, "self"],
    ["monk.blessed-signet", 297, "monk.divine-favor", 2, 10, false, "self"],
  ] as const)(
    "%s: gwId %i, %s, %d s, %i s recharge, elite %s, %s",
    (id, gwId, attributeId, activation, recharge, elite, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type: "signet",
        attributeId,
        cost: undefined,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("Purge Signet (#2260)", () => {
  it("on a clean ally: nothing removed, no energy lost", () => {
    const monk = bearing("m", [], { energy: 30 });
    use(monk, "monk.purge-signet", bearing("a", []));
    expect(monk.energy).toBe(30);
  });

  it("a hex and a condition: both gone, 20 energy lost", () => {
    const monk = bearing("m", [], { energy: 30 });
    const ally = bearing("a", ["mark-of-death", "bleeding"]);
    use(monk, "monk.purge-signet", ally);
    expect(ally.statuses.countByCategory("hex")).toBe(0);
    expect(ally.statuses.countByCategory("condition")).toBe(0);
    expect(monk.energy).toBe(10);
  });

  it("3 removed with 12 energy: all removed, the caster ends at 0", () => {
    const monk = bearing("m", [], { energy: 12 });
    const ally = bearing("a", ["mark-of-death", "bleeding", "poison"]);
    use(monk, "monk.purge-signet", ally);
    expect(ally.statuses.active).toEqual([]);
    expect(monk.energy).toBe(0);
  });
});

describe("Cautery Signet (#2260)", () => {
  it("clears the party and burns the caster 1 s for each condition removed", () => {
    const rit = bearing("r", ["blind"]);
    const party = [bearing("b", ["bleeding", "poison"]), bearing("d", ["crippled"])];
    use(rit, "ritualist.cautery-signet", rit, party);
    for (const member of party) {
      expect(member.statuses.countByCategory("condition"), member.id).toBe(0);
    }
    expect(rit.statuses.get("burning")?.remainingSeconds).toBe(4);
    expect(rit.statuses.countByCategory("condition")).toBe(1);
  });

  it("with no conditions anywhere: no Burning", () => {
    const rit = bearing("r", []);
    use(rit, "ritualist.cautery-signet", rit, [bearing("b", [])]);
    expect(rit.statuses.has("burning")).toBe(false);
  });

  it("leaves a foe's conditions", () => {
    const rit = bearing("r", []);
    const foe = bearing("f", ["bleeding"], { team: 1 });
    use(rit, "ritualist.cautery-signet", rit, [foe]);
    expect(foe.statuses.has("bleeding")).toBe(true);
    expect(rit.statuses.has("burning")).toBe(false);
  });
});

describe("Blessed Signet (#2260)", () => {
  /** A monk at `rank` Divine Favor maintaining `count` enchantments, 3 to an ally. */
  function maintaining(count: number, rank: number): { monk: Combatant; party: Combatant[] } {
    const monk = bearing("m", [], {
      energy: 0,
      attributeRanks: new Map([["monk.divine-favor", rank]]),
    });
    const party = [0, 1, 2].map((index) => bearing(`a${String(index)}`, []));
    for (let n = 0; n < count; n += 1) {
      party[Math.floor(n / 3)]?.statuses.maintain(
        ENCHANTMENTS[n % 3] ?? "way-of-perfection",
        "m",
        n,
        NO_RANKS,
      );
    }
    return { monk, party };
  }

  it.each([
    [0, 15, 0],
    [2, 15, 6],
    [9, 15, 24],
    [2, 0, 3],
    [9, 0, 3],
    [9, 12, 20],
  ])("%i maintained at rank %i: %i energy", (count, rank, gained) => {
    const { monk, party } = maintaining(count, rank);
    use(monk, "monk.blessed-signet", monk, party);
    expect(monk.energy).toBe(gained);
  });

  it("a timed enchantment of the caster's does not count", () => {
    const { monk, party } = maintaining(0, 15);
    monk.statuses.apply("way-of-perfection", 20, "m", NO_RANKS);
    use(monk, "monk.blessed-signet", monk, party);
    expect(monk.energy).toBe(0);
  });
});
