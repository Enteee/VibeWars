import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import type { CombatEvent } from "./effects.js";
import { getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { landBlow, PLAIN_BLOW, resolveSwing, weaponSnapshotOf } from "./weapon-attack.js";

/**
 * Calculated Risk (#2471): a hex whose bearer's blows hit 10 harder, and
 * half of them land on the bearer instead, up to a cap by the Mesmer's
 * Illusion Magic.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const RISK = "mesmer.calculated-risk";

const ranks = (rank: number): ReadonlyMap<string, number> =>
  new Map([["mesmer.illusion-magic", rank]]);

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

/**
 * A stream whose damage rolls are `roll`, whose float draws are 0.99 (no
 * crit, no backfire) but for the one at `at`, which is `float`; `draws`
 * counts them.
 */
function stream(roll: number, at: number, float: number): SimulationRng & { draws: number } {
  const rng = Object.assign(createRng(1), { draws: 0 });
  return Object.assign(rng, {
    nextInt: () => roll,
    nextFloat: () => {
      rng.draws += 1;
      return rng.draws - 1 === at ? float : 0.99;
    },
  });
}

interface Blow {
  readonly attacker: Combatant;
  readonly victim: Combatant;
  readonly events: CombatEvent[];
  readonly draws: number;
}

/** One blow by an attacker hexed at `rank`, or not hexed, on a fresh victim. */
function blow(rank: number | undefined, rng: SimulationRng & { draws: number }): Blow {
  const attacker = makeCombatant({ id: "x", team: 1, maxHealth: 1000, health: 1000 });
  const victim = makeCombatant({ id: "v", team: 0, maxHealth: 1000, health: 1000 });
  if (rank !== undefined) {
    attacker.statuses.apply("calculated-risk", 10, "m", ranks(rank));
  }
  const events: CombatEvent[] = [];
  landBlow(
    weaponSnapshotOf(attacker),
    attacker,
    victim,
    PLAIN_BLOW,
    false,
    rng,
    RULES.combat,
    events,
    new Map(),
  );
  return { attacker, victim, events, draws: rng.draws };
}

const lost = (combatant: Combatant): number => 1000 - combatant.health;

/** How many floats a plain blow draws: the backfire roll comes after them. */
const PLAIN_DRAWS = blow(undefined, stream(10, -1, 0)).draws;

describe("Calculated Risk is the corpus's (#2471)", () => {
  it("costs 10 Energy, activates in 1 s, recharges in 12 s, of Illusion Magic", () => {
    expect(skillOf(RISK)).toMatchObject({
      gwId: 2053,
      type: "hex",
      elite: false,
      profession: "mesmer",
      attributeId: "mesmer.illusion-magic",
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 1,
      rechargeSeconds: 12,
      range: RANGE_SPELL,
      target: "single-enemy",
    });
  });

  it("lasts 3 s at rank 0 and 10.2 s at rank 12, with +10 damage on its bearer's attacks", () => {
    expect(skillOf(RISK).effects).toEqual([
      {
        kind: "apply-status",
        statusId: "calculated-risk",
        durationSeconds: {
          scaling: { attributeId: "mesmer.illusion-magic", atZero: 3, atTwelve: 10.2 },
        },
      },
    ]);
    expect(getStatusDefinition("calculated-risk")).toMatchObject({
      category: "hex",
      attackDamageDelta: 10,
      attackBackfire: { chance: 0.5 },
    });
  });

  it("says its cap at the rank it is read at", () => {
    const text = (rank: number): string =>
      describeSkill(skillOf(RISK), ranks(rank))
        .effects.map(({ text }) => text)
        .join(" ");
    expect(text(0)).toContain("50% chance to deal its damage to it instead, up to 15");
    expect(text(12)).toContain("50% chance to deal its damage to it instead, up to 51");
  });
});

describe("a backfired blow (#2471)", () => {
  it("draws no roll without the hex, so other fights' streams do not move", () => {
    const hexed = blow(12, stream(10, -1, 0));
    expect(hexed.draws).toBe(PLAIN_DRAWS + 1);
  });

  it("hits 10 harder, and on a failed roll the target takes it all", () => {
    const plain = blow(undefined, stream(10, -1, 0));
    const kept = blow(12, stream(10, PLAIN_DRAWS, 0.5));
    expect(lost(kept.victim)).toBeGreaterThan(lost(plain.victim));
    expect(lost(kept.attacker)).toBe(0);
  });

  it("moves the target's damage, after its armor, onto the bearer; the target takes 0", () => {
    const kept = blow(12, stream(10, PLAIN_DRAWS, 0.5));
    const back = blow(12, stream(10, PLAIN_DRAWS, 0.49));
    expect(lost(back.victim)).toBe(0);
    expect(lost(back.attacker)).toBe(lost(kept.victim));
    expect(back.events).toContainEqual({
      kind: "damage",
      targetId: "x",
      amount: lost(kept.victim),
      critical: false,
    });
  });

  it("caps what it moves at 15 at rank 0 and 51 at rank 12; the target still takes 0", () => {
    for (const [rank, cap] of [
      [0, 15],
      [12, 51],
    ] as const) {
      const kept = blow(rank, stream(400, PLAIN_DRAWS, 0.5));
      expect(lost(kept.victim)).toBeGreaterThan(cap);
      const back = blow(rank, stream(400, PLAIN_DRAWS, 0));
      expect(lost(back.attacker)).toBe(cap);
      expect(lost(back.victim)).toBe(0);
    }
  });

  it("never comes from a miss: no roll, no damage either way", () => {
    const attacker = makeCombatant({ id: "x", team: 1, maxHealth: 1000, health: 1000 });
    const victim = makeCombatant({ id: "v", team: 0, maxHealth: 1000, health: 1000 });
    attacker.statuses.apply("calculated-risk", 10, "m", ranks(12));
    victim.statuses.apply("shadow-form", 10, "v", ranks(12));
    const rng = stream(10, -1, 0);
    resolveSwing({
      attacker,
      target: {
        combatant: victim,
        position: vec2(40, 0),
        creature: undefined,
      },
      surroundings: new Map(),
      rng,
      rules: RULES.combat,
      exposed: () => false,
    });
    expect(rng.draws).toBe(0);
    expect([lost(attacker), lost(victim)]).toEqual([0, 0]);
  });

  it("lands both outcomes over a seeded run", () => {
    const rng = createRng(2471);
    const outcomes = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      const { attacker, victim } = blow(12, Object.assign(rng, { draws: 0 }));
      outcomes.add(lost(attacker) > 0 && lost(victim) === 0 ? "back" : "kept");
    }
    expect(outcomes).toEqual(new Set(["back", "kept"]));
  });
});
