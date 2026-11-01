import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, AREA_NEARBY, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import {
  MatchSimulation,
  type CreatureKind,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

/**
 * Ritualist spirit sacrifice (#1309): Rupture Soul and Spirit to Flesh
 * spend an allied spirit for a burst, Feast of Souls every one nearby for
 * a party heal, and Consume Soul answers the foes' summons.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RUPTURE = "ritualist.rupture-soul";
const FLESH = "ritualist.spirit-to-flesh";
const FEAST = "ritualist.feast-of-souls";
const CONSUME = "ritualist.consume-soul";

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [RUPTURE, FLESH, FEAST, CONSUME],
    attributeRanks: new Map([["ritualist.spawning-power", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A creature of `ownerId`'s already standing, as `#summon` would make it. */
function creature(
  id: string,
  ownerId: string,
  team: number,
  spawn: Vec2,
  kind: CreatureKind = "spirit",
): ParticipantSpec {
  return {
    ...spec(id, team, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    creature: {
      ownerId,
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
  };
}

/** `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "spawning-sacrifice",
    participants: [spec("r", 0, vec2(0, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `r` casts `skillId` at `targetId`, and steps until it has landed. */
function cast(sim: MatchSimulation, skillId: string, targetId: string | undefined): CombatEvent[] {
  sim.setTarget("r", targetId);
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log
    .filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
    .flatMap((entry) => entry.events);
}

/** Why `r` may not cast `skillId` at `targetId`, or `undefined` when it may. */
function refusal(sim: MatchSimulation, skillId: string, targetId: string): string | undefined {
  sim.setTarget("r", targetId);
  const check = sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check;
  return check === undefined || check.ok ? undefined : check.reason;
}

function amountsTo(
  events: readonly CombatEvent[],
  kind: "damage" | "heal" | "life-stolen",
  targetId: string,
): number[] {
  return events.flatMap((event) =>
    event.kind === kind && event.targetId === targetId ? [event.amount] : [],
  );
}

function destroyed(events: readonly CombatEvent[]): string[] {
  return events.flatMap((event) => (event.kind === "creature-destroyed" ? [event.targetId] : []));
}

describe("an allied spirit as the target (#1309)", () => {
  it("refuses a foe's spirit, a player, an ally's pet and yourself", () => {
    const sim = match([
      spec("a", 0, vec2(0, 100)),
      creature("fs", "f", 1, vec2(200, 0)),
      creature("pet", "a", 0, vec2(0, 150), "pet"),
      spec("f", 1, vec2(300, 0)),
    ]);
    for (const target of ["fs", "a", "pet", "r", "f"]) {
      expect(refusal(sim, RUPTURE, target), target).toBe("invalid-target-not-allied-spirit");
    }
  });
});

describe("Rupture Soul (#1309)", () => {
  it("strikes and blinds the foes nearby the spirit, not one farther, and destroys it", () => {
    const sim = match([
      spec("a", 0, vec2(0, 100)),
      // An ally's spirit is as good as your own.
      creature("s", "a", 0, vec2(300, 0)),
      spec("near1", 1, vec2(300 + AREA_NEARBY - 10, 0)),
      spec("near2", 1, vec2(300, AREA_NEARBY - 10)),
      spec("far", 1, vec2(300 + AREA_NEARBY + 50, 0)),
    ]);
    sim.step(DT);
    expect(get(sim, "a").combatant.controlled.spirit).toBe(1);

    const events = cast(sim, RUPTURE, "s");
    for (const foe of ["near1", "near2"]) {
      expect(amountsTo(events, "damage", foe), foe).toHaveLength(1);
      expect(get(sim, foe).combatant.statuses.has("blind"), foe).toBe(true);
    }
    expect(amountsTo(events, "damage", "far")).toEqual([]);
    expect(get(sim, "far").combatant.statuses.has("blind")).toBe(false);
    // The spirit is struck by nothing: it is destroyed, and is gone with
    // no corpse by the end of the step.
    expect(amountsTo(events, "damage", "s")).toEqual([]);
    expect(destroyed(events)).toEqual(["s"]);
    expect(sim.get("s")).toBeUndefined();
    expect(events.some((event) => event.kind === "death")).toBe(false);

    sim.step(DT);
    expect(get(sim, "a").combatant.controlled.spirit).toBe(0);
  });

  it("fails as any cast on a lost target does when its spirit is gone before it lands", () => {
    const sim = match([creature("s", "r", 0, vec2(300, 0)), spec("f", 1, vec2(300, 50))]);
    sim.setTarget("r", "s");
    expect(sim.requestSkill("r", 0)?.check.ok).toBe(true);
    const planted = get(sim, "s").creature;
    if (planted === undefined) {
      throw new Error("s is no creature");
    }
    // It runs out mid-cast.
    planted.expiresInSeconds = 0;
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < RULES.tickRateHz; i++) {
      log.push(...sim.step(DT).log);
    }
    expect(log.flatMap((entry) => (entry.skillId === RUPTURE ? entry.events : []))).toEqual([]);
    expect(get(sim, "f").combatant.statuses.has("blind")).toBe(false);
  });
});

describe("Spirit to Flesh (#1309)", () => {
  it("walks to touch a spirit out of reach before it lands", () => {
    const sim = match([creature("s", "r", 0, vec2(RANGE_MELEE * 4, 0))]);
    const events = cast(sim, FLESH, "s");
    expect(destroyed(events)).toEqual(["s"]);
    expect(get(sim, "r").position.x).toBeGreaterThan(RANGE_MELEE * 2);
  });

  it("heals you and the allies nearby you, not one farther, and destroys the spirit", () => {
    const sim = match([
      creature("s", "r", 0, vec2(RANGE_MELEE / 2, 0)),
      spec("near", 0, vec2(0, AREA_NEARBY - 10)),
      spec("far", 0, vec2(0, AREA_NEARBY + 50)),
    ]);
    for (const id of ["r", "near", "far"]) {
      get(sim, id).combatant.health -= 300;
    }
    const events = cast(sim, FLESH, "s");
    expect(amountsTo(events, "heal", "r")).toEqual([198]);
    expect(amountsTo(events, "heal", "near")).toEqual([198]);
    expect(amountsTo(events, "heal", "far")).toEqual([]);
    expect(destroyed(events)).toEqual(["s"]);
    expect(sim.get("s")).toBeUndefined();
  });
});

describe("Feast of Souls (#1309)", () => {
  it("destroys the allied spirits nearby only, and heals the whole party for each", () => {
    const sim = match([
      creature("mine", "r", 0, vec2(50, 0)),
      creature("theirs", "a", 0, vec2(0, AREA_NEARBY - 10)),
      creature("away", "r", 0, vec2(AREA_NEARBY + 50, 0)),
      creature("foes", "f", 1, vec2(-50, 0)),
      spec("a", 0, vec2(3000, 0)),
      spec("f", 1, vec2(3000, 3000)),
    ]);
    for (const id of ["r", "a", "f"]) {
      get(sim, id).combatant.health -= 300;
    }
    const events = cast(sim, FEAST, undefined);
    expect(destroyed(events).sort()).toEqual(["mine", "theirs"]);
    // A team-mate across the map, and you: 2 × 90.
    expect(amountsTo(events, "heal", "r")).toEqual([180]);
    expect(amountsTo(events, "heal", "a")).toEqual([180]);
    expect(amountsTo(events, "heal", "f")).toEqual([]);
    expect(sim.get("away")).toBeDefined();
    expect(sim.get("foes")).toBeDefined();
  });

  it("with no allied spirit nearby heals nobody, though it is used", () => {
    const sim = match([spec("a", 0, vec2(100, 0))]);
    get(sim, "a").combatant.health -= 300;
    const events = cast(sim, FEAST, undefined);
    expect(events.filter((event) => event.kind === "heal")).toEqual([]);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.get(FEAST)).toBeGreaterThan(0);
  });
});

describe("Consume Soul (#1309)", () => {
  it("steals from its foe, and strikes the foes' creatures in earshot of it, never a player, a pet or an ally's", () => {
    const sim = match([
      spec("f", 1, vec2(300, 0)),
      spec("g", 1, vec2(350, 0)),
      creature("minion", "g", 1, vec2(300 + AREA_EARSHOT - 10, 0), "minion"),
      creature("spirit", "g", 1, vec2(300, 100)),
      creature("pet", "g", 1, vec2(300, -100), "pet"),
      creature("beyond", "g", 1, vec2(300 + AREA_EARSHOT + 50, 0), "minion"),
      creature("ours", "r", 0, vec2(300, 50), "minion"),
    ]);
    get(sim, "r").combatant.health -= 300;
    const events = cast(sim, CONSUME, "f");
    expect(amountsTo(events, "life-stolen", "f")).toEqual([57]);
    expect(amountsTo(events, "heal", "r")).toEqual([57]);
    for (const hit of ["minion", "spirit"]) {
      expect(amountsTo(events, "damage", hit), hit).toEqual([105]);
    }
    for (const spared of ["f", "g", "pet", "beyond", "ours"]) {
      expect(amountsTo(events, "damage", spared), spared).toEqual([]);
    }
  });

  it("on a creature, steals from it and leaves it out of its own splash", () => {
    const sim = match([
      creature("minion", "g", 1, vec2(300, 0), "minion"),
      creature("other", "g", 1, vec2(300, 50), "minion"),
      spec("g", 1, vec2(3000, 0)),
    ]);
    const events = cast(sim, CONSUME, "minion");
    expect(amountsTo(events, "life-stolen", "minion")).toEqual([57]);
    expect(amountsTo(events, "damage", "minion")).toEqual([]);
    expect(amountsTo(events, "damage", "other")).toEqual([105]);
  });
});

describe("the skill texts (#1309)", () => {
  const text = (id: string) => {
    const skill = getSkill(id);
    if (skill === undefined) {
      throw new Error(`no skill ${id}`);
    }
    const described = describeSkill(skill, new Map([["ritualist.spawning-power", 12]]));
    return [described.targetText, ...described.effects.map((effect) => effect.text)];
  };

  it("says what each does", () => {
    expect(text(RUPTURE)).toEqual([
      "An allied spirit",
      "Nearby foes take 122 lightning damage and suffer Blind for 10s (90% of attacks miss)",
      "Destroys target allied spirit",
    ]);
    expect(text(FLESH)).toEqual([
      "An allied spirit, and allies nearby around you",
      "Heals for 198",
      "Destroys target allied spirit",
    ]);
    expect(text(FEAST)).toEqual([
      "Your whole party",
      "Destroys every allied spirit nearby",
      "Heals 90 for each spirit destroyed",
    ]);
    expect(text(CONSUME)).toEqual([
      "One foe",
      "Steals up to 57 Health",
      "Foe creatures in earshot take 105 damage",
    ]);
  });
});
