import { describe, expect, it } from "vitest";

import { RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { gainStrikes } from "../skills/adrenaline.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers, getStatusDefinition, StatusSet } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { blockChanceOf } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * The Warrior staples (#1549): a `remove-status` that takes one named
 * status, a block trigger bound to the kind of attack blocked, and the
 * eight Warrior skills on them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const FLAIL = "warrior.flail";
const DEFY_PAIN = "warrior.defy-pain";
const DISMEMBER = "warrior.dismember";
const JAIZHENJU_STRIKE = "warrior.jaizhenju-strike";
const RIPOSTE = "warrior.riposte";
const DEADLY_RIPOSTE = "warrior.deadly-riposte";
const CHARGE = "warrior.charge";
const ENRAGING_CHARGE = "warrior.enraging-charge";
const BAR = [
  FLAIL,
  DEFY_PAIN,
  DISMEMBER,
  JAIZHENJU_STRIKE,
  RIPOSTE,
  DEADLY_RIPOSTE,
  CHARGE,
  ENRAGING_CHARGE,
];

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
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: 1000,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** `w`, a rank-12 Warrior with a sword and `BAR`, at the origin. */
function warrior(extra: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return spec("w", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["warrior.strength", 12],
      ["warrior.axe-mastery", 12],
      ["warrior.swordsmanship", 12],
      ["warrior.tactics", 12],
    ]),
    equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
    ...extra,
  });
}

/** An axe in `f`'s hand: a melee attacker. */
const AXE = wielding(WEAPONS.axe, "warrior.axe-mastery");
/** A longbow in `f`'s hand: a projectile attacker. */
const LONGBOW = wielding(WEAPONS.longbow, "ranger.marksmanship");

/** `w` and `more`; `f`, its foe, in melee reach east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], self = warrior()) {
  const participants = [self, ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(RANGE_MELEE / 2, 0), { equipment: AXE }));
  }
  return new MatchSimulation({ seed: "warrior-staples", ruleset: NO_CRIT, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `w` uses `skillId` on `f`: what its skill logged until it landed. */
function used(sim: MatchSimulation, skillId: string): CombatEvent[] {
  sim.setTarget("w", "f");
  expect(sim.requestSkill("w", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "w" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    if (logged.length > 0) {
      return logged;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/**
 * `f` swings or shoots at `w` once: what the log said until it ended,
 * every source's but degeneration.
 */
function attacked(sim: MatchSimulation): CombatEvent[] {
  expect(sim.requestAttack("f", "w")).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  const logged = (): CombatEvent[] =>
    sim
      .step(DT)
      .log.filter((entry) => entry.cause !== "degeneration")
      .flatMap((entry) => entry.events);
  for (let i = 0; i < 4 * RULES.tickRateHz; i += 1) {
    events.push(...logged());
    if (events.some((event) => event.kind === "attack-blocked" || event.kind === "damage")) {
      // The block's trigger fires at the tick's drain, a tick on at most.
      events.push(...logged());
      return events;
    }
  }
  throw new Error("f's attack never landed");
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("remove-status with a statusId (#1549)", () => {
  it("takes only that status, and only if its category matches", () => {
    const set = new StatusSet();
    set.apply("crippled", 10, "f", NO_RANKS);
    set.apply("bleeding", 10, "f", NO_RANKS);
    expect(set.removeByCategory("hex", 1, undefined, "crippled")).toEqual([]);
    expect(set.removeByCategory("condition", 1, undefined, "crippled")).toEqual([
      { id: "crippled", sourceSkillId: undefined },
    ]);
    expect(set.has("bleeding")).toBe(true);
  });
});

describe("a bearer-blocks trigger bound to melee (#1549)", () => {
  /** The statuses whose triggers a block by `blocker` of `kind` fired, Riposte also on. */
  function fired(blocker: "bonettis-defense" | "riposte", kind: "melee" | "projectile") {
    const set = new StatusSet();
    set.apply("bonettis-defense", 10, "w", NO_RANKS);
    set.apply("riposte", 8, "w", NO_RANKS);
    set.recordBlock(blocker, "f", kind);
    return set
      .drainChanges()
      .flatMap((change) => (change.kind === "blocked" ? change.fired : []))
      .map(({ statusId }) => statusId);
  }

  it("fires on a melee block made by another status", () => {
    expect(fired("bonettis-defense", "melee")).toEqual(["bonettis-defense", "riposte"]);
    expect(fired("riposte", "melee")).toEqual(["riposte"]);
  });

  it("never on a projectile block", () => {
    expect(fired("bonettis-defense", "projectile")).toEqual([]);
  });
});

describe("Flail (#1549)", () => {
  it("attacks 33% faster and moves 33% slower for 12 s, for 4 adrenaline", () => {
    expect(skill(FLAIL)).toMatchObject({
      type: "stance",
      attributeId: "warrior.strength",
      cost: { kind: "adrenaline", amount: 4 },
      effects: [
        {
          kind: "apply-status",
          statusId: "flail",
          durationSeconds: {
            scaling: { attributeId: "warrior.strength", atZero: 1, atTwelve: 12.2 },
          },
        },
      ],
    });
    const set = new StatusSet();
    set.apply("flail", 12, "w", NO_RANKS);
    const modifiers = aggregateModifiers(set.active);
    expect(modifiers.attackDurationMultiplier).toBe(0.67);
    expect(modifiers.moveSpeedMultiplier).toBe(0.67);
  });
});

describe("Defy Pain (#1549)", () => {
  it("is an elite stance of +258 Health and +20 armor for 20 s", () => {
    expect(skill(DEFY_PAIN)).toMatchObject({
      type: "stance",
      elite: true,
      cost: { kind: "adrenaline", amount: 5 },
      effects: [{ kind: "apply-status", statusId: "defy-pain", durationSeconds: { flat: 20 } }],
    });
    expect(getStatusDefinition("defy-pain")).toMatchObject({
      category: "stance",
      maxHealthBonus: 258,
      armorModifier: 20,
    });
  });
});

describe("Dismember (#1549)", () => {
  it("an axe blow with no bonus that inflicts a Deep Wound for 17 s", () => {
    expect(skill(DISMEMBER)).toMatchObject({
      cost: { kind: "adrenaline", amount: 5 },
      attack: { weapon: "axe", weaponDamage: 1, bonusDamage: undefined },
    });
    const sim = match([], warrior({ equipment: AXE }));
    gainStrikes(get(sim, "w").combatant, 5, 0);
    used(sim, DISMEMBER);
    expect(get(sim, "f").combatant.statuses.get("deep-wound")?.durationSeconds).toBe(17);
  });
});

describe("Jaizhenju Strike (#1549)", () => {
  it("is Pure Strike's: +24, unblockable out of a stance", () => {
    expect(skill(JAIZHENJU_STRIKE)).toMatchObject({
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 8,
      attack: {
        weapon: "sword",
        bonusDamage: { scaling: { attributeId: "warrior.swordsmanship", atTwelve: 24.2 } },
        unblockable: { kind: "caster-lacks", category: "stance" },
      },
    });
  });
});

describe("Riposte and Deadly Riposte (#1549)", () => {
  /** `w` uses `ids` in turn, with a full adrenaline bar. */
  function riposting(sim: MatchSimulation, ...ids: string[]): void {
    for (const id of ids) {
      gainStrikes(get(sim, "w").combatant, 4, 0);
      used(sim, id);
    }
  }

  it("Riposte blocks the next melee blow, strikes its attacker for 68 and ends", () => {
    const sim = match();
    riposting(sim, RIPOSTE);
    expect(get(sim, "w").combatant.statuses.get("riposte")?.durationSeconds).toBe(8);
    const events = attacked(sim);
    expect(damageTo(events, "w")).toEqual([]);
    expect(damageTo(events, "f")).toEqual([68]);
    expect(get(sim, "w").combatant.statuses.has("riposte")).toBe(false);
  });

  it("Deadly Riposte strikes for 75 and Bleeding for 21 s", () => {
    const sim = match();
    riposting(sim, DEADLY_RIPOSTE);
    const events = attacked(sim);
    expect(damageTo(events, "f")).toEqual([75]);
    expect(get(sim, "f").combatant.statuses.get("bleeding")?.durationSeconds).toBe(21);
    expect(get(sim, "w").combatant.statuses.has("deadly-riposte")).toBe(false);
  });

  it("both up, one blow is blocked once and fires both, and both end", () => {
    const sim = match();
    riposting(sim, RIPOSTE, DEADLY_RIPOSTE);
    const events = attacked(sim);
    expect(damageTo(events, "w")).toEqual([]);
    expect(damageTo(events, "f").sort()).toEqual([68, 75]);
    const statuses = get(sim, "w").combatant.statuses;
    expect(statuses.has("riposte") || statuses.has("deadly-riposte")).toBe(false);
  });

  it("an arrow is neither blocked nor answered, and Riposte stays", () => {
    const sim = match([spec("f", 1, vec2(500, 0), { equipment: LONGBOW })]);
    riposting(sim, RIPOSTE);
    expect(blockChanceOf(get(sim, "w").combatant, "projectile", false)).toBe(0);
    const events = attacked(sim);
    expect(damageTo(events, "w")).toHaveLength(1);
    expect(get(sim, "w").combatant.statuses.has("riposte")).toBe(true);
  });

  it("with an axe in hand, the adrenaline is spent and nothing happens", () => {
    const sim = match([], warrior({ equipment: AXE }));
    const w = get(sim, "w").combatant;
    gainStrikes(w, 4, 0);
    expect(sim.requestSkill("w", BAR.indexOf(RIPOSTE))?.check).toEqual({ ok: true });
    for (let i = 0; i < RULES.tickRateHz; i += 1) {
      sim.step(DT);
    }
    expect(w.statuses.has("riposte")).toBe(false);
    expect(w.adrenaline.get(RIPOSTE) ?? 0).toBe(0);
  });
});

describe('"Charge!" (#1549)', () => {
  it("allies in earshot lose Crippled, not Bleeding, and move 33% faster for 11 s", () => {
    const sim = match([spec("a", 0, vec2(-200, 0))]);
    const ally = get(sim, "a").combatant;
    ally.statuses.apply("crippled", 30, "f", NO_RANKS);
    ally.statuses.apply("bleeding", 30, "f", NO_RANKS);
    used(sim, CHARGE);
    expect(ally.statuses.has("crippled")).toBe(false);
    expect(ally.statuses.has("bleeding")).toBe(true);
    expect(ally.statuses.get("charge")?.durationSeconds).toBe(11);
    expect(get(sim, "w").combatant.statuses.has("charge")).toBe(true);
    expect(aggregateModifiers(ally.statuses.active).moveSpeedMultiplier).toBe(1.33);
  });
});

describe("Enraging Charge (#1549)", () => {
  /** Strikes `w` has toward Dismember after one hit of its own on `f`, Enraging Charge on. */
  function strikesAfterHit(equipment: ResolvedEquipment, charging: boolean) {
    const sim = match([], warrior({ equipment }));
    const w = get(sim, "w").combatant;
    if (charging) {
      w.statuses.apply("enraging-charge", 13, "w", NO_RANKS);
    }
    expect(sim.requestAttack("w", "f")).toEqual({ ok: true });
    for (let i = 0; i < 4 * RULES.tickRateHz; i += 1) {
      const log = sim.step(DT).log;
      if (log.some((entry) => entry.events.some((event) => event.kind === "damage"))) {
        sim.step(DT);
        break;
      }
    }
    return {
      strikes: (w.adrenaline.get(DISMEMBER) ?? 0) / ADRENALINE_PER_STRIKE,
      charging: w.statuses.has("enraging-charge"),
    };
  }

  it("a melee hit gives 2 more strikes, and the stance ends", () => {
    const plain = strikesAfterHit(AXE, false);
    const charged = strikesAfterHit(AXE, true);
    expect(charged.strikes).toBe(plain.strikes + 2);
    expect(charged.charging).toBe(false);
  });

  it("a bow hit ends it with no more", () => {
    const plain = strikesAfterHit(LONGBOW, false);
    const charged = strikesAfterHit(LONGBOW, true);
    expect(charged.strikes).toBe(plain.strikes);
    expect(charged.charging).toBe(false);
  });

  it("moves 25% faster for 13 s", () => {
    expect(skill(ENRAGING_CHARGE)).toMatchObject({
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 20,
      effects: [
        {
          kind: "apply-status",
          statusId: "enraging-charge",
          durationSeconds: {
            scaling: { attributeId: "warrior.strength", atZero: 5, atTwelve: 13 },
          },
        },
      ],
    });
    const bearer = makeCombatant({ id: "w" });
    bearer.statuses.apply("enraging-charge", 13, "w", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).moveSpeedMultiplier).toBe(1.25);
  });
});

describe("the texts (#1549)", () => {
  const ranks = warrior().attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what each does", () => {
    expect(text(CHARGE)).toEqual([
      "Removes Crippled",
      'Applies "Charge!" for 11s (moves at 133% speed)',
    ]);
    expect(describeStatus("riposte", ranks)).toBe(
      "100% chance to block melee attacks. The next time it blocks a melee attack: deals 68 damage",
    );
    expect(describeStatus("deadly-riposte", ranks)).toBe(
      "100% chance to block melee attacks. The next time it blocks a melee attack: deals 75 damage, applies Bleeding for 21s (−3 Health degeneration)",
    );
    expect(describeStatus("enraging-charge", ranks)).toBe(
      "moves at 125% speed, ends if the bearer hits with an attack. Whenever it hits with a melee attack: gain 2 strikes of adrenaline",
    );
  });
});
