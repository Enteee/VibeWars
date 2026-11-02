import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { energyCostOf } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS } from "../skills/status.js";
import { effectiveActivationSeconds } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { blocks } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Assassin chain and Paradox tools (#2134): Way of the Empty Palm, Mark
 * of Instability, Deadly Paradox, Wastrel's Collapse and Unseen Fury
 * (PvP), at rank 12. Nothing crits.
 */

const RULES: Ruleset = {
  ...MINIMAL_GW_INSPIRED_PVP_V1,
  combat: {
    ...MINIMAL_GW_INSPIRED_PVP_V1.combat,
    criticalBaseChance: 0,
    criticalChancePerRank: 0,
  },
};
const DT = 1 / RULES.tickRateHz;

const EMPTY_PALM = "assassin.way-of-the-empty-palm";
const INSTABILITY = "assassin.mark-of-instability";
const PARADOX = "assassin.deadly-paradox";
const WASTREL = "assassin.wastrels-collapse";
const UNSEEN_FURY = "assassin.unseen-fury";
const JAGGED_STRIKE = "assassin.jagged-strike";
const FOX_FANGS = "assassin.fox-fangs";
const DEATH_BLOSSOM = "assassin.death-blossom";
const SHADOW_PRISON = "assassin.shadow-prison";
const SEVER_ARTERY = "warrior.sever-artery";
const FIREBALL = "elementalist.fireball";
const BAR = [
  EMPTY_PALM,
  INSTABILITY,
  PARADOX,
  WASTREL,
  JAGGED_STRIKE,
  FOX_FANGS,
  DEATH_BLOSSOM,
  SHADOW_PRISON,
];
const RANKS = new Map([
  ["assassin.deadly-arts", 12],
  ["assassin.shadow-arts", 12],
  ["assassin.dagger-mastery", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`missing ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: { ...weapon, damageMin: weapon.damageMax },
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const DAGGERS = wielding(WEAPONS.daggers, "assassin.dagger-mastery");

/** A body that neither regenerates nor dies. */
function body(id: string, team: number, spawn: Vec2, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: RANKS,
    equipment: DAGGERS,
    maxHealth: 1e6,
    maxEnergy: 1000,
    baseEnergyPips: 0,
    spawn,
    facing: team === 0 ? 0 : Math.PI,
  };
}

/**
 * The Assassin `s` at the origin, its ally `a` beside it, both in melee
 * of the foe `f`; `f` casts Fireball. `far` is a foe out of melee.
 */
function match(bar: readonly string[] = BAR): MatchSimulation {
  return new MatchSimulation({
    seed: "assassin-paradox",
    ruleset: RULES,
    participants: [
      body("s", 0, vec2(0, 0), bar),
      body("a", 0, vec2(0, 20), BAR),
      body("f", 1, vec2(RANGE_MELEE / 2, 0), [FIREBALL]),
      body("far", 1, vec2(400, 0), [FIREBALL]),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id)?.combatant;
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `casterId` uses `skillId` on `targetId`, stepped until it landed: the log. */
function use(
  sim: MatchSimulation,
  skillId: string,
  targetId = "f",
  casterId = "s",
  bar: readonly string[] = BAR,
): CombatLogEntry[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, bar.indexOf(skillId))?.check).toEqual({ ok: true });
  // An attack skill lands with its swing.
  const found = skill(skillId);
  return stepFor(sim, found.type === "attack" ? 1.5 : found.activationSeconds + 0.5);
}

/** `casterId`'s chain on `f`: lead, off-hand, dual. The log. */
function chain(sim: MatchSimulation, casterId = "s"): CombatLogEntry[] {
  return [JAGGED_STRIKE, FOX_FANGS, DEATH_BLOSSOM].flatMap((id) => use(sim, id, "f", casterId));
}

function events(log: readonly CombatLogEntry[]): CombatEvent[] {
  return log.flatMap((entry) => entry.events);
}

function knockdownsOn(log: readonly CombatLogEntry[], targetId: string): number {
  return events(log).filter((event) => event.kind === "knocked-down" && event.targetId === targetId)
    .length;
}

/** The skills disabled on `targetId`, each with its seconds. */
function disabled(log: readonly CombatLogEntry[], targetId = "s"): Map<string, number> {
  return new Map(
    events(log).flatMap((event) =>
      event.kind === "skill-disabled" && event.targetId === targetId
        ? [[event.skillId, event.seconds] as const]
        : [],
    ),
  );
}

describe("the five are the corpus's (#2134)", () => {
  it.each([
    [EMPTY_PALM, 987, "enchantment", true, 5, 0.25, 10],
    [INSTABILITY, 978, "hex", false, 10, 0.25, 20],
    [PARADOX, 572, "stance", false, 15, 0, 10],
    [WASTREL, 1644, "skill", true, 5, 0.25, 20],
    [UNSEEN_FURY, 3049, "stance", false, 5, 0, 45],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %i energy, %f s, %i s recharge",
    (id, gwId, type, elite, energy, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "assassin",
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
      });
    },
  );
});

describe("Way of the Empty Palm (#2134)", () => {
  it("for 13 s, off-hand and dual attacks cost nothing and recharge 45% faster; a lead pays", () => {
    const sim = match();
    use(sim, EMPTY_PALM, "s");
    const s = get(sim, "s");
    expect(s.statuses.get("way-of-the-empty-palm")?.durationSeconds).toBeCloseTo(13, 1);
    expect(energyCostOf(skill(DEATH_BLOSSOM), s)).toBe(0);
    expect(energyCostOf(skill(FOX_FANGS), s)).toBe(0);
    expect(energyCostOf(skill(JAGGED_STRIKE), s)).toBe(5);
    const before = s.energy;
    use(sim, JAGGED_STRIKE);
    use(sim, FOX_FANGS);
    use(sim, DEATH_BLOSSOM);
    expect(before - s.energy).toBe(5);
    expect(s.cast.rechargeRemaining.get(DEATH_BLOSSOM) ?? 0).toBeGreaterThan(3.3 - 1.5);
    expect(s.cast.rechargeRemaining.get(DEATH_BLOSSOM) ?? 0).toBeLessThanOrEqual(3.3);
  });
});

describe("Mark of Instability (#2134)", () => {
  it("its caster's dual attack knocks the foe down once and ends it; a lead attack does not", () => {
    const sim = match();
    use(sim, INSTABILITY);
    expect(get(sim, "f").statuses.get("mark-of-instability")?.durationSeconds).toBe(20);
    const lead = use(sim, JAGGED_STRIKE);
    expect(knockdownsOn(lead, "f")).toBe(0);
    expect(get(sim, "f").statuses.has("mark-of-instability")).toBe(true);
    const rest = [...use(sim, FOX_FANGS), ...use(sim, DEATH_BLOSSOM)];
    expect(knockdownsOn(rest, "f")).toBe(1);
    expect(get(sim, "f").statuses.has("mark-of-instability")).toBe(false);
  });

  it("an ally's dual attack does not set it off", () => {
    const sim = match();
    use(sim, INSTABILITY);
    const log = chain(sim, "a");
    expect(
      log.some(
        (entry) =>
          entry.skillId === DEATH_BLOSSOM &&
          entry.events.some((event) => event.kind === "damage" && event.targetId === "f"),
      ),
    ).toBe(true);
    expect(knockdownsOn(log, "f")).toBe(0);
    expect(get(sim, "f").statuses.has("mark-of-instability")).toBe(true);
  });
});

describe("Deadly Paradox (#2134)", () => {
  it("for 13 s, Assassin skills activate and recharge 33% faster; attack skills are disabled 10 s", () => {
    const sim = match();
    const log = use(sim, PARADOX, "s");
    const s = get(sim, "s");
    expect(s.statuses.get("deadly-paradox")?.durationSeconds).toBeCloseTo(13, 1);
    expect(s.cast.rechargeRemaining.get(PARADOX) ?? 0).toBeGreaterThan(9);
    expect(disabled(log)).toEqual(
      new Map([
        [JAGGED_STRIKE, 10],
        [FOX_FANGS, 10],
        [DEATH_BLOSSOM, 10],
      ]),
    );
    expect(effectiveActivationSeconds(skill(SHADOW_PRISON), s)).toBeCloseTo(0.25 * 0.67, 3);
    use(sim, SHADOW_PRISON);
    expect(s.cast.rechargeRemaining.get(SHADOW_PRISON) ?? 0).toBeLessThanOrEqual(15 * 0.67);
    expect(s.cast.rechargeRemaining.get(SHADOW_PRISON) ?? 0).toBeGreaterThan(15 * 0.67 - 0.7);
  });
});

describe("Wastrel's Collapse (#2134)", () => {
  const WASTREL_BAR = [WASTREL, DEATH_BLOSSOM, SEVER_ARTERY];

  it("steps to the foe and knocks an idle one down; non-dagger attacks are disabled 10 s", () => {
    const sim = match(WASTREL_BAR);
    const log = use(sim, WASTREL, "far", "s", WASTREL_BAR);
    expect(knockdownsOn(log, "far")).toBe(1);
    expect(sim.get("s")?.position.x).toBeGreaterThan(300);
    expect(disabled(log)).toEqual(new Map([[SEVER_ARTERY, 10]]));
  });

  it("a foe mid-cast is not knocked down", () => {
    const sim = match(WASTREL_BAR);
    sim.setTarget("far", "s");
    expect(sim.requestSkill("far", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.2);
    const log = use(sim, WASTREL, "far", "s", WASTREL_BAR);
    expect(knockdownsOn(log, "far")).toBe(0);
    expect(disabled(log)).toEqual(new Map([[SEVER_ARTERY, 10]]));
  });
});

describe("Unseen Fury (PvP) (#2134)", () => {
  it("lasts 51 s; a Blinded foe never blocks its bearer, an unblinded one does", () => {
    const sim = match([UNSEEN_FURY]);
    use(sim, UNSEEN_FURY, "s", "s", [UNSEEN_FURY]);
    const s = get(sim, "s");
    const f = get(sim, "f");
    expect(s.statuses.get("unseen-fury")?.durationSeconds).toBeCloseTo(51, 1);
    f.statuses.apply("lightning-reflexes", 1000, "f", NO_RANKS);
    const rng = createRng(2134);
    const rolls = (attacker: Combatant): number =>
      Array.from({ length: 50 }, () =>
        blocks(f, attacker.id, attacker.statuses.active, "melee", false, rng),
      ).filter(Boolean).length;
    expect(rolls(s)).toBeGreaterThan(0);
    f.statuses.apply("blind", 1000, "far", NO_RANKS);
    expect(rolls(s)).toBe(0);
    // Another attacker, without the stance, is still blocked.
    expect(rolls(get(sim, "a"))).toBeGreaterThan(0);
  });
});
