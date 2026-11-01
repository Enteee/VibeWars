import { describe, expect, it, vi } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type * as Catalog from "../skills/catalog.js";
import type { CombatEvent } from "../skills/effects.js";
import type { CreatureTemplate, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { BaseGuard } from "./guards.js";
import {
  countsForTeam,
  MatchSimulation,
  type CreatureKind,
  MAX_CREATURES,
  MAX_MAP_CREATURES,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Creatures (#1052, ADR-0035): bodies that are not players. No catalog
 * skill summons yet, so these tests add their own to the catalog.
 */

const TEST_SKILLS = vi.hoisted(() => new Map<string, Skill>());

vi.mock("../skills/catalog.js", async (importOriginal) => {
  const original = await importOriginal<typeof Catalog>();
  return {
    ...original,
    getSkill: (id: string) => TEST_SKILLS.get(id) ?? original.getSkill(id),
  };
});

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DEATH_MAGIC = "necromancer.death-magic";

const ANNIHILATION: MatchRules = {
  victory: "annihilation",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  deathPenalty: true,
};

/** A summon of `count` creatures, health 50…290 by Death Magic, an instant spell. */
function summonSkill(
  id: string,
  count: number,
  kind: CreatureKind = "minion",
  durationSeconds?: number,
): string {
  const creature: CreatureTemplate = {
    kind,
    look: kind === "minion" ? "bone-minion" : "spirit",
    name: kind === "minion" ? "Bone Minion" : "Test Spirit",
    maxHealth: { scaling: { attributeId: DEATH_MAGIC, atZero: 50, atTwelve: 290 } },
    armor: { flat: 20 },
    attack: undefined,
    ...(durationSeconds === undefined ? {} : { durationSeconds: { flat: durationSeconds } }),
    behaviour: { kind: "idle" },
    aura: undefined,
    replacedBy: undefined,
    leavesCorpses: undefined,
    onePerOwner: false,
    onDeath: "vanish",
    ownerDisableOnDeath: undefined,
    deathBurst: undefined,
    onDeathInRange: undefined,
  };
  TEST_SKILLS.set(id, {
    id,
    name: id,
    type: "spell",
    gwId: undefined,
    elite: false,
    flash: false,
    disabledAfterUseSeconds: undefined,
    profession: "necromancer",
    attributeId: DEATH_MAGIC,
    cost: undefined,
    overcast: 0,
    activationSeconds: 0,
    rechargeSeconds: 0,
    range: 0,
    target: "self",
    area: undefined,
    attack: undefined,
    whileActivating: undefined,
    corpse: undefined,
    companion: undefined,
    petAttack: undefined,
    projectile: undefined,
    effects: [{ kind: "summon", creature, count }],
  });
  return id;
}

const TWO = summonSkill("test.summon-two", 2);
const LASTING = summonSkill("test.summon-lasting", 1, "minion", 5);
const SPIRIT = summonSkill("test.summon-spirit", 1, "spirit");
/** Spirits, so no master's minion cap (#467) culls them before the match's limit. */
const MANY = summonSkill("test.summon-many", MAX_CREATURES - 1, "spirit");

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [TWO, LASTING, SPIRIT, MANY],
    attributeRanks: new Map([
      [DEATH_MAGIC, 12],
      ["necromancer.soul-reaping", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
  return result;
}

/** `n` on team 0 with `a`, and `x` and `y` on team 1, far apart. */
function match(rules?: MatchRules): MatchSimulation {
  return new MatchSimulation({
    seed: "creatures",
    matchRules: rules,
    participants: [
      spec("n", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 300)),
      spec("x", 1, vec2(600, 0)),
      spec("y", 1, vec2(600, 300)),
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

/** Cast `skillId` from `n`'s bar and step until it has gone off, then out of its aftercast. */
function summon(sim: MatchSimulation, skillId: string, by = "n"): void {
  const slot = get(sim, by).skillBar.indexOf(skillId);
  expect(sim.requestSkill(by, slot)?.check.ok).toBe(true);
  for (let i = 0; i < 40; i += 1) {
    sim.step(DT);
  }
}

function creatures(sim: MatchSimulation): Participant[] {
  return [...sim.participants()].filter((p) => p.creature !== undefined);
}

/** Kill `id` on the next step, by a burning it cannot outlast. */
function kill(sim: MatchSimulation, id: string): void {
  const { combatant } = get(sim, id);
  combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  combatant.health = 0.2;
  sim.step(DT);
}

describe("summon (#1052)", () => {
  it("makes `count` creatures, owned, on the owner's team, at the scaled health", () => {
    const sim = match();
    summon(sim, TWO);
    const made = creatures(sim);
    expect(made.map((p) => p.id)).toEqual(["n/c1", "n/c2"]);
    for (const creature of made) {
      expect(creature.creature).toMatchObject({
        ownerId: "n",
        kind: "minion",
        name: "Bone Minion",
      });
      expect(creature.combatant.team).toBe(0);
      expect(creature.combatant.maxHealth).toBe(290);
      expect(creature.combatant.maxEnergy).toBe(0);
      expect(creature.skillBar).toEqual([]);
      expect(countsForTeam(creature)).toBe(false);
    }
    expect(countsForTeam(get(sim, "n"))).toBe(true);
  });

  it("gives each creature its template's look (#1162)", () => {
    const sim = match();
    summon(sim, TWO);
    summon(sim, SPIRIT);
    expect(creatures(sim).map((p) => p.creature?.look)).toEqual([
      "bone-minion",
      "bone-minion",
      "spirit",
    ]);
  });

  it("numbers ids per match, and two runs make the same ones in the same order", () => {
    const run = () => {
      const sim = match();
      summon(sim, TWO);
      summon(sim, TWO, "x");
      return creatures(sim).map((p) => [p.id, p.position.x, p.position.y]);
    };
    const first = run();
    expect(first.map(([id]) => id)).toEqual(["n/c1", "n/c2", "x/c3", "x/c4"]);
    expect(run()).toEqual(first);
  });

  it("pushes its creatures apart, and off their owner, at their own radius", () => {
    const sim = match();
    summon(sim, TWO);
    const bodies = [get(sim, "n"), ...creatures(sim)];
    const radius = (p: Participant) =>
      p.creature === undefined ? RULES.collision.playerRadius : RULES.collision.creatureRadius;
    for (const [i, one] of bodies.entries()) {
      for (const other of bodies.slice(i + 1)) {
        const apart = Math.hypot(
          one.position.x - other.position.x,
          one.position.y - other.position.y,
        );
        expect(apart).toBeGreaterThanOrEqual(radius(one) + radius(other) - 1e-6);
      }
    }
  });

  it("makes as many as fit under MAX_CREATURES, and none past it, still paying", () => {
    const sim = match();
    summon(sim, MANY);
    expect(creatures(sim)).toHaveLength(MAX_CREATURES - 1);
    summon(sim, TWO);
    expect(creatures(sim)).toHaveLength(MAX_CREATURES);
    summon(sim, TWO, "x");
    expect(creatures(sim)).toHaveLength(MAX_CREATURES);
  });

  it("counts no body lying as corpses against MAX_CREATURES (#1836)", () => {
    const sim = match();
    summon(sim, SPIRIT);
    const body = get(sim, "n/c1");
    if (body.creature === undefined) {
      throw new Error("no creature");
    }
    body.creature.corpsesLeft = 3;
    kill(sim, body.id);
    summon(sim, MANY);
    summon(sim, TWO);
    expect(sim.get(body.id)?.combatant.dead).toBe(true);
    expect(summoned(sim).filter((p) => !p.combatant.dead)).toHaveLength(MAX_CREATURES);
  });

  it("counts no map creature against MAX_CREATURES (#1281)", () => {
    const sim = guarded(16);
    expect(creatures(sim)).toHaveLength(18);
    summon(sim, MANY);
    summon(sim, TWO);
    expect(summoned(sim)).toHaveLength(MAX_CREATURES);
    summon(sim, TWO, "x");
    expect(summoned(sim)).toHaveLength(MAX_CREATURES);
    expect(creatures(sim)).toHaveLength(MAX_CREATURES + 18);
  });

  it("refuses a map that places more than MAX_MAP_CREATURES (#1281)", () => {
    expect(() => guarded(MAX_MAP_CREATURES - 2)).not.toThrow();
    expect(() => guarded(MAX_MAP_CREATURES - 1)).toThrow(/at most 24/);
  });
});

/** `match()` with both Guild Lords and `guards` Footmen, far from everyone (#1281). */
function guarded(guards: number): MatchSimulation {
  const post = (i: number): BaseGuard => ({
    team: i % 2,
    role: "footman",
    position: vec2(3000 + 40 * i, 3000),
  });
  return new MatchSimulation({
    seed: "creatures",
    participants: [
      spec("n", 0, vec2(0, 0)),
      spec("a", 0, vec2(0, 300)),
      spec("x", 1, vec2(600, 0)),
      spec("y", 1, vec2(600, 300)),
    ],
    guildLords: [
      { team: 0, position: vec2(3000, 3200) },
      { team: 1, position: vec2(4000, 3200) },
    ],
    guards: Array.from({ length: guards }, (_, i) => post(i)),
  });
}

/** The creatures a participant summoned, a map's own aside. */
function summoned(sim: MatchSimulation): Participant[] {
  return creatures(sim).filter((p) => p.creature?.ownerId !== undefined);
}

describe("a creature's end (#1052)", () => {
  it("dies scoring nothing, costing no morale, and leaves at the end of the step", () => {
    const sim = match({ ...ANNIHILATION, victory: "kill-count", deathRule: "respawn" });
    summon(sim, TWO);
    kill(sim, "n/c1");
    expect(sim.get("n/c1")).toBeUndefined();
    expect(sim.score).toEqual(match().score);
    expect(get(sim, "n").combatant.morale).toBe(0);
    expect(get(sim, "x").combatant.morale).toBe(0);
    // Long past any respawn: it never comes back.
    for (let i = 0; i < 100; i += 1) {
      sim.step(DT);
    }
    expect(sim.get("n/c1")).toBeUndefined();
  });

  it("clears every target that pointed at it", () => {
    const sim = match();
    summon(sim, TWO);
    expect(sim.setTarget("x", "n/c1")).toBe(true);
    kill(sim, "n/c1");
    expect(get(sim, "x").targetId).toBeUndefined();
  });

  it("expires after its duration, counted from the step it came, without a death", () => {
    const sim = match(ANNIHILATION);
    expect(sim.requestSkill("n", 1)?.check.ok).toBe(true);
    for (let i = 1; i < Math.round(5 / DT); i += 1) {
      sim.step(DT);
    }
    expect(sim.get("n/c1")).toBeDefined();
    const deaths = sim
      .step(DT)
      .log.flatMap((entry) => entry.events)
      .filter((event) => event.kind === "death");
    expect(sim.get("n/c1")).toBeUndefined();
    expect(deaths).toEqual([]);
  });

  it("outlives its owner's death, and leaves with its owner", () => {
    const sim = match();
    summon(sim, TWO);
    kill(sim, "n");
    expect(get(sim, "n").combatant.dead).toBe(true);
    expect(creatures(sim)).toHaveLength(2);
    sim.remove("n");
    expect(creatures(sim)).toHaveLength(0);
  });

  it("lands nothing from a shot in flight at it once it is gone", () => {
    const longbow = WEAPONS.longbow;
    const sim = new MatchSimulation({
      seed: "creatures",
      participants: [
        spec("n", 0, vec2(0, 0)),
        spec("x", 1, vec2(600, 0), {
          equipment: {
            ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
            mainHand: {
              weapon: longbow,
              attributeId: "ranger.marksmanship",
              damageType: longbow.damageType,
              requirementMet: true,
              creatureDamageScale: undefined,
            },
          },
        }),
      ],
    });
    summon(sim, TWO);
    expect(sim.requestAttack("x", "n/c1")?.ok).toBe(true);
    for (let i = 0; i < 200 && sim.projectiles.length === 0; i += 1) {
      sim.step(DT);
    }
    expect(sim.projectiles).toHaveLength(1);
    sim.remove("n");
    const events: CombatEvent[] = [];
    for (let i = 0; i < 40; i += 1) {
      events.push(...sim.step(DT).log.flatMap((entry) => entry.events));
    }
    expect(sim.projectiles).toEqual([]);
    expect(events.filter((event) => event.targetId === "n/c1")).toEqual([]);
  });

  it("gives Soul Reaping a minion's death, not a spirit's", () => {
    const reaped = (skillId: string) => {
      const sim = match();
      summon(sim, skillId);
      get(sim, "n").combatant.energy = 0;
      const [creature] = creatures(sim);
      if (creature === undefined) {
        throw new Error("nothing summoned");
      }
      kill(sim, creature.id);
      return get(sim, "n").combatant.energy;
    };
    expect(reaped(TWO)).toBeGreaterThanOrEqual(12);
    expect(reaped(SPIRIT)).toBeLessThan(1);
  });
});

describe("a team (#1052)", () => {
  it("loses with only its creatures left standing", () => {
    const sim = match(ANNIHILATION);
    summon(sim, TWO, "x");
    kill(sim, "x");
    expect(sim.phase).toBe("active");
    kill(sim, "y");
    expect(creatures(sim)).toHaveLength(2);
    expect(sim.phase).toBe("finished");
    expect(sim.outcome.winningTeam).toBe(0);
  });

  it("gives its creatures no morale boost", () => {
    const sim = match(ANNIHILATION);
    summon(sim, TWO);
    sim.moraleBoost(0, 10);
    expect(get(sim, "n").combatant.morale).toBe(10);
    for (const creature of creatures(sim)) {
      expect(creature.combatant.morale).toBe(0);
    }
  });
});
