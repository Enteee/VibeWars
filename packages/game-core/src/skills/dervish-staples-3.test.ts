import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";

/**
 * Dervish staples 3 (#1667): Reap Impurities, Aura Slicer, Crippling
 * Victory, Lyssa's Assault, Rending Touch, Winds of Disenchantment, Signet
 * of Pious Restraint, Onslaught, Zealous Vow, Featherfoot Grace and
 * Whirling Charge. Numbers at rank 12; the PvP ones where GW1 splits them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["dervish.scythe-mastery", 12],
  ["dervish.wind-prayers", 12],
  ["dervish.earth-prayers", 12],
  ["dervish.mysticism", 12],
]);
const SCYTHE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.scythe,
    attributeId: "dervish.scythe-mastery",
    damageType: WEAPONS.scythe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};
/** A sword: one foe per blow, where the scythe would cleave. */
const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function damageIn(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "damage" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

describe("the eleven are GW1's (#1667)", () => {
  it.each([
    ["reap-impurities", 1486, "attack", false, false, "scythe-mastery", "adrenaline", 5, 0, 0],
    ["aura-slicer", 2070, "attack", false, false, "mysticism", "adrenaline", 5, 0, 0],
    ["crippling-victory", 2147, "attack", false, false, "scythe-mastery", "adrenaline", 6, 0, 0],
    ["lyssas-assault", 1538, "attack", false, false, "scythe-mastery", "energy", 5, 0.5, 15],
    ["rending-touch", 1534, "spell", false, false, "mysticism", "energy", 5, 0.75, 12],
    ["winds-of-disenchantment", 1533, "spell", false, false, "wind-prayers", "energy", 5, 0.75, 15],
    ["onslaught", 1754, "enchantment", true, true, "wind-prayers", "energy", 10, 0, 10],
    ["zealous-vow", 1761, "enchantment", true, false, "wind-prayers", "energy", 5, 0.25, 12],
    [
      "featherfoot-grace",
      1766,
      "enchantment",
      false,
      false,
      "wind-prayers",
      "energy",
      10,
      0.25,
      15,
    ],
    ["whirling-charge", 1544, "enchantment", false, true, "wind-prayers", "energy", 5, 0, 10],
  ] as const)(
    "%s: gwId %i, %s, elite %s, flash %s, %s, %s %i, %d s, %i s recharge",
    (id, gwId, type, elite, flash, attribute, cost, amount, activation, recharge) => {
      expect(skill(`dervish.${id}`)).toMatchObject({
        gwId,
        type,
        elite,
        flash,
        attributeId: `dervish.${attribute}`,
        cost: { kind: cost, amount },
        activationSeconds: activation,
        rechargeSeconds: recharge,
      });
    },
  );

  it("Signet of Pious Restraint is a free signet, 1 s, 16 s recharge", () => {
    expect(skill("dervish.signet-of-pious-restraint")).toMatchObject({
      gwId: 2014,
      type: "signet",
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 16,
      range: RANGE_SPELL,
      target: "single-enemy",
    });
  });

  it("the attacks are melee, Reap Impurities and Aura Slicer any melee weapon's", () => {
    expect(skill("dervish.reap-impurities").attack?.weapon).toBe("melee");
    expect(skill("dervish.aura-slicer").attack?.weapon).toBe("melee");
    expect(skill("dervish.crippling-victory").attack?.weapon).toBe("scythe");
    expect(skill("dervish.lyssas-assault").attack).toMatchObject({
      weapon: "scythe",
      weaponDamage: 0.5,
    });
    for (const id of ["reap-impurities", "aura-slicer", "crippling-victory", "lyssas-assault"]) {
      expect(skill(`dervish.${id}`).range, id).toBe(RANGE_MELEE);
    }
  });

  it("Rending Touch is a touch", () => {
    expect(skill("dervish.rending-touch").range).toBe(RANGE_MELEE);
  });
});

describe("Lyssa's Assault (#1667)", () => {
  /** A stream that never misses, never blocks and never crits. */
  const steady = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.95 });

  /** `c` strikes a foe 1 s into a 3 s Fireball, or idle; enchanted or not. */
  function strike(enchanted: boolean, casting: boolean): { events: CombatEvent[]; foe: Combatant } {
    const dervish = makeCombatant({ id: "c", equipment: SCYTHE, attributeRanks: RANKS });
    if (enchanted) {
      dervish.statuses.apply("mystic-regeneration", 15, "c", NO_RANKS);
    }
    const foe = makeCombatant({ id: "f", team: 1, skillBar: ["elementalist.fireball"] });
    if (casting) {
      foe.cast.beginCast("elementalist.fireball", foe.id, 3, undefined);
    }
    const events = resolveAttackSkill(
      {
        skill: skill("dervish.lyssas-assault"),
        caster: dervish,
        targets: [foe],
        rng: steady(),
        rules: RULES.combat,
        surroundings: new Map(),
      },
      () => false,
      [],
    );
    return { events, foe };
  }

  const disabled = (events: readonly CombatEvent[]): CombatEvent[] =>
    events.filter((event) => event.kind === "skill-disabled");

  it("enchanted, interrupts and disables the skill 8 s more", () => {
    const { events, foe } = strike(true, true);
    expect(foe.cast.isCasting).toBe(false);
    expect(disabled(events)).toEqual([
      { kind: "skill-disabled", targetId: "f", skillId: "elementalist.fireball", seconds: 8 },
    ]);
  });

  it("unenchanted, interrupts and disables nothing", () => {
    const { events, foe } = strike(false, true);
    expect(foe.cast.isCasting).toBe(false);
    expect(disabled(events)).toEqual([]);
  });

  it("on a foe not acting, is a half-damage hit and nothing more", () => {
    const { events } = strike(true, false);
    expect(damageIn(events, "f")).toBeGreaterThan(0);
    expect(disabled(events)).toEqual([]);
  });
});

describe("in a match (#1667)", () => {
  const BAR = [
    "dervish.reap-impurities",
    "dervish.aura-slicer",
    "dervish.crippling-victory",
    "dervish.rending-touch",
    "dervish.winds-of-disenchantment",
    "dervish.signet-of-pious-restraint",
    "dervish.onslaught",
    "dervish.zealous-vow",
    "dervish.featherfoot-grace",
    "dervish.whirling-charge",
  ] as const;
  type BarSkill = (typeof BAR)[number];
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<BarSkill, number>;

  /** Only the Dervish has ranks: a foe's Mysticism would armor it while enchanted. */
  function body(id: string, team: number, spawn: Vec2, equipment = SCYTHE): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: id === "c" ? RANKS : new Map(),
      equipment,
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /**
   * Dervish `c`; foe `f` adjacent to it, `h` adjacent to `f`, `g` near
   * `c` but neither adjacent to nor near `f`, and `far` out of every area.
   */
  function match(equipment = SCYTHE): MatchSimulation {
    return new MatchSimulation({
      seed: "dervish-staples-3",
      participants: [
        body("c", 1, vec2(0, 0), equipment),
        body("f", 0, vec2(32, 0)),
        body("h", 0, vec2(32, 35)),
        body("g", 0, vec2(-AREA_NEARBY + 10, 0)),
        body("far", 0, vec2(400, 0)),
      ],
    });
  }

  function get(sim: MatchSimulation, id: string): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  /** `c` uses `skillId` on `targetId`, with adrenaline to pay, and the steps until it lands. */
  function use(sim: MatchSimulation, skillId: BarSkill, targetId = "f"): CombatLogEntry[] {
    const cost = skill(skillId).cost;
    if (cost?.kind === "adrenaline") {
      get(sim, "c").adrenaline.set(skillId, cost.amount * ADRENALINE_PER_STRIKE);
    }
    sim.setTarget("c", targetId);
    expect(sim.requestSkill("c", SLOT[skillId])?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === skillId)) {
        break;
      }
    }
    return log;
  }

  /** `c` swings its scythe at `f` until the first blow lands, and the steps till then. */
  function swing(sim: MatchSimulation): CombatLogEntry[] {
    expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      const step = sim.step(DT).log;
      log.push(...step);
      if (step.some((entry) => damageIn(entry.events, "f") > 0)) {
        break;
      }
    }
    return log;
  }

  /** The damage `skillId`'s log entries dealt `id`. */
  function dealt(log: readonly CombatLogEntry[], skillId: string, id: string): number {
    return log
      .filter((entry) => entry.skillId === skillId)
      .reduce((sum, entry) => sum + damageIn(entry.events, id), 0);
  }

  function events(log: readonly CombatLogEntry[]): CombatEvent[] {
    return log.flatMap((entry) => entry.events);
  }

  function hasStatus(sim: MatchSimulation, id: string, statusId: string): boolean {
    return [...get(sim, id).statuses.active].some((status) => status.id === statusId);
  }

  function secondsOf(sim: MatchSimulation, id: string, statusId: string): number | undefined {
    return [...get(sim, id).statuses.active].find((status) => status.id === statusId)
      ?.remainingSeconds;
  }

  /** A Dervish enchantment on `id`, as if it had cast Mystic Regeneration. */
  function enchant(sim: MatchSimulation, id = "c"): void {
    get(sim, id).statuses.apply("mystic-regeneration", 30, id, NO_RANKS);
  }

  function recharge(sim: MatchSimulation, skillId: BarSkill): number | undefined {
    return get(sim, "c").cast.rechargeRemaining.get(skillId);
  }

  describe("Reap Impurities", () => {
    it("takes a condition off the foe hit, and its adjacent foes take 34 holy", () => {
      const sim = match(SWORD);
      get(sim, "f").statuses.apply("poison", 20, "c", NO_RANKS);
      const log = use(sim, "dervish.reap-impurities");
      expect(hasStatus(sim, "f", "poison")).toBe(false);
      expect(dealt(log, "dervish.reap-impurities", "h")).toBe(34);
      for (const id of ["g", "far"]) {
        expect(dealt(log, "dervish.reap-impurities", id), id).toBe(0);
      }
    });

    it("on a foe with no condition, is a plain hit", () => {
      const sim = match(SWORD);
      const log = use(sim, "dervish.reap-impurities");
      expect(dealt(log, "dervish.reap-impurities", "f")).toBeGreaterThan(0);
      expect(dealt(log, "dervish.reap-impurities", "h")).toBe(0);
    });
  });

  describe("Aura Slicer", () => {
    it("unenchanted, Bleeding for 13 s and nothing more", () => {
      const sim = match();
      use(sim, "dervish.aura-slicer");
      expect(secondsOf(sim, "f", "bleeding")).toBeCloseTo(13, 0);
      expect(hasStatus(sim, "f", "cracked-armor")).toBe(false);
    });

    it("enchanted, Cracked Armor for 8 s too", () => {
      const sim = match();
      enchant(sim);
      use(sim, "dervish.aura-slicer");
      expect(secondsOf(sim, "f", "bleeding")).toBeCloseTo(13, 0);
      expect(secondsOf(sim, "f", "cracked-armor")).toBeCloseTo(8, 0);
    });
  });

  describe("Crippling Victory", () => {
    /**
     * What the scythe's blow, cleaving `f` and `h`, dealt each, with the
     * Dervish at `health` and `f` at 5000. Read after the blow, as
     * Chilling Victory's.
     */
    function victory(health: number): Map<string, number> {
      const sim = match();
      get(sim, "c").health = health;
      get(sim, "f").health = 5000;
      const log = use(sim, "dervish.crippling-victory");
      for (const id of ["f", "h"]) {
        expect(secondsOf(sim, id, "crippled"), id).toBeCloseTo(7, 0);
      }
      return new Map(
        ["f", "h", "g"].map((id) => [id, dealt(log, "dervish.crippling-victory", id)]),
      );
    }

    it("cripples for 7 s; a foe with less Health has its adjacent foes take 26 earth", () => {
      // `h`, at 1e4, has more Health than the Dervish either way.
      const less = victory(9000);
      const more = victory(3000);
      expect(less.get("h")).toBe((more.get("h") ?? 0) + 26);
      expect(less.get("f")).toBe(more.get("f"));
      expect(less.get("g")).toBe(0);
    });
  });

  describe("Rending Touch", () => {
    it("spending a Dervish enchantment: 55 cold, strips one, 1 strike of adrenaline", () => {
      const sim = match();
      enchant(sim);
      enchant(sim, "f");
      const log = use(sim, "dervish.rending-touch");
      expect(dealt(log, "dervish.rending-touch", "f")).toBe(55);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(false);
      expect(get(sim, "c").adrenaline.get("dervish.aura-slicer")).toBe(ADRENALINE_PER_STRIKE);
    });

    it("without one: 55 cold and nothing more", () => {
      const sim = match();
      enchant(sim, "f");
      const log = use(sim, "dervish.rending-touch");
      expect(dealt(log, "dervish.rending-touch", "f")).toBe(55);
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(true);
      expect(get(sim, "c").adrenaline.get("dervish.aura-slicer") ?? 0).toBe(0);
    });
  });

  describe("Winds of Disenchantment", () => {
    it("spending a Dervish enchantment, nearby foes lose one and take 68 cold", () => {
      const sim = match();
      enchant(sim);
      for (const id of ["f", "h", "g", "far"]) {
        enchant(sim, id);
      }
      const log = use(sim, "dervish.winds-of-disenchantment", "c");
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      for (const id of ["f", "h", "g"]) {
        expect(dealt(log, "dervish.winds-of-disenchantment", id), id).toBe(68);
        expect(hasStatus(sim, id, "mystic-regeneration"), id).toBe(false);
      }
      expect(dealt(log, "dervish.winds-of-disenchantment", "far")).toBe(0);
      expect(hasStatus(sim, "far", "mystic-regeneration")).toBe(true);
    });

    it("without one, does nothing", () => {
      const sim = match();
      enchant(sim, "f");
      const log = use(sim, "dervish.winds-of-disenchantment", "c");
      expect(dealt(log, "dervish.winds-of-disenchantment", "f")).toBe(0);
      expect(hasStatus(sim, "f", "mystic-regeneration")).toBe(true);
    });
  });

  describe("Signet of Pious Restraint", () => {
    it("cripples for 13 s; spending a Dervish enchantment, recharges in 8 s", () => {
      const sim = match();
      enchant(sim);
      use(sim, "dervish.signet-of-pious-restraint");
      expect(secondsOf(sim, "f", "crippled")).toBeCloseTo(13, 0);
      expect(hasStatus(sim, "c", "mystic-regeneration")).toBe(false);
      expect(recharge(sim, "dervish.signet-of-pious-restraint")).toBeCloseTo(8, 0);
    });

    it("without one, cripples and recharges in the full 16 s", () => {
      const sim = match();
      use(sim, "dervish.signet-of-pious-restraint");
      expect(secondsOf(sim, "f", "crippled")).toBeCloseTo(13, 0);
      expect(recharge(sim, "dervish.signet-of-pious-restraint")).toBeCloseTo(16, 0);
    });
  });

  describe("Onslaught", () => {
    it("attacks and gains adrenaline 25% faster for 7 s", () => {
      const sim = match();
      use(sim, "dervish.onslaught", "c");
      expect(secondsOf(sim, "c", "onslaught")).toBeCloseTo(7, 0);
      const modifiers = aggregateModifiers(get(sim, "c").statuses.active);
      expect(modifiers.attackDurationMultiplier).toBe(0.75);
      expect(modifiers.adrenalineGainFaster).toBe(0.25);
      expect(modifiers.moveSpeedMultiplier).toBe(1);
    });
  });

  describe("Zealous Vow", () => {
    it("costs 3 energy pips for 20 s and gives 5 Energy for each foe a plain swing hits", () => {
      const sim = match();
      use(sim, "dervish.zealous-vow", "c");
      expect(secondsOf(sim, "c", "zealous-vow")).toBeCloseTo(20, 0);
      expect(aggregateModifiers(get(sim, "c").statuses.active).energyPips).toBe(-3);
      get(sim, "c").energy = 0;
      const gains = events(
        swing(sim).filter((entry) => entry.skillId === "dervish.zealous-vow"),
      ).filter((event) => event.kind === "energy-gain" && event.targetId === "c");
      // The scythe cleaves `f` and `h`: two hits, as Zealous Renewal counts them.
      expect(gains).toEqual([
        { kind: "energy-gain", targetId: "c", amount: 5 },
        { kind: "energy-gain", targetId: "c", amount: 5 },
      ]);
    });

    it("a blocked blow gives nothing", () => {
      const sim = match();
      use(sim, "dervish.zealous-vow", "c");
      // Both foes the scythe reaches block.
      for (const id of ["f", "h"]) {
        get(sim, id).statuses.apply("riposte", 30, id, NO_RANKS);
      }
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
      const log: CombatLogEntry[] = [];
      for (let i = 0; i < 4 / DT; i += 1) {
        log.push(...sim.step(DT).log);
        if (events(log).some((event) => event.kind === "attack-blocked")) {
          break;
        }
      }
      expect(events(log)).toContainEqual({ kind: "attack-blocked", targetId: "f" });
      expect(log.filter((entry) => entry.skillId === "dervish.zealous-vow")).toEqual([]);
    });
  });

  describe("Featherfoot Grace", () => {
    it("moves 25% faster and runs conditions out 50% faster for 17 s", () => {
      const sim = match();
      use(sim, "dervish.featherfoot-grace", "c");
      expect(secondsOf(sim, "c", "featherfoot-grace")).toBeCloseTo(17, 0);
      const modifiers = aggregateModifiers(get(sim, "c").statuses.active);
      expect(modifiers.moveSpeedMultiplier).toBe(1.25);
      expect(modifiers.conditionsExpireFaster).toBe(0.5);
    });
  });

  describe("Whirling Charge", () => {
    it("moves 33% faster; the first hit strikes the other nearby foes for 42 cold and ends it", () => {
      const sim = match();
      use(sim, "dervish.whirling-charge", "c");
      expect(secondsOf(sim, "c", "whirling-charge")).toBeCloseTo(5, 0);
      expect(aggregateModifiers(get(sim, "c").statuses.active).moveSpeedMultiplier).toBe(1.33);
      const log = swing(sim);
      expect(dealt(log, "dervish.whirling-charge", "h")).toBe(42);
      for (const id of ["f", "g", "far"]) {
        expect(dealt(log, "dervish.whirling-charge", id), id).toBe(0);
      }
      expect(hasStatus(sim, "c", "whirling-charge")).toBe(false);
    });

    it("with no hit, runs out after 5 s and strikes nobody", () => {
      const sim = match();
      use(sim, "dervish.whirling-charge", "c");
      const log = stepFor(sim, 5.5);
      expect(hasStatus(sim, "c", "whirling-charge")).toBe(false);
      expect(events(log).filter((event) => event.kind === "damage")).toEqual([]);
    });
  });
});
