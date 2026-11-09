import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Balthazar's Spirit (#2302): while maintained, the ally gains 2...5
 * adrenaline points, not strikes, in each adrenaline skill and 1 Energy
 * whenever a foe damages it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const SMITING = "monk.smiting-prayers";
/** A Paragon's adrenaline skill: 7 strikes, 175 points. */
const ADRENAL = "paragon.wild-throw";
const noSpread: SpreadGainedCondition = () => [];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A Monk at Smiting `rank` maintains Balthazar's Spirit on ally `a`, whose pools are `pools`. */
function scene(rank: number, pools: ReadonlyMap<string, number>) {
  const monk = makeCombatant({ id: "m", attributeRanks: new Map([[SMITING, rank]]) });
  const ally = makeCombatant({ id: "a", energy: 10, adrenaline: new Map(pools) });
  const foe = makeCombatant({ id: "f", team: 1 });
  payCost(skill("monk.balthazars-spirit"), monk);
  resolveSkillEffects({
    surroundings: new Map(),
    skill: skill("monk.balthazars-spirit"),
    caster: monk,
    targets: [ally],
    rng: createRng(1),
    rules: RULES.combat,
  });
  ally.statuses.drainChanges();
  return { monk, ally, foe, everyone: [monk, ally, foe] };
}

/** `foe` hits `bearer` once, and the triggers fire as the simulation's drain does. */
function hit(bearer: Combatant, foe: Combatant, everyone: readonly Combatant[]): CombatEvent[] {
  bearer.statuses.recordDamageFromFoe(foe.id, "slashing", 20, false);
  return bearer.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(bearer, change, noSpread, {
      sourceOf: (id) => everyone.find((combatant) => combatant.id === id),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    }).flatMap(({ events }) => events),
  );
}

describe("Balthazar's Spirit (#2302)", () => {
  it("is the corpus's: gwId 242, a maintained Smiting enchantment, 10 energy, 2 s, no recharge", () => {
    expect(skill("monk.balthazars-spirit")).toMatchObject({
      gwId: 242,
      type: "enchantment",
      attributeId: SMITING,
      cost: { kind: "energy", amount: 10 },
      activationSeconds: 2,
      rechargeSeconds: 0,
      elite: false,
      range: RANGE_SPELL,
      target: "single-ally",
      effects: [{ kind: "maintain-status", on: "target", statusId: "balthazars-spirit" }],
    });
  });

  it.each([
    [0, 2],
    [12, 4],
    [15, 5],
  ] as const)("at Smiting %i each hit gives %i points and 1 Energy", (rank, points) => {
    const { ally, foe, everyone } = scene(rank, new Map([[ADRENAL, 0]]));

    const events = hit(ally, foe, everyone);

    expect(ally.adrenaline.get(ADRENAL)).toBe(points);
    expect(ally.energy).toBe(11);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "adrenaline-gained", targetId: "a", strikes: points / 25 }),
    );
  });

  it("adds up hit by hit, a pool capped at its skill's cost", () => {
    const { ally, foe, everyone } = scene(12, new Map([[ADRENAL, 172]]));

    hit(ally, foe, everyone);
    expect(ally.adrenaline.get(ADRENAL)).toBe(175);
    hit(ally, foe, everyone);
    expect(ally.adrenaline.get(ADRENAL)).toBe(175);
    expect(ally.energy).toBe(12);
  });

  it("gives a bar with no adrenaline skill only the Energy", () => {
    const { ally, foe, everyone } = scene(12, new Map());

    const events = hit(ally, foe, everyone);

    expect(ally.energy).toBe(11);
    expect(events.some(({ kind }) => kind === "adrenaline-gained")).toBe(false);
  });

  it("says points, not strikes", () => {
    expect(
      describeStatus("balthazars-spirit", new Map([[SMITING, 12]]), EN_WORDS, EN_NAMES),
    ).toContain("4 adrenaline");
  });
});
