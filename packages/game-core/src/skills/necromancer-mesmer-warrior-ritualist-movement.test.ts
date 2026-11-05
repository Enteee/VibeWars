import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { applyIntent } from "../match/apply-intent.js";
import { MatchSimulation } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent, type SkillOutcome } from "./effects.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "./status.js";
import { makeCombatant, strikesOf } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill, Surroundings } from "./types.js";

/**
 * Fevered Dreams, Plague Sending, Mark of Fury, Foul Feast, "I Will
 * Survive!" and Resilient Was Xiko (#2259): the corpus's numbers, at
 * rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "mesmer.illusion-magic",
  "necromancer.curses",
  "necromancer.blood-magic",
  "necromancer.soul-reaping",
  "warrior.strength",
  "ritualist.restoration-magic",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));
/** An adrenaline skill, for a pool a gain can fill. */
const ADRENAL = "warrior.sever-artery";
const noSpread: SpreadGainedCondition = () => [];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function bearing(
  id: string,
  team: number,
  statuses: readonly StatusId[],
  overrides: Partial<Combatant> = {},
): Combatant {
  const combatant = makeCombatant({ id, team, ...overrides });
  statuses.forEach((status, at) => combatant.statuses.apply(status, 10 + at, "x", NO_RANKS));
  return combatant;
}

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): SkillOutcome {
  payCost(skill(skillId), user);
  return resolveSkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

/** Whatever `bearer`'s statuses recorded, fired as the simulation's drain does. */
function drain(bearer: Combatant, everyone: readonly Combatant[]): CombatEvent[] {
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

/** What `statusId` adds to `bearer`'s Health regeneration, in pips. */
function pipsOf(bearer: Combatant, statusId: StatusId): number {
  const without = aggregateModifiers(bearer.statuses.active.filter(({ id }) => id !== statusId));
  return aggregateModifiers(bearer.statuses.active).healthPips - without.healthPips;
}

const conditionsOf = (combatant: Combatant): number =>
  combatant.statuses.countByCategory("condition");

describe("the six are the corpus's, on their base ids (#2259)", () => {
  it.each([
    ["mesmer.fevered-dreams", 55, "hex", "mesmer.illusion-magic", 5, 1, 15, true],
    ["necromancer.plague-sending", 149, "spell", "necromancer.curses", 1, 1, 5, false],
    ["necromancer.mark-of-fury", 1360, "hex", "necromancer.blood-magic", 5, 0.75, 10, false],
    ["necromancer.foul-feast", 2057, "spell", "necromancer.soul-reaping", 5, 0.25, 4, false],
    ["warrior.i-will-survive", 368, "shout", "warrior.strength", 5, 0, 30, false],
    [
      "ritualist.resilient-was-xiko",
      1221,
      "item-spell",
      "ritualist.restoration-magic",
      5,
      1,
      10,
      false,
    ],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
        range: RANGE_SPELL,
      });
    },
  );

  it("Foul Feast cannot target its caster", () => {
    expect(skill("necromancer.foul-feast").target).toBe("single-other-ally");
  });
});

describe("Fevered Dreams (#2259)", () => {
  it.each([
    [12, 13],
    [0, 5],
  ] as const)("at Illusion Magic %i hexes for %i s", (rank, seconds) => {
    const mesmer = makeCombatant({ id: "m", attributeRanks: ranked(rank) });
    const foe = bearing("f", 1, []);
    use(mesmer, "mesmer.fevered-dreams", foe);
    expect(foe.statuses.get("fevered-dreams")).toMatchObject({
      sourceId: "m",
      remainingSeconds: seconds,
    });
  });
});

describe("Plague Sending (#2259)", () => {
  const CONDITIONS: readonly StatusId[] = ["bleeding", "poison", "blind", "crippled"];

  /** A Necromancer at `rank` with `conditions`; its foe `t`, a foe beside `t`, one beside the caster. */
  function scene(rank: number, conditions: readonly StatusId[] = CONDITIONS) {
    const caster = bearing("n", 0, conditions, { attributeRanks: ranked(rank) });
    const target = bearing("t", 1, []);
    const beside = bearing("beside", 1, []);
    const byCaster = bearing("by-caster", 1, []);
    const surroundings = placed(
      [caster, vec2(0, 0)],
      [target, vec2(300, 0)],
      [beside, vec2(300, AREA_ADJACENT - 5)],
      [byCaster, vec2(0, AREA_ADJACENT - 5)],
    );
    return { caster, target, beside, byCaster, surroundings };
  }

  it.each([
    [12, 3],
    [0, 1],
  ] as const)(
    "at Curses %i moves %i conditions, each copied to the foes beside the target",
    (rank, moved) => {
      const { caster, target, beside, byCaster, surroundings } = scene(rank);
      use(caster, "necromancer.plague-sending", target, surroundings);

      expect(conditionsOf(target)).toBe(moved);
      expect(conditionsOf(beside)).toBe(moved);
      expect(conditionsOf(caster)).toBe(CONDITIONS.length - moved);
      expect(conditionsOf(byCaster)).toBe(0);
      // The newest goes first, with the time it had left.
      expect(target.statuses.get("crippled")?.remainingSeconds).toBe(13);
      expect(beside.statuses.get("crippled")?.remainingSeconds).toBe(13);
    },
  );

  it("with no conditions moves nothing, and costs its Energy and 10% Health", () => {
    const { caster, target, beside, surroundings } = scene(12, []);
    const energy = caster.energy;
    const { events } = use(caster, "necromancer.plague-sending", target, surroundings);

    expect(caster.energy).toBe(energy - 1);
    expect(events).toContainEqual({ kind: "sacrifice", targetId: "n", amount: 50 });
    expect(conditionsOf(target)).toBe(0);
    expect(conditionsOf(beside)).toBe(0);
  });
});

describe("Mark of Fury (#2259)", () => {
  /** A Necromancer at `rank` has hexed foe `f`; `w`, its ally, attacks `f`. */
  function scene(rank: number) {
    const necro = makeCombatant({ id: "n", attributeRanks: ranked(rank) });
    const foe = bearing("f", 1, []);
    const ally = makeCombatant({ id: "w", adrenaline: new Map([[ADRENAL, 0]]) });
    use(necro, "necromancer.mark-of-fury", foe);
    foe.statuses.drainChanges();
    return { necro, foe, ally, everyone: [necro, foe, ally] };
  }

  it.each([0, 12])("at Blood Magic %i hexes for 5 s", (rank) => {
    expect(scene(rank).foe.statuses.get("mark-of-fury")?.remainingSeconds).toBe(5);
  });

  it.each([
    [12, 2],
    [0, 0],
  ] as const)("at Blood Magic %i each hit gives the attacker %i strikes", (rank, strikes) => {
    const { foe, ally, everyone } = scene(rank);
    foe.statuses.recordHitByAttack("w", 20, undefined, WEAPONS.sword);
    drain(foe, everyone);
    expect(strikesOf(ally, ADRENAL)).toBe(strikes);
  });

  it("gives nothing without a hit", () => {
    const { foe, ally, everyone } = scene(12);
    drain(foe, everyone);
    expect(strikesOf(ally, ADRENAL)).toBe(0);
  });

  it.each([
    [12, 12],
    [0, 1],
  ] as const)("at Blood Magic %i a removal Cracks the foe's Armor for %i s", (rank, seconds) => {
    const { foe, everyone } = scene(rank);
    foe.statuses.remove("mark-of-fury");
    drain(foe, everyone);
    expect(foe.statuses.get("cracked-armor")).toMatchObject({
      sourceId: "n",
      remainingSeconds: seconds,
    });
  });

  it("Cracks the foe's Armor when it expires too", () => {
    const { foe, everyone } = scene(12);
    foe.statuses.advance(5.1, false);
    drain(foe, everyone);
    expect(foe.statuses.has("mark-of-fury")).toBe(false);
    expect(foe.statuses.get("cracked-armor")?.remainingSeconds).toBe(12);
  });
});

describe("Foul Feast (#2259)", () => {
  /** A Necromancer at `rank`, 300 Health and 10 Energy, and its ally bearing `conditions`. */
  function scene(rank: number, conditions: readonly StatusId[]) {
    const necro = makeCombatant({ id: "n", attributeRanks: ranked(rank), health: 300 });
    const ally = bearing("a", 0, conditions);
    payCost(skill("necromancer.foul-feast"), necro);
    necro.energy = 10;
    const outcome = resolveSkillEffects({
      surroundings: new Map(),
      skill: skill("necromancer.foul-feast"),
      caster: necro,
      targets: [ally],
      rng: createRng(1),
      rules: RULES.combat,
    });
    return { necro, ally, outcome };
  }

  it.each([
    [12, 300 + 3 * 36, 10 + 3 * 4],
    [0, 300, 10 + 3 * 2],
  ] as const)(
    "at Soul Reaping %i takes all three: %i Health, %i Energy",
    (rank, health, energy) => {
      const { necro, ally } = scene(rank, ["bleeding", "poison", "blind"]);
      expect(conditionsOf(ally)).toBe(0);
      expect(conditionsOf(necro)).toBe(3);
      expect(necro.health).toBe(health);
      expect(necro.energy).toBe(energy);
    },
  );

  it.each([
    [["bleeding", "disease"], 0.5],
    [["bleeding", "poison"], 0],
  ] as const)("on an ally with %j recharges %d faster", (conditions, fraction) => {
    const { necro, outcome } = scene(12, conditions);
    expect(outcome.rechargeFraction).toBe(fraction);
    expect(necro.statuses.has("bleeding")).toBe(true);
  });

  it("on an ally with none: no Health, no Energy, the normal recharge", () => {
    const { necro, outcome } = scene(12, []);
    expect(necro.health).toBe(300);
    expect(necro.energy).toBe(10);
    expect(outcome.rechargeFraction).toBe(0);
  });
});

describe('"I Will Survive!" (#2259)', () => {
  it.each([
    [12, 10],
    [0, 5],
  ] as const)("at Strength %i lasts %i s", (rank, seconds) => {
    const warrior = makeCombatant({ id: "w", attributeRanks: ranked(rank) });
    use(warrior, "warrior.i-will-survive", warrior);
    expect(warrior.statuses.get("i-will-survive")?.remainingSeconds).toBe(seconds);
  });

  it("gives +3 Health regeneration for each condition, recounted, and none for a hex", () => {
    const warrior = makeCombatant({ id: "w", attributeRanks: ranked(12) });
    use(warrior, "warrior.i-will-survive", warrior);
    expect(pipsOf(warrior, "i-will-survive")).toBe(0);
    warrior.statuses.apply("bleeding", 10, "x", NO_RANKS);
    warrior.statuses.apply("poison", 10, "x", NO_RANKS);
    warrior.statuses.apply("mark-of-pain", 10, "x", NO_RANKS);
    expect(pipsOf(warrior, "i-will-survive")).toBe(6);
    warrior.statuses.end("bleeding");
    expect(pipsOf(warrior, "i-will-survive")).toBe(3);
  });
});

describe("Resilient Was Xiko (#2259)", () => {
  /** A Ritualist `r` at `rank` with Xiko, holding the ashes, and a foe beside it. */
  function holding(rank: number): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "resilient-was-xiko",
      participants: [
        {
          id: "r",
          team: 0,
          skillBar: ["ritualist.resilient-was-xiko"],
          attributeRanks: ranked(rank),
          equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          maxHealth: 500,
          maxEnergy: 100,
          spawn: vec2(0, 0),
          facing: 0,
        },
        {
          id: "x",
          team: 1,
          skillBar: [],
          attributeRanks: new Map(),
          equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          maxHealth: 500,
          spawn: vec2(1000, 0),
          facing: 0,
        },
      ],
    });
    expect(applyIntent(sim, "r", { kind: "use-skill", slot: 0 })).toBeNull();
    stepFor(sim, 2.5);
    return sim;
  }

  function stepFor(sim: MatchSimulation, seconds: number): void {
    for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
      sim.step(DT);
    }
  }

  function ritualist(sim: MatchSimulation): Combatant {
    const found = sim.get("r");
    if (found === undefined) {
      throw new Error("no ritualist");
    }
    return found.combatant;
  }

  /** Four conditions on `r`. */
  function afflict(r: Combatant): void {
    for (const id of ["bleeding", "poison", "blind", "crippled"] as const) {
      r.statuses.apply(id, 30, "x", NO_RANKS);
    }
  }

  it.each([
    [12, 17],
    [0, 5],
  ] as const)("at Restoration Magic %i holds the ashes for %i s", (rank, seconds) => {
    const held = ritualist(holding(rank)).statuses.get("resilient-was-xiko")?.remainingSeconds;
    expect(held).toBeGreaterThan(seconds - 2);
    expect(held).toBeLessThanOrEqual(seconds);
  });

  it("gives +3 Health regeneration for each hex and each condition held", () => {
    const r = ritualist(holding(12));
    r.statuses.apply("bleeding", 10, "x", NO_RANKS);
    r.statuses.apply("poison", 10, "x", NO_RANKS);
    r.statuses.apply("mark-of-pain", 10, "x", NO_RANKS);
    expect(pipsOf(r, "resilient-was-xiko")).toBe(9);
  });

  it.each([
    [12, 3],
    [0, 1],
  ] as const)("at Restoration Magic %i the drop takes %i conditions", (rank, lost) => {
    const sim = holding(rank);
    const r = ritualist(sim);
    afflict(r);
    expect(applyIntent(sim, "r", { kind: "drop-bundle" })).toBeNull();
    expect(r.statuses.has("resilient-was-xiko")).toBe(false);
    expect(conditionsOf(r)).toBe(4 - lost);
  });

  it("takes them when another item spell drops the ashes too", () => {
    const sim = holding(12);
    const r = ritualist(sim);
    afflict(r);
    r.cast.endRecharge("ritualist.resilient-was-xiko");
    expect(applyIntent(sim, "r", { kind: "use-skill", slot: 0 })).toBeNull();
    stepFor(sim, 2.5);
    expect(conditionsOf(r)).toBe(1);
    expect(r.statuses.get("resilient-was-xiko")?.remainingSeconds).toBeGreaterThan(15);
  });

  it("takes them when the ashes run out", () => {
    const sim = holding(12);
    const r = ritualist(sim);
    afflict(r);
    stepFor(sim, 17);
    expect(r.statuses.has("resilient-was-xiko")).toBe(false);
    expect(conditionsOf(r)).toBe(1);
  });
});
