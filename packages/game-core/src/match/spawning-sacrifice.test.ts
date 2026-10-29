import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import {
  MatchSimulation,
  type CreatureKind,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

/**
 * Spirit sacrifice (#1309): Spawning Power skills that spend an allied
 * spirit for a spike or a heal, and Consume Soul, which answers a foe's
 * summons.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SPAWNING = "ritualist.spawning-power";
const RUPTURE = "ritualist.rupture-soul";
const TO_FLESH = "ritualist.spirit-to-flesh";
const FEAST = "ritualist.feast-of-souls";
const CONSUME = "ritualist.consume-soul";

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [RUPTURE, TO_FLESH, FEAST, CONSUME],
    attributeRanks: new Map([[SPAWNING, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 600,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** A creature of `kind` at `at`, on `team`, summoned by `ownerId`; `undefined`: a map's own. */
function creature(
  id: string,
  team: number,
  at: Vec2,
  kind: CreatureKind,
  ownerId: string | undefined,
): ParticipantSpec {
  return {
    ...spec(id, team, at, { skillBar: [] }),
    creature: {
      ownerId,
      kind,
      look: kind === "minion" ? "bone-minion" : "spirit",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: ownerId === undefined ? undefined : "test.summon",
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      companionSkillId: undefined,
      mode: "guard",
    },
  };
}

/** `r`, the Ritualist on team 0 at the origin, and `more`. */
function match(...more: ParticipantSpec[]): MatchSimulation {
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

function health(sim: MatchSimulation, id: string): number {
  return get(sim, id).combatant.health;
}

/** `r` targets `targetId` and asks for `skillId`: the activation's verdict. */
function request(sim: MatchSimulation, skillId: string, targetId: string | undefined) {
  sim.setTarget("r", targetId);
  return sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId))?.check;
}

/** `r` casts `skillId` at `targetId`, then the steps until it has gone off; their log. */
function cast(sim: MatchSimulation, skillId: string, targetId: string | undefined) {
  expect(request(sim, skillId, targetId)).toEqual({ ok: true });
  const skill = getSkill(skillId);
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(((skill?.activationSeconds ?? 0) + 0.3) / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("Rupture Soul (#1309)", () => {
  const field = () =>
    match(
      creature("r/s", 0, vec2(300, 0), "spirit", "r"),
      creature("f/s", 1, vec2(300, -300), "spirit", "f1"),
      creature("a/p", 0, vec2(0, 300), "pet", "a"),
      spec("a", 0, vec2(-200, 0)),
      spec("f1", 1, vec2(360, 0)),
      spec("f2", 1, vec2(300, 60)),
      spec("f3", 1, vec2(300, 200)),
    );

  it("is refused on anything but an allied spirit", () => {
    const sim = field();
    const refused = { ok: false, reason: "invalid-target-not-allied-spirit" };
    expect(request(sim, RUPTURE, "f/s")).toEqual(refused);
    expect(request(sim, RUPTURE, "a")).toEqual(refused);
    expect(request(sim, RUPTURE, "a/p")).toEqual(refused);
    expect(request(sim, RUPTURE, "r")).toEqual(refused);
    expect(request(sim, RUPTURE, "f1")).toEqual(refused);
  });

  it("strikes and blinds the foes nearby the spirit, then destroys it, nobody scoring", () => {
    const sim = field();
    sim.step(DT);
    expect(get(sim, "r").combatant.controlled.spirit).toBe(1);
    const log = cast(sim, RUPTURE, "r/s");
    for (const id of ["f1", "f2"]) {
      expect(health(sim, id), id).toBeLessThan(600);
      expect(get(sim, id).combatant.statuses.has("blind"), id).toBe(true);
    }
    expect(health(sim, "f3")).toBe(600);
    expect(get(sim, "f3").combatant.statuses.has("blind")).toBe(false);
    expect(sim.get("r/s")).toBeUndefined();
    expect(get(sim, "r").combatant.controlled.spirit).toBe(0);
    expect(log.flatMap((entry) => entry.events)).not.toContainEqual(
      expect.objectContaining({ kind: "death" }),
    );
    expect(sim.get("f/s")).toBeDefined();
  });
});

describe("Spirit to Flesh (#1309)", () => {
  it("is not cast out of touch range: its caster walks in to touch first", () => {
    const sim = match(creature("r/s", 0, vec2(300, 0), "spirit", "r"));
    sim.setTarget("r", "r/s");
    const asked = sim.requestSkill("r", get(sim, "r").skillBar.indexOf(TO_FLESH));
    expect(asked).toMatchObject({ check: { ok: true }, queued: true });
    for (let i = 0; i < Math.round(1 / DT); i += 1) {
      sim.step(DT);
    }
    expect(sim.get("r/s")).toBeDefined();
    expect(get(sim, "r").position.x).toBeGreaterThan(0);
  });

  it("heals the caster and the allies nearby it, and destroys the spirit", () => {
    const sim = match(
      creature("r/s", 0, vec2(30, 0), "spirit", "r"),
      spec("a", 0, vec2(0, 60)),
      spec("far", 0, vec2(0, 300)),
    );
    for (const id of ["r", "a", "far"]) {
      get(sim, id).combatant.health = 100;
    }
    cast(sim, TO_FLESH, "r/s");
    expect(health(sim, "r")).toBeCloseTo(298, 0);
    expect(health(sim, "a")).toBeCloseTo(298, 0);
    expect(health(sim, "far")).toBeCloseTo(100, 0);
    expect(sim.get("r/s")).toBeUndefined();
  });
});

describe("Feast of Souls (#1309)", () => {
  it("destroys the allied spirits nearby and heals the whole party for each", () => {
    const sim = match(
      creature("r/s1", 0, vec2(30, 0), "spirit", "r"),
      creature("a/s2", 0, vec2(0, -50), "spirit", "a"),
      creature("r/s3", 0, vec2(200, 0), "spirit", "r"),
      creature("f/s", 1, vec2(40, 40), "spirit", "f"),
      spec("a", 0, vec2(-300, 0)),
      spec("far", 0, vec2(2000, 0)),
      spec("f", 1, vec2(2000, 2000)),
    );
    get(sim, "far").combatant.health = 100;
    cast(sim, FEAST, undefined);
    expect(sim.get("r/s1")).toBeUndefined();
    expect(sim.get("a/s2")).toBeUndefined();
    expect(sim.get("r/s3")).toBeDefined();
    expect(sim.get("f/s")).toBeDefined();
    expect(health(sim, "far")).toBeCloseTo(100 + 2 * 90, 0);
  });

  it("heals nobody with no spirit nearby, and still recharges", () => {
    const sim = match(spec("far", 0, vec2(2000, 0)));
    get(sim, "far").combatant.health = 100;
    cast(sim, FEAST, undefined);
    expect(health(sim, "far")).toBeCloseTo(100, 0);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.get(FEAST)).toBeGreaterThan(0);
  });
});

describe("Consume Soul (#1309)", () => {
  it("steals from its target and strikes only the foe's summons in earshot of it", () => {
    const sim = match(
      spec("f", 1, vec2(300, 0)),
      spec("f2", 1, vec2(320, 40)),
      creature("f/m", 1, vec2(360, 0), "minion", "f"),
      creature("guard", 1, vec2(300, 80), "guard", undefined),
      creature("r/m", 0, vec2(330, -40), "minion", "r"),
    );
    get(sim, "r").combatant.health = 300;
    cast(sim, CONSUME, "f");
    expect(health(sim, "f")).toBeCloseTo(600 - 57, 0);
    expect(health(sim, "r")).toBeCloseTo(300 + 57, 0);
    // A minion rots a little each second (#467): the strike is what counts.
    expect(health(sim, "f/m")).toBeLessThan(health(sim, "r/m") - 50);
    expect(health(sim, "r/m")).toBeGreaterThan(590);
    expect(health(sim, "f2")).toBe(600);
    expect(health(sim, "guard")).toBe(600);
  });
});

describe("the four, described (#1309)", () => {
  const lines = (id: string, rank: number) => {
    const skill = getSkill(id);
    if (skill === undefined) throw new Error(id);
    return describeSkill(skill, new Map([[SPAWNING, rank]])).effects.map(({ text }) => text);
  };

  it("words each effect, at rank 12", () => {
    expect(lines(RUPTURE, 12)).toEqual([
      "Nearby foes take 122 damage and suffer Blind for 10s (90% of attacks miss)",
      "Destroys target allied spirit",
    ]);
    expect(lines(TO_FLESH, 12)).toEqual(["Heals for 198", "Destroys target allied spirit"]);
    expect(lines(FEAST, 12)).toEqual([
      "Destroys every allied spirit nearby",
      "Heals 90 for each spirit destroyed",
    ]);
    expect(lines(CONSUME, 12)).toEqual([
      "Steals up to 57 Health",
      "Foe creatures in earshot take 105 damage",
    ]);
  });

  it("scales from rank 0 to 15 as the corpus has it", () => {
    expect(lines(FEAST, 0)).toContain("Heals 50 for each spirit destroyed");
    expect(lines(FEAST, 15)).toContain("Heals 100 for each spirit destroyed");
    expect(lines(CONSUME, 0)).toContain("Foe creatures in earshot take 25 damage");
    expect(lines(CONSUME, 15)).toContain("Foe creatures in earshot take 125 damage");
    expect(lines(RUPTURE, 0)[0]).toContain("take 50 damage");
    expect(lines(RUPTURE, 15)[0]).toContain("take 140 damage");
  });
});
