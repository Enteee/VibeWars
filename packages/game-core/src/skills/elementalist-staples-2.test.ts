import { describe, expect, it } from "vitest";

import {
  AREA_ADJACENT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_MELEE,
  RANGE_SPELL,
} from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Elementalist staples 2 (#1575): Obsidian Flesh, Gale, Earthquake,
 * Unsteady Ground, Ward Against Foes, Ward of Stability, Lightning Touch,
 * Liquid Flame and Glowing Gaze, and the `preventsAttacks` Obsidian Flesh
 * brings. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["elementalist.air-magic", 12],
  ["elementalist.earth-magic", 12],
  ["elementalist.fire-magic", 12],
  ["elementalist.energy-storage", 12],
  ["warrior.axe-mastery", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damageIn(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "damage" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the nine are the corpus's (#1575)", () => {
  it.each([
    ["obsidian-flesh", 218, "enchantment", true, "earth-magic", 25, 1, 30, RANGE_SPELL],
    ["gale", 162, "spell", false, "air-magic", 10, 1, 5, RANGE_SPELL],
    ["earthquake", 170, "spell", false, "earth-magic", 25, 3, 15, RANGE_SPELL],
    ["unsteady-ground", 1083, "spell", true, "earth-magic", 10, 2, 15, RANGE_SPELL],
    ["ward-against-foes", 177, "ward", false, "earth-magic", 15, 1, 20, RANGE_SPELL],
    ["ward-of-stability", 938, "ward", false, "earth-magic", 10, 1, 30, RANGE_SPELL],
    ["lightning-touch", 232, "skill", false, "air-magic", 5, 0.75, 5, RANGE_MELEE],
    ["liquid-flame", 845, "spell", false, "fire-magic", 10, 1, 15, RANGE_SPELL],
    ["glowing-gaze", 1379, "spell", false, "fire-magic", 5, 1, 8, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (name, gwId, type, elite, attribute, energy, activation, recharge, range) => {
      expect(skill(`elementalist.${name}`)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `elementalist.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );
});

describe("Obsidian Flesh's status (#1575)", () => {
  it("is +20 armor, no foe's spell at its bearer, no attack and −2 energy degeneration", () => {
    expect(getStatusDefinition("obsidian-flesh")).toMatchObject({
      category: "enchantment",
      armorModifier: 20,
      untargetableByFoeSpells: true,
      preventsAttacks: true,
      energyPips: -2,
    });
  });

  it("says so", () => {
    expect(described("elementalist.obsidian-flesh")).toEqual([
      "Applies Obsidian Flesh for 18s (−2 Energy degeneration, +20 armor, cannot attack, cannot be the target of enemy spells)",
    ]);
  });
});

describe("Gale (#1575)", () => {
  it("knocks the target down for 2 s", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS });
    const foe = makeCombatant({ id: "f", team: 1 });
    use(ele, "elementalist.gale", foe);
    expect(foe.knockdownRemaining).toBe(2);
  });

  it("does nothing to an ally inside a Ward of Stability", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS });
    const warded = makeCombatant({ id: "w", team: 1 });
    warded.statuses.apply("ward-of-stability", 10, "ward", NO_RANKS);
    use(ele, "elementalist.gale", warded);
    expect(warded.knockdownRemaining).toBe(0);
  });
});

describe("Lightning Touch (#1575)", () => {
  it("strikes for 50 lightning at 25% penetration, Blinds for 3 s and Cracks Armor for 8 s", () => {
    expect(skill("elementalist.lightning-touch").effects[0]).toMatchObject({
      type: "lightning",
      armorPenetration: 0.25,
      amount: { scaling: { atTwelve: 50 } },
    });
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS });
    const foe = makeCombatant({ id: "f", team: 1, health: 1000, maxHealth: 1000 });
    expect(damageIn(use(ele, "elementalist.lightning-touch", foe), "f")).toBeGreaterThan(0);
    expect(foe.statuses.get("blind")?.durationSeconds).toBe(3);
    expect(foe.statuses.get("cracked-armor")?.durationSeconds).toBe(8);
  });
});

describe("Glowing Gaze (#1575)", () => {
  it("strikes for 41 fire, and pays 11 energy back off a burning foe", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS, energy: 30, maxEnergy: 80 });
    const burning = makeCombatant({ id: "f", team: 1, health: 1000, maxHealth: 1000 });
    burning.statuses.apply("burning", 5, "x", NO_RANKS);
    expect(damageIn(use(ele, "elementalist.glowing-gaze", burning), "f")).toBeGreaterThan(0);
    expect(ele.energy).toBe(30 - 5 + 11);
  });

  it("on a foe not on fire, 41 damage and no energy", () => {
    const ele = makeCombatant({ id: "e", attributeRanks: RANKS, energy: 30, maxEnergy: 80 });
    const foe = makeCombatant({ id: "f", team: 1, health: 1000, maxHealth: 1000 });
    expect(damageIn(use(ele, "elementalist.glowing-gaze", foe), "f")).toBeGreaterThan(0);
    expect(ele.energy).toBe(25);
  });
});

describe("in a match (#1575)", () => {
  type SkillId = `elementalist.${string}` | "warrior.swift-chop";

  function body(id: string, team: number, spawn: Vec2, bar: readonly SkillId[]): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...bar],
      attributeRanks: RANKS,
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.axe,
          attributeId: "warrior.axe-mastery",
          damageType: WEAPONS.axe.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /**
   * Caster `c` and its ally `a` on one side. Foe `f` is adjacent to `c`,
   * `h` adjacent to `f`, `g` near `f` but not adjacent, and `far` beyond
   * every area. Everyone has `bar`.
   */
  function match(bar: readonly SkillId[]): MatchSimulation {
    return new MatchSimulation({
      seed: "elementalist-staples-2",
      participants: [
        body("c", 1, vec2(0, 0), bar),
        body("a", 1, vec2(0, 60), bar),
        body("f", 0, vec2(32, 0), bar),
        body("h", 0, vec2(32, 30), bar),
        body("g", 0, vec2(32 + AREA_NEARBY - 10, 0), bar),
        body("far", 0, vec2(32 + AREA_NEARBY + 100, 0), bar),
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

  /** `casterId` uses its bar's `slot` on `targetId`, and the steps until it has landed. */
  function cast(
    sim: MatchSimulation,
    bar: readonly SkillId[],
    skillId: SkillId,
    targetId = "f",
    casterId = "c",
  ): CombatLogEntry[] {
    sim.setTarget(casterId, targetId);
    expect(sim.requestSkill(casterId, bar.indexOf(skillId))?.check).toEqual({ ok: true });
    return stepFor(sim, skill(skillId).activationSeconds + 0.5);
  }

  function events(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
    return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
  }

  function knockedDown(log: readonly CombatEvent[]): Set<string> {
    return new Set(log.flatMap((event) => (event.kind === "knocked-down" ? [event.targetId] : [])));
  }

  it("the area each reaches is the one the layout assumes", () => {
    expect(30).toBeLessThan(AREA_ADJACENT);
    expect(AREA_NEARBY - 10).toBeGreaterThan(AREA_ADJACENT);
    expect(Math.hypot(32, 30)).toBeGreaterThan(RANGE_MELEE);
    expect(32 + AREA_NEARBY - 10).toBeLessThan(AREA_IN_THE_AREA);
    expect(32 + AREA_NEARBY + 100).toBeGreaterThan(AREA_IN_THE_AREA);
  });

  describe("Obsidian Flesh", () => {
    const BAR = [
      "elementalist.obsidian-flesh",
      "warrior.swift-chop",
      "elementalist.gale",
      "elementalist.lightning-touch",
      "elementalist.glowing-gaze",
    ] as const satisfies readonly SkillId[];

    it("stops an attack under way, and refuses the next with nothing paid", () => {
      const sim = match(BAR);
      const caster = get(sim, "c");
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
      cast(sim, BAR, "elementalist.obsidian-flesh", "c");
      expect(caster.statuses.get("obsidian-flesh")?.durationSeconds).toBe(18);
      expect(caster.attack).toBeUndefined();

      expect(sim.requestAttack("c", "f")).toEqual({ ok: false, reason: "cannot-attack" });
      const energy = caster.energy;
      sim.setTarget("c", "f");
      expect(sim.requestSkill("c", BAR.indexOf("warrior.swift-chop"))?.check).toEqual({
        ok: false,
        reason: "cannot-attack",
      });
      stepFor(sim, 1);
      expect(caster.energy).toBeGreaterThanOrEqual(energy - 1);
      expect(caster.cast.rechargeRemaining.get("warrior.swift-chop") ?? 0).toBe(0);
      expect(caster.cast.activeCast).toBeUndefined();
    });

    it("lets a spell and a touch skill through", () => {
      const sim = match(BAR);
      cast(sim, BAR, "elementalist.obsidian-flesh", "c");
      const gale = cast(sim, BAR, "elementalist.gale");
      expect(knockedDown(events(gale, "elementalist.gale"))).toEqual(new Set(["f"]));
      stepFor(sim, 2);
      const touch = cast(sim, BAR, "elementalist.lightning-touch");
      expect(damageIn(events(touch, "elementalist.lightning-touch"), "f")).toBeGreaterThan(0);
    });

    it("turns a foe's spell at its bearer away", () => {
      const sim = match(BAR);
      cast(sim, BAR, "elementalist.obsidian-flesh", "c");
      sim.setTarget("f", "c");
      expect(sim.requestSkill("f", BAR.indexOf("elementalist.glowing-gaze"))?.check).toEqual({
        ok: false,
        reason: "invalid-target-untargetable",
      });
    });

    it("frees its bearer the moment it ends", () => {
      const sim = match(BAR);
      cast(sim, BAR, "elementalist.obsidian-flesh", "c");
      get(sim, "c").statuses.remove("obsidian-flesh");
      expect(sim.requestAttack("c", "f")).toEqual({ ok: true });
    });
  });

  describe("Earthquake", () => {
    const BAR = ["elementalist.earthquake"] as const satisfies readonly SkillId[];

    it("knocks down and strikes the target and every foe near it, and no one further", () => {
      const sim = match(BAR);
      const log = events(cast(sim, BAR, "elementalist.earthquake"), "elementalist.earthquake");
      expect(knockedDown(log)).toEqual(new Set(["f", "h", "g"]));
      for (const id of ["f", "h", "g"]) {
        expect(damageIn(log, id), id).toBeGreaterThan(0);
      }
      expect(damageIn(log, "far")).toBe(0);
      expect(skill("elementalist.earthquake").effects[1]).toMatchObject({
        type: "earth",
        amount: { scaling: { atTwelve: 85.2 } },
      });
    });
  });

  describe("Unsteady Ground", () => {
    const BAR = ["elementalist.unsteady-ground"] as const satisfies readonly SkillId[];

    it("strikes the foes near the target each second for 5 s; knocks down only one attacking", () => {
      const sim = match(BAR);
      expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
      const log = cast(sim, BAR, "elementalist.unsteady-ground");
      log.push(...stepFor(sim, 6));
      const landed = events(log, "elementalist.unsteady-ground");
      const hits = landed.filter((event) => event.kind === "damage");
      expect(hits.filter((event) => event.targetId === "g")).toHaveLength(5);
      expect(hits.some((event) => event.targetId === "far")).toBe(false);
      expect(knockedDown(landed)).toEqual(new Set(["f"]));
    });

    it("says so", () => {
      expect(described("elementalist.unsteady-ground")).toEqual([
        "Creates a symbol at your target's location for 5 seconds",
        "Every 1s for 5s, foes nearby: deals 34 earth damage",
        "Every 1s for 5s, foes nearby: if target is attacking: knocks down for 2s",
      ]);
    });
  });

  describe("the wards", () => {
    const BAR = [
      "elementalist.ward-against-foes",
      "elementalist.ward-of-stability",
      "elementalist.gale",
    ] as const satisfies readonly SkillId[];

    it("Ward Against Foes slows the foes in it by half, and no ally", () => {
      const sim = match(BAR);
      cast(sim, BAR, "elementalist.ward-against-foes", "c");
      expect(
        ["c", "a", "f", "h", "g", "far"].map((id) =>
          get(sim, id).statuses.has("ward-against-foes"),
        ),
      ).toEqual([false, false, true, true, true, false]);
      expect(getStatusDefinition("ward-against-foes").moveSpeedMultiplier).toBe(0.5);
    });

    it("Ward of Stability keeps the allies in it on their feet, and no foe", () => {
      const sim = match(BAR);
      cast(sim, BAR, "elementalist.ward-of-stability", "c");
      expect(["c", "a", "f"].map((id) => get(sim, id).statuses.has("ward-of-stability"))).toEqual([
        true,
        true,
        false,
      ]);
      const gale = cast(sim, BAR, "elementalist.gale", "a", "f");
      expect(knockedDown(events(gale, "elementalist.gale")).size).toBe(0);
      expect(get(sim, "a").knockdownRemaining).toBe(0);
    });
  });

  describe("Lightning Touch", () => {
    const BAR = ["elementalist.lightning-touch"] as const satisfies readonly SkillId[];

    it("reaches the touched foe and those adjacent to it", () => {
      const sim = match(BAR);
      const log = events(
        cast(sim, BAR, "elementalist.lightning-touch"),
        "elementalist.lightning-touch",
      );
      expect(damageIn(log, "f")).toBeGreaterThan(0);
      expect(damageIn(log, "h")).toBeGreaterThan(0);
      expect(damageIn(log, "g")).toBe(0);
      expect(get(sim, "h").statuses.has("blind")).toBe(true);
    });
  });

  describe("Liquid Flame", () => {
    const BAR = ["elementalist.liquid-flame"] as const satisfies readonly SkillId[];

    it("strikes the target alone while it stands idle", () => {
      const sim = match(BAR);
      const log = events(cast(sim, BAR, "elementalist.liquid-flame"), "elementalist.liquid-flame");
      expect(damageIn(log, "f")).toBeGreaterThan(0);
      expect(damageIn(log, "g")).toBe(0);
    });

    it("strikes the foes near it too while it attacks, and no one further", () => {
      const sim = match(BAR);
      expect(sim.requestAttack("f", "c")).toEqual({ ok: true });
      const log = events(cast(sim, BAR, "elementalist.liquid-flame"), "elementalist.liquid-flame");
      expect(damageIn(log, "f")).toBeGreaterThan(0);
      expect(damageIn(log, "g")).toBeGreaterThan(0);
      expect(damageIn(log, "far")).toBe(0);
    });
  });
});
