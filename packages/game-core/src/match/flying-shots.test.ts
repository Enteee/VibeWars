import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Shots that fly differently (#1914): Focused Shot, Needling Shot, Forked
 * Arrow, Lava Arrows and Dancing Daggers, on a disable of the other
 * attack skills, an instant recharge on a hit, strikes read at release
 * and spells that fire several shots.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const FOCUSED_SHOT = "ranger.focused-shot";
const NEEDLING_SHOT = "ranger.needling-shot";
const FORKED_ARROW = "ranger.forked-arrow";
const DUAL_SHOT = "ranger.dual-shot";
/** A spell: no attack skill, so no disable reaches it. */
const CRY = "mesmer.cry-of-frustration";
const LAVA_ARROWS = "elementalist.lava-arrows";
const DANCING_DAGGERS = "assassin.dancing-daggers";
const BAR = [
  FOCUSED_SHOT,
  NEEDLING_SHOT,
  FORKED_ARROW,
  DUAL_SHOT,
  CRY,
  LAVA_ARROWS,
  DANCING_DAGGERS,
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

/** `r`, rank 12 in everything `BAR` reads, with a longbow, at the origin. */
function user(): ParticipantSpec {
  return spec("r", 0, vec2(0, 0), {
    skillBar: BAR,
    attributeRanks: new Map([
      ["ranger.marksmanship", 12],
      ["elementalist.fire-magic", 12],
      ["assassin.deadly-arts", 12],
    ]),
    equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
  });
}

/** `r` and `more`; `f`, its foe, 200 east unless `more` places it. */
function match(more: readonly ParticipantSpec[] = [], seed = "flying-shots") {
  const participants = [user(), ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(200, 0)));
  }
  return new MatchSimulation({ seed, ruleset: NO_CRIT, participants });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `r` uses `skillId` on `targetId`: what its skill logged until every shot landed. */
function used(sim: MatchSimulation, skillId: string, targetId = "f"): CombatEvent[] {
  sim.setTarget("r", targetId);
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
      .flatMap((entry) => entry.events);
    events.push(...logged);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** `r` uses `skillId` at `f` and steps until its first shot is in flight. */
function released(sim: MatchSimulation, skillId: string): void {
  sim.setTarget("r", "f");
  expect(sim.requestSkill("r", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz && sim.projectiles.length === 0; i += 1) {
    sim.step(DT);
  }
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

/** Which of `r`'s skills the events disabled, and for how long. */
function disabled(events: readonly CombatEvent[]): Map<string, number> {
  return new Map(
    events.flatMap((event) =>
      event.kind === "skill-disabled" && event.targetId === "r"
        ? [[event.skillId, event.seconds] as const]
        : [],
    ),
  );
}

describe("Focused Shot (#1914)", () => {
  it("is a 5-energy bow attack, +34 at rank 12, unblockable, three times as fast", () => {
    expect(skill(FOCUSED_SHOT)).toMatchObject({
      attributeId: "ranger.marksmanship",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0,
      rechargeSeconds: 8,
      attack: {
        weapon: "bow",
        bonusDamage: { scaling: { atZero: 10, atTwelve: 34 } },
        unblockable: true,
        flightSpeed: { multiplier: 3, when: undefined },
      },
    });
    const sim = match();
    released(sim, FOCUSED_SHOT);
    const [shot] = sim.projectiles;
    expect(shot?.speed).toBeCloseTo(3 * (WEAPONS.longbow.projectileSpeed ?? 0), 9);
  });

  it("on a hit, disables the other attack skills for 5 s at rank 12, no spell, not itself", () => {
    expect(disabled(used(match(), FOCUSED_SHOT))).toEqual(
      new Map([
        [NEEDLING_SHOT, 5],
        [FORKED_ARROW, 5],
        [DUAL_SHOT, 5],
      ]),
    );
  });

  it("a blind miss disables nothing", () => {
    let misses = 0;
    for (let n = 0; n < 20; n += 1) {
      const sim = match([], `focused-blind-${String(n)}`);
      get(sim, "r").combatant.statuses.apply("blind", 1000, "f", NO_RANKS);
      const events = used(sim, FOCUSED_SHOT);
      if (events.some((event) => event.kind === "attack-missed")) {
        misses += 1;
        expect(disabled(events).size).toBe(0);
      }
    }
    expect(misses).toBeGreaterThan(0);
  });

  it("cannot be blocked: Guardian on its target stops none of 20", () => {
    for (let n = 0; n < 20; n += 1) {
      const sim = match([], `focused-guardian-${String(n)}`);
      get(sim, "f").combatant.statuses.apply("guardian", 1000, "f", NO_RANKS);
      const events = used(sim, FOCUSED_SHOT);
      expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
      expect(damageTo(events, "f")).toHaveLength(1);
    }
  });
});

describe("Needling Shot (#1914)", () => {
  /** `f` at `health` of its maximum, struck by Needling Shot: its damage and whether it recharged. */
  function needle(health: (max: number) => number) {
    const sim = match();
    const foe = get(sim, "f").combatant;
    foe.health = health(foe.maxHealth);
    const events = used(sim, NEEDLING_SHOT);
    return {
      events,
      damage: damageTo(events, "f"),
      recharging: get(sim, "r").combatant.cast.rechargeRemaining.has(NEEDLING_SHOT),
    };
  }

  it("strikes for only 26 at rank 12, the arrow's roll counting for nothing", () => {
    expect(needle((max) => max).damage).toEqual([26]);
  });

  it("flies half as fast again as the bow's arrow", () => {
    const sim = match();
    released(sim, NEEDLING_SHOT);
    const [shot] = sim.projectiles;
    expect(shot?.speed).toBeCloseTo(1.5 * (WEAPONS.longbow.projectileSpeed ?? 0), 9);
  });

  it("recharges at once on a foe it leaves below 50% Health", () => {
    expect(needle((max) => max * 0.49).recharging).toBe(false);
  });

  it("does not on a foe it leaves at exactly 50%, nor on one above", () => {
    expect(needle((max) => max * 0.5 + 26).recharging).toBe(true);
    expect(needle((max) => max).recharging).toBe(true);
  });

  it("disables the other attack skills for 2 s", () => {
    expect(disabled(needle((max) => max).events)).toEqual(
      new Map([
        [FOCUSED_SHOT, 2],
        [FORKED_ARROW, 2],
        [DUAL_SHOT, 2],
      ]),
    );
  });
});

describe("Forked Arrow (#1914)", () => {
  /** Forked Arrow's blows on `f`, its archer bearing `statusId`. */
  function blows(statusId?: "guardian" | "mark-of-death"): number {
    const sim = match();
    if (statusId !== undefined) {
      get(sim, "r").combatant.statuses.apply(statusId, 1000, "f", NO_RANKS);
    }
    return damageTo(used(sim, FORKED_ARROW), "f").length;
  }

  it("shoots two arrows, one while its archer is enchanted or hexed", () => {
    expect(blows()).toBe(2);
    expect(blows("guardian")).toBe(1);
    expect(blows("mark-of-death")).toBe(1);
  });

  it("reads the hex as it leaves: one that ends in flight still leaves one arrow", () => {
    const sim = match();
    const archer = get(sim, "r").combatant;
    archer.statuses.apply("mark-of-death", 1000, "f", NO_RANKS);
    released(sim, FORKED_ARROW);
    archer.statuses.remove("mark-of-death");
    const events: CombatEvent[] = [];
    for (let i = 0; i < 5 * RULES.tickRateHz && sim.projectiles.length > 0; i += 1) {
      events.push(...sim.step(DT).log.flatMap((entry) => entry.events));
    }
    expect(damageTo(events, "f")).toHaveLength(1);
  });
});

describe("Lava Arrows (#1914)", () => {
  /** `f` and three more foes within nearby of it. */
  const FOES = [
    spec("f", 1, vec2(200, 0)),
    spec("f2", 1, vec2(200, AREA_NEARBY / 2)),
    spec("f3", 1, vec2(200, -AREA_NEARBY / 2)),
    spec("f4", 1, vec2(200 + AREA_NEARBY / 2, 0)),
  ];

  it("fires one arrow at each of up to 3 foes near the target, the target first", () => {
    const sim = match(FOES);
    released(sim, LAVA_ARROWS);
    expect(sim.projectiles.map((shot) => shot.targetId)).toHaveLength(3);
    expect(sim.projectiles[0]?.targetId).toBe("f");
  });

  it("each arrow strikes its own foe once, for the same 56 fire before armor, a fourth none", () => {
    const events = used(match(FOES), LAVA_ARROWS);
    const hit = ["f", "f2", "f3", "f4"].map((id) => damageTo(events, id));
    expect(hit.filter((damage) => damage.length === 1)).toHaveLength(3);
    expect(hit.filter((damage) => damage.length === 0)).toHaveLength(1);
    expect(hit[0]).toHaveLength(1);
    expect(new Set(hit.flat()).size).toBe(1);
    expect(skill(LAVA_ARROWS).effects).toEqual([
      expect.objectContaining({
        kind: "damage",
        type: "fire",
        amount: { scaling: expect.objectContaining({ atTwelve: 56 }) },
      }),
    ]);
  });

  it("with one foe near, one arrow", () => {
    const sim = match();
    released(sim, LAVA_ARROWS);
    expect(sim.projectiles).toHaveLength(1);
  });
});

describe("Dancing Daggers (#1914)", () => {
  it("has half the spell range", () => {
    expect(skill(DANCING_DAGGERS).range).toBe(RANGE_SPELL / 2);
  });

  it("sends three daggers, each its own flight, each striking for 29", () => {
    const sim = match([spec("f", 1, vec2(150, 0))]);
    released(sim, DANCING_DAGGERS);
    expect(sim.projectiles).toHaveLength(3);
    const events = used(match([spec("f", 1, vec2(150, 0))]), DANCING_DAGGERS);
    expect(damageTo(events, "f")).toHaveLength(3);
    expect(new Set(damageTo(events, "f")).size).toBe(1);
    expect(skill(DANCING_DAGGERS).effects[0]).toMatchObject({
      kind: "damage",
      type: "earth",
      amount: { scaling: { atZero: 5, atTwelve: 29 } },
    });
  });

  it("counts as a lead attack: its target bears the lead mark, so Fox Fangs may follow", () => {
    const sim = match([spec("f", 1, vec2(150, 0))]);
    used(sim, DANCING_DAGGERS);
    expect(get(sim, "r").combatant.chainMarks.get("f")?.role).toBe("lead");
  });
});

describe("the texts (#1914)", () => {
  const ranks = user().attributeRanks;
  const text = (id: string): string[] =>
    describeSkill(skill(id), ranks).effects.map((effect) => effect.text);

  it("say what each does", () => {
    expect(text(FOCUSED_SHOT)).toEqual([
      "+34 damage",
      "Cannot be blocked",
      "Flies ×3 as fast",
      "All of your other attack skills are disabled for 5 seconds",
    ]);
    expect(text(FORKED_ARROW)).toEqual([
      "Shoots 2 arrows at once; if you have an enchantment or you have a hex, only 1",
    ]);
    expect(text(LAVA_ARROWS)).toContain("A projectile at each foe: each can be dodged");
    expect(text(DANCING_DAGGERS)).toContain("3 projectiles: each can be dodged");
    expect(text(DANCING_DAGGERS)).toContain("Counts as a lead attack");
  });
});
