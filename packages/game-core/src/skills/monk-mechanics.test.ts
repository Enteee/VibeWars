import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { divineFavorHeal } from "../primary-attributes.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applyDamage, applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Monk mechanics (#1754): a damage threshold on a trigger, a share of each
 * blow reflected, a pulse that spares its bearer and a doubled Divine
 * Favor, and the four skills they let in: Spirit Bond, Holy Wrath,
 * Balthazar's Aura and Healing Touch. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPIRIT_BOND = "monk.spirit-bond";
const HOLY_WRATH = "monk.holy-wrath";
const BALTHAZARS_AURA = "monk.balthazars-aura";
const HEALING_TOUCH = "monk.healing-touch";
const HEALING_BREEZE = "monk.healing-breeze";
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
  ["monk.divine-favor", 12],
]);
const noSpread: SpreadGainedCondition = () => [];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** `m`, a team-0 Monk; `a`, its ally at 100 of 500; `w`, a team-1 foe. */
function party(): Map<string, Combatant> {
  return new Map([
    ["m", makeCombatant({ id: "m", team: 0, attributeRanks: RANKS })],
    ["a", makeCombatant({ id: "a", team: 0, health: 100, maxHealth: 500 })],
    ["w", makeCombatant({ id: "w", team: 1, health: 400, maxHealth: 500 })],
  ]);
}

function member(combatants: Map<string, Combatant>, id: string): Combatant {
  const found = combatants.get(id);
  if (found === undefined) {
    throw new Error(`no combatant ${id}`);
  }
  return found;
}

/** Whatever `bearer`'s statuses recorded, fired as the simulation's drain does. */
function drain(bearer: Combatant, combatants: Map<string, Combatant>) {
  return bearer.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(bearer, change, noSpread, {
      sourceOf: (id) => combatants.get(id),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    }),
  );
}

/** `user` pays nothing and `skillId` lands on `target`. */
function cast(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function healed(events: readonly CombatEvent[], id: string): number {
  return events.reduce(
    (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

describe("the four are the corpus's (#1754)", () => {
  it.each([
    [
      SPIRIT_BOND,
      1114,
      "enchantment",
      "protection-prayers",
      10,
      0.25,
      5,
      RANGE_SPELL,
      "single-ally",
    ],
    [
      HOLY_WRATH,
      249,
      "enchantment",
      "smiting-prayers",
      10,
      1,
      10,
      RANGE_SPELL,
      "single-other-ally",
    ],
    [BALTHAZARS_AURA, 272, "enchantment", "smiting-prayers", 15, 1, 20, RANGE_SPELL, "single-ally"],
    [HEALING_TOUCH, 313, "spell", "healing-prayers", 5, 0.75, 5, RANGE_MELEE, "single-ally"],
  ])("%s", (id, gwId, type, attribute, energy, activation, recharge, range, target) => {
    expect(skill(id)).toMatchObject({
      gwId,
      type,
      profession: "monk",
      elite: false,
      attributeId: `monk.${attribute}`,
      cost: { kind: "energy", amount: energy },
      activationSeconds: activation,
      rechargeSeconds: recharge,
      range,
      target,
    });
  });

  it("names what each does in its text", () => {
    const text = (id: string) =>
      describeSkill(skill(id), RANKS)
        .effects.map(({ text: line }) => line)
        .join(" | ");
    expect(text(SPIRIT_BOND)).toContain("takes more than 50 damage from a foe");
    expect(text(SPIRIT_BOND)).toContain("78");
    expect(text(HOLY_WRATH)).toContain(
      "66% of the damage of the next 8 attacks that hit it goes back to the attacker as holy damage, up to 41",
    );
    expect(text(BALTHAZARS_AURA)).toContain("each second, adjacent foes take 26 holy damage");
    expect(text(BALTHAZARS_AURA)).not.toContain("it and");
    expect(text(HEALING_TOUCH)).toContain("Health gain from Divine Favor is doubled");
  });
});

describe("a damage threshold on a trigger (#1754)", () => {
  /** `a` under Spirit Bond from `m`. */
  function bonded(): Map<string, Combatant> {
    const combatants = party();
    const a = member(combatants, "a");
    a.statuses.apply("spirit-bond", 8, "m", NO_RANKS);
    a.statuses.drainChanges();
    return combatants;
  }

  it("fires for a packet of 51 and not of 50", () => {
    const combatants = bonded();
    const a = member(combatants, "a");
    a.statuses.recordDamageFromFoe("w", "slashing", 50, false);
    expect(drain(a, combatants)).toEqual([]);
    a.statuses.recordDamageFromFoe("w", "slashing", 51, false);
    expect(drain(a, combatants)).toEqual([
      {
        sourceId: "m",
        skillId: SPIRIT_BOND,
        events: [{ kind: "heal", targetId: "a", amount: 78 }],
      },
    ]);
  });

  it("never fires for a life steal, however large", () => {
    const combatants = bonded();
    const a = member(combatants, "a");
    a.statuses.recordDamageFromFoe("w", undefined, 200, false);
    expect(drain(a, combatants)).toEqual([]);
  });

  it("reads what the bearer actually lost from a foe's damage", () => {
    const combatants = bonded();
    const a = member(combatants, "a");
    const events: CombatEvent[] = [];
    applyDamage(a, 60, "holy", false, events, member(combatants, "w"));
    expect(
      healed(
        drain(a, combatants).flatMap((fired) => fired.events),
        "a",
      ),
    ).toBe(78);
    // A blow of 60 on a bearer with 20 left takes only 20.
    a.health = 20;
    applyDamage(a, 60, "holy", false, [], member(combatants, "w"));
    expect(drain(a, combatants)).toEqual([]);
  });

  it("ends Spirit Bond after its 10th heal", () => {
    const combatants = bonded();
    const a = member(combatants, "a");
    for (let heal = 1; heal <= 10; heal += 1) {
      expect(a.statuses.has("spirit-bond")).toBe(true);
      a.statuses.recordDamageFromFoe("w", "slashing", 60, false);
      drain(a, combatants);
    }
    expect(a.statuses.has("spirit-bond")).toBe(false);
  });
});

describe("a share of a blow reflected (#1754)", () => {
  /** `a` under Holy Wrath from `m`. */
  function wrathful(): Map<string, Combatant> {
    const combatants = party();
    const a = member(combatants, "a");
    a.statuses.apply("holy-wrath", 26, "m", NO_RANKS);
    a.statuses.drainChanges();
    return combatants;
  }

  it("sends 66% of the damage back as holy damage, from the status's source", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    a.statuses.recordHitByAttack("w", 30);
    expect(drain(a, combatants)).toEqual([
      {
        sourceId: "m",
        skillId: HOLY_WRATH,
        events: [{ kind: "damage", targetId: "w", amount: 20, critical: false }],
      },
    ]);
    expect(member(combatants, "w").health).toBe(380);
    expect(a.statuses.get("holy-wrath")?.reflectionsLeft).toBe(7);
  });

  it("caps a reflection at 41", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    a.statuses.recordHitByAttack("w", 200);
    drain(a, combatants);
    expect(member(combatants, "w").health).toBe(400 - 41);
  });

  it("reflects nothing for a blow that took nothing", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    a.statuses.recordHitByAttack("w", 0);
    expect(drain(a, combatants)).toEqual([]);
    expect(a.statuses.get("holy-wrath")?.reflectionsLeft).toBe(8);
  });

  it("ends after its 8th reflection", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    for (let blow = 1; blow <= 8; blow += 1) {
      expect(a.statuses.has("holy-wrath")).toBe(true);
      a.statuses.recordHitByAttack("w", 10);
      drain(a, combatants);
    }
    expect(a.statuses.has("holy-wrath")).toBe(false);
  });

  it("reflects one of two blows in a tick when one reflection is left", () => {
    const combatants = wrathful();
    combatants.set("v", makeCombatant({ id: "v", team: 1, health: 400, maxHealth: 500 }));
    const a = member(combatants, "a");
    const wrath = a.statuses.get("holy-wrath");
    if (wrath === undefined) {
      throw new Error("no Holy Wrath");
    }
    wrath.reflectionsLeft = 1;
    a.statuses.recordHitByAttack("w", 30);
    a.statuses.recordHitByAttack("v", 30);
    const events = drain(a, combatants).flatMap((fired) => fired.events);
    expect(events).toEqual([
      { kind: "damage", targetId: "w", amount: 20, critical: false },
      { kind: "status-expired", targetId: "a", statusId: "holy-wrath" },
    ]);
    expect(member(combatants, "v").health).toBe(400);
  });

  it("reflects nothing once stripped in the tick the blow landed", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    a.statuses.recordHitByAttack("w", 30);
    a.statuses.end("holy-wrath");
    const fired = drain(a, combatants).filter(({ skillId }) => skillId === HOLY_WRATH);
    expect(fired).toEqual([]);
    expect(member(combatants, "w").health).toBe(400);
  });

  it("reflects nothing at a dead attacker, and does not count it", () => {
    const combatants = wrathful();
    const a = member(combatants, "a");
    const w = member(combatants, "w");
    w.dead = true;
    a.statuses.recordHitByAttack("w", 30);
    expect(drain(a, combatants)).toEqual([]);
    expect(a.statuses.get("holy-wrath")?.reflectionsLeft).toBe(8);
  });
});

describe("Healing Touch's doubled Divine Favor (#1754)", () => {
  it("heals 68 and twice the Divine Favor bonus Healing Breeze gives at the same rank", () => {
    const monk = makeCombatant({ id: "m", team: 0, attributeRanks: RANKS });
    const breeze = healed(
      cast(monk, HEALING_BREEZE, makeCombatant({ id: "a", health: 100, maxHealth: 500 })),
      "a",
    );
    expect(breeze).toBe(divineFavorHeal(12));
    const touch = healed(
      cast(monk, HEALING_TOUCH, makeCombatant({ id: "a", health: 100, maxHealth: 500 })),
      "a",
    );
    expect(touch).toBe(68 + 2 * breeze);
  });
});

describe("in a match (#1754)", () => {
  function spec(
    id: string,
    team: number,
    spawn: Vec2,
    equipment: ResolvedEquipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  ): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [],
      attributeRanks: RANKS,
      equipment,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  function sword(): ResolvedEquipment {
    return {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.sword,
        attributeId: "warrior.swordsmanship",
        damageType: WEAPONS.sword.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
  }

  /**
   * `m`, a team-0 Monk well away; `a`, its ally at the origin; `w`, a
   * team-1 swordsman adjacent to `a`; `z`, `w`'s ally beyond adjacent.
   */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "monk-mechanics",
      participants: [
        spec("m", 0, vec2(-300, 0)),
        spec("a", 0, vec2(0, 0)),
        spec("w", 1, vec2(30, 0), sword()),
        spec("z", 1, vec2(0, 3 * AREA_ADJACENT)),
      ],
    });
  }

  function get(sim: MatchSimulation, id: string): Participant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /** Step until `done`, at most `seconds`, gathering the log. */
  function stepUntil(sim: MatchSimulation, seconds: number, done: () => boolean): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < seconds / DT && !done(); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  /** Every packet of damage `log` dealt `id`. */
  function packets(log: readonly CombatLogEntry[], id: string): number[] {
    return log.flatMap(({ events }) =>
      events.flatMap((event) =>
        event.kind === "damage" && event.targetId === id ? [event.amount] : [],
      ),
    );
  }

  it("Holy Wrath hits the swordsman back for 66% of his blow, and is not reflected back", () => {
    const sim = match();
    const a = get(sim, "a").combatant;
    const w = get(sim, "w").combatant;
    a.statuses.apply("holy-wrath", 26, "m", NO_RANKS);
    // Holy Wrath on the swordsman too, from his own side: a reflection is
    // no attack, so it never comes back to `a`.
    w.statuses.apply("holy-wrath", 26, "z", NO_RANKS);
    a.health = a.maxHealth;
    expect(sim.requestAttack("w", "a")).toEqual({ ok: true });
    const wHealth = w.health;
    const log = stepUntil(sim, 5, () => w.health < wHealth);
    stepUntil(sim, DT, () => false);
    const [blow] = packets(log, "a");
    expect(blow).toBeGreaterThan(0);
    expect(packets(log, "a")).toHaveLength(1);
    expect(wHealth - w.health).toBe(Math.min(Math.round(0.66 * (blow ?? 0)), 41));
    expect(log.some(({ skillId }) => skillId === HOLY_WRATH)).toBe(true);
    expect(a.statuses.get("holy-wrath")?.reflectionsLeft).toBe(7);
    expect(w.statuses.get("holy-wrath")?.reflectionsLeft).toBe(8);
  });

  it("Holy Wrath with one reflection left reflects one of two blows landing in a step", () => {
    const sim = new MatchSimulation({
      seed: "monk-mechanics",
      participants: [
        spec("m", 0, vec2(-300, 0)),
        spec("a", 0, vec2(0, 0)),
        spec("w", 1, vec2(30, 0), sword()),
        spec("v", 1, vec2(-30, 0), sword()),
      ],
    });
    const a = get(sim, "a").combatant;
    const w = get(sim, "w").combatant;
    const v = get(sim, "v").combatant;
    a.statuses.apply("holy-wrath", 26, "m", NO_RANKS);
    const wrath = a.statuses.get("holy-wrath");
    if (wrath === undefined) {
      throw new Error("no Holy Wrath");
    }
    wrath.reflectionsLeft = 1;
    a.health = a.maxHealth;
    expect(sim.requestAttack("w", "a")).toEqual({ ok: true });
    expect(sim.requestAttack("v", "a")).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 5 / DT && packets(log, "a").length === 0; i += 1) {
      log.push(...sim.step(DT).log);
    }
    // Both blows land in the same step, the one that spends the last reflection.
    expect(packets(log, "a")).toHaveLength(2);
    log.push(...stepUntil(sim, DT, () => false));
    expect(packets(log, "w").length + packets(log, "v").length).toBe(1);
    const expired = log.flatMap(({ events }) =>
      events.filter((event) => event.kind === "status-expired" && event.statusId === "holy-wrath"),
    );
    expect(expired).toHaveLength(1);
    expect(a.statuses.has("holy-wrath")).toBe(false);
    expect(w.health + v.health).toBeLessThan(2 * w.maxHealth);
  });

  it("Balthazar's Aura hits an adjacent foe for 26 holy each second, never its bearer", () => {
    const sim = match();
    const a = get(sim, "a").combatant;
    const w = get(sim, "w").combatant;
    const z = get(sim, "z").combatant;
    expect(getStatusDefinition("balthazars-aura").damagePulse?.hitsBearer).toBe(false);
    a.statuses.apply("balthazars-aura", 8, "m", NO_RANKS);
    const before = { a: a.health, w: w.health, z: z.health };
    const log = stepUntil(sim, 1 + DT, () => false);
    expect(packets(log, "w")).toEqual([26]);
    expect(packets(log, "a")).toEqual([]);
    expect(packets(log, "z")).toEqual([]);
    expect(before.w - w.health).toBe(26);
    expect(a.health).toBe(before.a);
    expect(z.health).toBe(before.z);
  });

  it("Wastrel's Demise still hits its own bearer", () => {
    const sim = match();
    const w = get(sim, "w").combatant;
    expect(getStatusDefinition("wastrels-demise").damagePulse?.hitsBearer).toBe(true);
    w.statuses.apply("wastrels-demise", 8, "m", NO_RANKS);
    const log = stepUntil(sim, 1 + DT, () => false);
    expect(packets(log, "w")).toEqual([8]);
  });

  it("Balthazar's Aura stops when its bearer dies", () => {
    const sim = match();
    const a = get(sim, "a").combatant;
    const w = get(sim, "w").combatant;
    a.statuses.apply("balthazars-aura", 8, "m", NO_RANKS);
    a.health = 0.2;
    a.statuses.apply("burning", 10, "w", NO_RANKS);
    const log = stepUntil(sim, 2, () => false);
    expect(a.dead).toBe(true);
    expect(packets(log, "w")).toEqual([]);
    expect(w.health).toBe(w.maxHealth);
  });
});
