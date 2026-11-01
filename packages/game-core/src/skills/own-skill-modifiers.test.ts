import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2 } from "../vec2.js";
import { energyCostOf } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, NO_OWN_SKILL_BOOST, ownSkillBoost, type StatusId } from "./status.js";
import { makeCombatant, withStatusDefinitions } from "./testing.js";
import { effectiveActivationSeconds } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * One rule for "your X skills cost less, cast faster, heal less, recharge
 * faster, last longer" (#1761), and the six skills it lets in: Divine
 * Spirit, Blessed Aura, Healer's Covenant, Holy Haste, Practiced Stance
 * and Extend Enchantments. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ORISON = "monk.orison-of-healing";
const GUARDIAN = "monk.guardian";
const VOW = "dervish.vow-of-strength";
const APPLY_POISON = "ranger.apply-poison";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** A caster with no attribute ranks, bearing `statuses` for a minute each. */
function bearer(...statuses: StatusId[]): Combatant {
  const caster = makeCombatant({ id: "m", team: 0, health: 200, maxHealth: 500 });
  for (const id of statuses) {
    caster.statuses.apply(id, 60, "m", NO_RANKS);
  }
  return caster;
}

/** `skill` with its energy cost set to `amount`. */
function costing(id: string, amount: number): Skill {
  return { ...skill(id), cost: { kind: "energy", amount } };
}

/** `skill` landed by `caster` on itself, touched by what it bears. */
function landed(id: string, caster: Combatant): CombatEvent[] {
  const used = skill(id);
  return resolveSkillEffects({
    skill: used,
    caster,
    targets: [caster],
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
    own: ownSkillBoost(caster.statuses.active, used),
  }).events;
}

function healed(events: readonly CombatEvent[]): number[] {
  return events.flatMap((event) => (event.kind === "heal" ? [event.amount] : []));
}

describe("the rule (#1761)", () => {
  it("takes Energy off a matching skill's cost, never below 1, and 0 stays 0", () => {
    const caster = bearer("divine-spirit");
    expect(energyCostOf(costing(ORISON, 10), caster)).toBe(5);
    expect(energyCostOf(costing(ORISON, 5), caster)).toBe(1);
    expect(energyCostOf(costing(ORISON, 0), caster)).toBe(0);
  });

  it("leaves a skill its filter does not name alone: type, profession and attribute", () => {
    const caster = bearer("divine-spirit", "healers-covenant", "holy-haste");
    // A Ranger spell, a Monk signet: no Monk spell.
    expect(energyCostOf(costing("ranger.apply-poison", 10), caster)).toBe(10);
    expect(energyCostOf(costing("monk.signet-of-devotion", 10), caster)).toBe(10);
    // A Protection Prayers spell is a Monk spell, not a Healing Prayers one.
    expect(energyCostOf(costing(GUARDIAN, 10), caster)).toBe(5);
    expect(effectiveActivationSeconds(skill(GUARDIAN), caster)).toBe(1);
  });

  it("stacks: discounts add, multipliers multiply", () => {
    const caster = bearer("divine-spirit", "healers-covenant");
    expect(energyCostOf(costing(ORISON, 10), caster)).toBe(2);
    expect(ownSkillBoost(caster.statuses.active, skill(ORISON))).toEqual({
      energyBase: undefined,
      energyDiscount: 8,
      energyFloor: 1,
      energySurcharge: 0,
      activationMultiplier: 1,
      activationSecondsLess: 0,
      rechargeFaster: 0,
      rechargeSlower: 0,
      durationMultiplier: 1,
      healMultiplier: 0.8,
      notEasilyInterrupted: false,
    });
  });

  it("hastens a matching skill's activation", () => {
    const caster = bearer("holy-haste");
    expect(effectiveActivationSeconds(skill(ORISON), caster)).toBe(0.5);
  });

  it("lengthens what a matching skill puts on, and lessens what it heals", () => {
    const plain = bearer();
    const aura = bearer("blessed-aura");
    landed(GUARDIAN, plain);
    landed(GUARDIAN, aura);
    expect(plain.statuses.get("guardian")?.remainingSeconds).toBe(6);
    expect(aura.statuses.get("guardian")?.remainingSeconds).toBeCloseTo(7.8);

    const full = healed(landed(ORISON, bearer()));
    const covenant = healed(landed(ORISON, bearer("healers-covenant")));
    expect(covenant).toEqual(full.map((amount) => Math.round(amount * 0.8)));
  });

  it("spends a counted modifier only on a skill it names, then ends", () => {
    const caster = bearer("extend-enchantments");
    expect(caster.statuses.useOwnSkillModifiers(skill("dervish.extend-enchantments"))).toEqual([]);
    expect(caster.statuses.has("extend-enchantments")).toBe(true);
    expect(caster.statuses.useOwnSkillModifiers(skill(VOW))).toEqual(["extend-enchantments"]);
    expect(caster.statuses.has("extend-enchantments")).toBe(false);
  });
});

describe("in a match (#1761)", () => {
  const BAR = [
    "monk.divine-spirit",
    "monk.holy-haste",
    ORISON,
    "ranger.practiced-stance",
    APPLY_POISON,
    "dervish.extend-enchantments",
    VOW,
    "monk.healers-covenant",
  ] as const;
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
    (typeof BAR)[number],
    number
  >;

  function match(): MatchSimulation {
    const spec: ParticipantSpec = {
      id: "m",
      team: 0,
      skillBar: [...BAR],
      attributeRanks: new Map([
        ["monk.divine-favor", 12],
        ["monk.healing-prayers", 12],
        ["ranger.expertise", 12],
        ["dervish.mysticism", 12],
      ]),
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxEnergy: 1000,
      spawn: vec2(0, 0),
      facing: 0,
    };
    return new MatchSimulation({
      seed: "own-skill-modifiers",
      participants: [spec, { ...spec, id: "w", team: 1, spawn: vec2(600, 0), skillBar: [] }],
    });
  }

  function me(sim: MatchSimulation): Combatant {
    const found = sim.get("m");
    if (found === undefined) {
      throw new Error("no m");
    }
    return found.combatant;
  }

  function step(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  /** `m` uses `id` on itself, and the steps until it has landed. */
  function use(sim: MatchSimulation, id: (typeof BAR)[number]): CombatLogEntry[] {
    sim.setTarget("m", "m");
    expect(sim.requestSkill("m", SLOT[id])?.check).toEqual({ ok: true });
    return step(sim, skill(id).activationSeconds + 0.5);
  }

  function recharge(sim: MatchSimulation, id: string): number {
    return me(sim).cast.rechargeRemaining.get(id) ?? 0;
  }

  it("Divine Spirit: a Monk spell costs 5 less", () => {
    const sim = match();
    use(sim, "monk.divine-spirit");
    expect(me(sim).statuses.get("divine-spirit")?.remainingSeconds).toBeGreaterThan(10);
    // Orison's 5, less 5, is never below 1.
    expect(energyCostOf(skill(ORISON), me(sim))).toBe(1);
  });

  it("Holy Haste: Healing Prayers cast in half the time; its own cast leaves it, an enchantment ends it", () => {
    const sim = match();
    use(sim, "monk.holy-haste");
    expect(me(sim).statuses.has("holy-haste")).toBe(true);
    // Its aftercast over, so the Orison begins at once.
    step(sim, 0.5);
    sim.setTarget("m", "m");
    sim.requestSkill("m", SLOT[ORISON]);
    expect(me(sim).cast.activeCast?.totalSeconds).toBe(0.5);
    step(sim, 1);
    use(sim, "monk.divine-spirit");
    expect(me(sim).statuses.has("holy-haste")).toBe(false);
  });

  it("Healer's Covenant: Healing Prayers spells cost 3 less and heal 20% less", () => {
    const plain = match();
    me(plain).health = 100;
    const full = use(plain, ORISON);
    const sim = match();
    use(sim, "monk.healers-covenant");
    me(sim).health = 100;
    expect(energyCostOf(skill(ORISON), me(sim))).toBe(2);
    const lessened = use(sim, ORISON);
    const heals = (log: readonly CombatLogEntry[]): number[] =>
      log.filter((entry) => entry.skillId === ORISON).flatMap(({ events }) => healed(events));
    expect(heals(lessened)).toEqual(heals(full).map((amount) => Math.round(amount * 0.8)));
  });

  it("Practiced Stance: a preparation recharges 50% faster and lasts 246% longer", () => {
    const sim = match();
    use(sim, "ranger.practiced-stance");
    use(sim, APPLY_POISON);
    expect(me(sim).statuses.get("apply-poison")?.remainingSeconds).toBeCloseTo(24 * 3.46 - 0.5, 0);
    expect(recharge(sim, APPLY_POISON)).toBeCloseTo(6 - 0.5, 0);
  });

  it("Extend Enchantments: the next Dervish enchantment lasts 122% longer, once", () => {
    const sim = match();
    use(sim, "dervish.extend-enchantments");
    expect(me(sim).statuses.has("extend-enchantments")).toBe(true);
    use(sim, VOW);
    expect(me(sim).statuses.has("extend-enchantments")).toBe(false);
    expect(me(sim).statuses.get("vow-of-strength")?.remainingSeconds).toBeCloseTo(
      15 * 2.22 - 0.5,
      0,
    );
    // A status put on under it keeps its time once it has ended.
    step(sim, 20);
    expect(me(sim).statuses.has("vow-of-strength")).toBe(true);
  });
});

describe("in flight, and on its caster (#1761)", () => {
  /**
   * How long `statusId` has left on the foe once `id`, flying from 300
   * units, puts it on: the caster bearing Blessed Aura lent a modifier
   * that doubles what its `profession`'s skills put on, or not.
   */
  function flown(
    id: string,
    profession: "elementalist" | "ranger",
    statusId: StatusId,
    boosted: boolean,
  ): number {
    const doubles = {
      filter: { type: undefined, attributeId: undefined, profession },
      energyBase: undefined,
      energyDiscount: 0,
      energyFloor: 1,
      energySurcharge: 0,
      activationMultiplier: 1,
      activationSecondsLess: 0,
      rechargeFaster: 0,
      rechargeSlower: 0,
      durationMultiplier: 2,
      healMultiplier: 1,
      notEasilyInterrupted: false,
      uses: undefined,
    };
    return withStatusDefinitions({ "blessed-aura": { ownSkillModifiers: [doubles] } }, () => {
      const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
      const sim = new MatchSimulation({
        seed: "own-skill-in-flight",
        participants: [
          {
            id: "m",
            team: 0,
            skillBar: [id],
            attributeRanks: new Map(),
            equipment: {
              ...unarmed,
              mainHand: {
                weapon: WEAPONS.longbow,
                attributeId: "ranger.marksmanship",
                damageType: WEAPONS.longbow.damageType,
                requirementMet: true,
                creatureDamageScale: undefined,
              },
            },
            maxEnergy: 1000,
            spawn: vec2(0, 0),
            facing: 0,
          },
          {
            id: "w",
            team: 1,
            skillBar: [],
            attributeRanks: new Map(),
            equipment: unarmed,
            spawn: vec2(300, 0),
            facing: 0,
          },
        ],
      });
      if (boosted) {
        sim.get("m")?.combatant.statuses.apply("blessed-aura", 60, "m", NO_RANKS);
      }
      sim.setTarget("m", "w");
      expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
      for (let i = 0; i < 5 / DT; i += 1) {
        sim.step(DT);
        const landed = sim.get("w")?.combatant.statuses.get(statusId);
        if (landed !== undefined) {
          return landed.remainingSeconds;
        }
      }
      throw new Error(`${statusId} never landed`);
    });
  }

  it.each([
    ["a spell", "elementalist.shard-storm", "elementalist", "shard-storm", 5],
    ["an attack skill", "ranger.crippling-shot", "ranger", "crippled", 10],
  ] as const)(
    "%s that flies lands with the boost it was cast with",
    (_, id, profession, status, base) => {
      expect(
        flown(id, profession, status, true) - flown(id, profession, status, false),
      ).toBeCloseTo(base);
    },
  );

  it("lengthens a status the skill puts on its caster", () => {
    const lasts = (durationMultiplier: number): number | undefined => {
      const caster = makeCombatant({ id: "m", team: 0 });
      resolveSkillEffects({
        skill: skill("assassin.siphon-speed"),
        caster,
        targets: [makeCombatant({ id: "w", team: 1 })],
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
        own: { ...NO_OWN_SKILL_BOOST, durationMultiplier },
      });
      return caster.statuses.get("siphon-speed-haste")?.remainingSeconds;
    };
    expect(lasts(1)).toBe(13);
    expect(lasts(2)).toBe(26);
  });
});

describe("says what each does (#1761)", () => {
  it.each([
    ["monk.divine-spirit", "your Monk spells cost 5 less Energy (minimum 1)"],
    ["monk.blessed-aura", "your Monk enchantments last 30% longer"],
    [
      "monk.healers-covenant",
      "your Healing Prayers spells cost 3 less Energy (minimum 1) and heal 20% less",
    ],
    ["monk.holy-haste", "your Healing Prayers spells cast 50% faster"],
    ["ranger.practiced-stance", "your preparations recharge 50% faster and last 246% longer"],
    ["dervish.extend-enchantments", "your next Dervish enchantment lasts 122% longer"],
  ])("%s", (id, text) => {
    const lines = describeSkill(skill(id))
      .effects.map((line) => line.text)
      .join(" | ");
    expect(lines.toLowerCase()).toContain(text.toLowerCase());
  });
});
