import { describe, expect, it } from "vitest";

import { AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1, type Ruleset } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { chargeAdrenaline } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import {
  MatchSimulation,
  type CreatureKind,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The anti-summon skills (#1528): Banish, Banishing Strike, Holy Spear
 * and Spiritual Pain, each harder on a summoned creature, a minion or a
 * spirit, than on anyone else.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** No roll ever crits. */
const NO_CRIT: Ruleset = { ...RULES, combat: { ...RULES.combat, criticalBaseChance: -1 } };

const BANISH = "monk.banish";
const BANISHING_STRIKE = "dervish.banishing-strike";
const HOLY_SPEAR = "paragon.holy-spear";
const SPIRITUAL_PAIN = "mesmer.spiritual-pain";

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
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

/** A creature of team 1's already standing; a map NPC's has no owner. */
function creature(id: string, kind: CreatureKind, spawn: Vec2): ParticipantSpec {
  const summoned = kind === "spirit" || kind === "minion" || kind === "pet";
  return spec(id, 1, spawn, {
    creature: {
      ownerId: summoned ? "f" : undefined,
      kind,
      look: kind === "spirit" ? "spirit" : kind === "pet" ? "beast" : "bone-minion",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: kind === "pet" ? "lie" : "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  });
}

/** `c`, at rank 12 in every attribute these skills use, at the origin. */
function caster(skillId: string): ParticipantSpec {
  const weapon = skillId === BANISHING_STRIKE ? WEAPONS.scythe : WEAPONS.spear;
  const attribute =
    skillId === BANISHING_STRIKE ? "dervish.scythe-mastery" : "paragon.spear-mastery";
  return spec("c", 0, vec2(0, 0), {
    skillBar: [skillId],
    attributeRanks: new Map([
      ["monk.smiting-prayers", 12],
      ["dervish.mysticism", 12],
      ["paragon.spear-mastery", 12],
      ["mesmer.domination-magic", 12],
    ]),
    equipment: wielding(weapon, attribute),
    maxEnergy: 100,
  });
}

/** `c` with `skillId` against `more`, `f` the foe player far off unless `more` places it. */
function match(skillId: string, more: readonly ParticipantSpec[], seed = "anti-summon") {
  const participants = [caster(skillId), ...more];
  if (!more.some((participant) => participant.id === "f")) {
    participants.push(spec("f", 1, vec2(3000, 3000)));
  }
  const sim = new MatchSimulation({ seed, ruleset: NO_CRIT, participants });
  chargeAdrenaline(get(sim, "c").combatant);
  return sim;
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `c` uses its skill on `targetId`: every event its skill logged until it landed. */
function used(sim: MatchSimulation, targetId: string): CombatEvent[] {
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", 0)?.check).toEqual({ ok: true });
  const events: CombatEvent[] = [];
  for (let i = 0; i < 5 * RULES.tickRateHz; i += 1) {
    const logged = sim
      .step(DT)
      .log.filter((entry) => entry.cause === "skill" && entry.sourceId === "c")
      .flatMap((entry) => entry.events);
    events.push(...logged);
    if (logged.length > 0 && sim.projectiles.length === 0) {
      return events;
    }
  }
  throw new Error("the skill never landed");
}

function damageTo(events: readonly CombatEvent[], targetId: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );
}

describe("Banish (#1528)", () => {
  it("doubles its 56 holy damage on a minion or a spirit, never a pet, a player or a map NPC", () => {
    const on = (kind: CreatureKind | "player"): number[] => {
      const sim = match(
        BANISH,
        kind === "player" ? [spec("t", 1, vec2(300, 0))] : [creature("t", kind, vec2(300, 0))],
      );
      return damageTo(used(sim, "t"), "t");
    };
    expect(on("minion")).toEqual([112]);
    expect(on("spirit")).toEqual([112]);
    for (const kind of ["pet", "player", "priest", "guard", "ghostly-hero"] as const) {
      expect(on(kind), kind).toEqual([56]);
    }
  });
});

describe("Banishing Strike (#1528)", () => {
  it("deals 50 holy damage in place of the scythe's, and 100 to a spirit", () => {
    const player = match(BANISHING_STRIKE, [spec("t", 1, vec2(60, 0))]);
    expect(damageTo(used(player, "t"), "t")).toEqual([50]);
    const spirit = match(BANISHING_STRIKE, [creature("t", "spirit", vec2(60, 0))]);
    expect(damageTo(used(spirit, "t"), "t")).toEqual([100]);
  });

  it("deals nothing when blocked", () => {
    const sim = match(BANISHING_STRIKE, [creature("t", "spirit", vec2(60, 0))]);
    get(sim, "t").combatant.statuses.apply("guardian", 1000, "t", NO_RANKS);
    for (let n = 0; n < 40; n += 1) {
      const events = used(sim, "t");
      if (events.some((event) => event.kind === "attack-blocked")) {
        expect(damageTo(events, "t")).toEqual([]);
        return;
      }
      for (let i = 0; i < 4 * RULES.tickRateHz; i += 1) {
        sim.step(DT);
      }
    }
    throw new Error("Guardian never blocked");
  });
});

describe("Holy Spear (#1528)", () => {
  it("on a player, only its +17: nobody near it is burned", () => {
    const sim = match(HOLY_SPEAR, [
      spec("t", 1, vec2(300, 0)),
      spec("f", 1, vec2(300 + AREA_NEARBY - 20, 0)),
    ]);
    const events = used(sim, "t");
    expect(damageTo(events, "t")).toHaveLength(1);
    expect(damageTo(events, "f")).toEqual([]);
    expect(get(sim, "f").combatant.statuses.has("burning")).toBe(false);
  });

  it("on a spirit, burns the foes nearby it for 3 s and deals them 75 holy damage", () => {
    const sim = match(HOLY_SPEAR, [
      creature("t", "spirit", vec2(300, 0)),
      spec("f", 1, vec2(300 + AREA_NEARBY - 20, 0)),
      spec("far", 1, vec2(300 + AREA_NEARBY + 50, 0)),
    ]);
    const events = used(sim, "t");
    expect(damageTo(events, "f")).toEqual([75]);
    expect(get(sim, "f").combatant.statuses.get("burning")?.durationSeconds).toBe(3);
    expect(damageTo(events, "far")).toEqual([]);
    expect(get(sim, "far").combatant.statuses.has("burning")).toBe(false);
  });
});

describe("Spiritual Pain (#1528)", () => {
  it("deals its foe 33, and the foes' summoned creatures in the area of it 105", () => {
    const sim = match(SPIRITUAL_PAIN, [
      spec("f", 1, vec2(300, 0)),
      spec("g", 1, vec2(340, 0)),
      creature("minion", "minion", vec2(300 + AREA_IN_THE_AREA - 10, 0)),
      creature("spirit", "spirit", vec2(300, 60)),
      creature("pet", "pet", vec2(300, -60)),
      creature("beyond", "minion", vec2(300 + AREA_IN_THE_AREA + 50, 0)),
    ]);
    const events = used(sim, "f");
    expect(damageTo(events, "f")).toEqual([33]);
    expect(damageTo(events, "minion")).toEqual([105]);
    expect(damageTo(events, "spirit")).toEqual([105]);
    for (const spared of ["g", "pet", "beyond"]) {
      expect(damageTo(events, spared), spared).toEqual([]);
    }
  });

  it("with no foe creature near its foe, deals only the 33", () => {
    const sim = match(SPIRITUAL_PAIN, [spec("f", 1, vec2(300, 0))]);
    expect(damageTo(used(sim, "f"), "f")).toEqual([33]);
  });
});

describe("the skill texts (#1528)", () => {
  const text = (id: string): string[] => {
    const skill = getSkill(id);
    if (skill === undefined) {
      throw new Error(`no skill ${id}`);
    }
    return describeSkill(skill, caster(id).attributeRanks).effects.map((effect) => effect.text);
  };

  it("says what each does", () => {
    expect(text(BANISH)).toEqual(["Deals 56 holy damage; if target is a summoned creature: +56"]);
    expect(text(BANISHING_STRIKE)).toEqual([
      "Deals only 50 holy damage",
      "If target is a summoned creature: +50 damage",
      "Hits up to 2 adjacent foes too",
    ]);
    expect(text(HOLY_SPEAR)).toEqual([
      "+17 damage",
      "If target is a summoned creature: nearby foes take 75 holy damage and suffer Burning for 3s (−7 Health degeneration)",
    ]);
    expect(text(SPIRITUAL_PAIN)).toEqual([
      "Deals 33 damage",
      "Foe creatures in the area take 105 damage",
    ]);
  });
});
