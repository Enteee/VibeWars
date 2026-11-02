import { describe, expect, it } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { createRng } from "../rng.js";
import { vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { aggregateModifiers, NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mesmer staples 5 (#2231): Energy Drain, Signet of Weariness, Conjure
 * Nightmare, Images of Remorse, Confusing Images, Discharge Enchantment
 * and Expel Hexes. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RANKS = new Map([
  ["mesmer.illusion-magic", 12],
  ["mesmer.domination-magic", 12],
  ["mesmer.inspiration-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function mesmer(): Combatant {
  return makeCombatant({ id: "m", attributeRanks: RANKS, energy: 20 });
}

function foe(id: string, energy = 30): Combatant {
  return makeCombatant({ id, team: 1, energy });
}

/** `user` pays for `skillId` and it lands on `target`, `around` standing at their distance from it. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  around: readonly (readonly [Combatant, number])[] = [],
): { events: CombatEvent[]; rechargeFraction: number } {
  payCost(skill(skillId), user);
  const row: (readonly [Combatant, number])[] = [[user, -200], [target, 0], ...around];
  return resolveSkillEffects({
    surroundings: new Map(
      row.map(([combatant, x]) => [
        combatant.id,
        { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
      ]),
    ),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damages(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("Energy Drain (#2231)", () => {
  it("takes 8 and gives 3 for each", () => {
    const caster = mesmer();
    const target = foe("f");
    use(caster, "mesmer.energy-drain", target);
    expect(target.energy).toBe(22);
    expect(caster.energy).toBe(15 + 24);
  });

  it("gives only for what the foe had, and nothing from an empty one", () => {
    const caster = mesmer();
    use(caster, "mesmer.energy-drain", foe("f", 3));
    expect(caster.energy).toBe(15 + 9);
    const dry = mesmer();
    use(dry, "mesmer.energy-drain", foe("g", 0));
    expect(dry.energy).toBe(15);
  });
});

describe("Signet of Weariness (#2231)", () => {
  it("drains 7 and weakens for 10 s, the target and each nearby foe once", () => {
    const caster = mesmer();
    const target = foe("f");
    const near = foe("n");
    const far = foe("x");
    use(caster, "mesmer.signet-of-weariness", target, [
      [near, AREA_NEARBY - 10],
      [far, AREA_NEARBY + 100],
    ]);
    expect(caster.energy).toBe(20);
    for (const hit of [target, near]) {
      expect(hit.energy).toBe(23);
      expect(hit.statuses.get("weakness")?.remainingSeconds).toBe(10);
    }
    expect(far.energy).toBe(30);
    expect(far.statuses.has("weakness")).toBe(false);
  });
});

describe("Conjure Nightmare (#2231)", () => {
  it("hexes for 13 s at -8 Health degeneration", () => {
    const target = foe("f");
    use(mesmer(), "mesmer.conjure-nightmare", target);
    expect(target.statuses.get("conjure-nightmare")?.remainingSeconds).toBe(13);
    expect(aggregateModifiers(target.statuses.active).healthPips).toBe(-8);
  });
});

describe("Images of Remorse (#2231)", () => {
  it("hexes for 9 s at -3, and an attacking foe takes 44", () => {
    const target = foe("f");
    target.cast.beginCast("warrior.power-attack", "m", 1, undefined);
    const { events } = use(mesmer(), "mesmer.images-of-remorse", target);
    expect(damages(events, "f")).toEqual([44]);
    expect(target.statuses.get("images-of-remorse")?.remainingSeconds).toBe(9);
    expect(aggregateModifiers(target.statuses.active).healthPips).toBe(-3);
  });

  it("only hexes a foe that is casting a spell, or idle", () => {
    const casting = foe("f");
    casting.cast.beginCast("mesmer.energy-drain", "m", 1, undefined);
    for (const target of [casting, foe("g")]) {
      const { events } = use(mesmer(), "mesmer.images-of-remorse", target);
      expect(damages(events, target.id)).toEqual([]);
      expect(target.statuses.has("images-of-remorse")).toBe(true);
    }
  });
});

describe("Confusing Images (#2231)", () => {
  it("hexes for 8 s, doubling activations as Migraine does", () => {
    const target = foe("f");
    use(mesmer(), "mesmer.confusing-images", target);
    expect(target.statuses.get("confusing-images")?.remainingSeconds).toBe(8);
    expect(aggregateModifiers(target.statuses.active).skillActivationMultiplier).toBe(2);
  });
});

describe("Discharge Enchantment (#2231)", () => {
  it("strips one enchantment, and recharges 44% faster only off a hexed foe", () => {
    const plain = foe("f");
    plain.statuses.apply("guardian", 10, "f", NO_RANKS);
    plain.statuses.apply("vital-blessing", 10, "f", NO_RANKS);
    expect(use(mesmer(), "mesmer.discharge-enchantment", plain).rechargeFraction).toBe(0);
    expect(
      plain.statuses.active.filter(({ id }) => id === "guardian" || id === "vital-blessing"),
    ).toHaveLength(1);

    const hexed = foe("g");
    hexed.statuses.apply("migraine", 10, "m", NO_RANKS);
    expect(use(mesmer(), "mesmer.discharge-enchantment", hexed).rechargeFraction).toBe(0.44);
  });
});

describe("Expel Hexes (#2231)", () => {
  it("removes up to 2 hexes from an ally, and one alone without fuss", () => {
    const ally = makeCombatant({ id: "a" });
    for (const hex of ["migraine", "conjure-nightmare", "confusing-images"] as const) {
      ally.statuses.apply(hex, 10, "f", NO_RANKS);
    }
    use(mesmer(), "mesmer.expel-hexes", ally);
    expect(ally.statuses.active.map(({ id }) => id)).toHaveLength(1);

    const once = makeCombatant({ id: "b" });
    once.statuses.apply("migraine", 10, "f", NO_RANKS);
    use(mesmer(), "mesmer.expel-hexes", once);
    expect(once.statuses.active).toEqual([]);
  });
});
