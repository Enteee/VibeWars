import { describe, expect, it } from "vitest";

import { MAX_ATTRIBUTE_RANK, isAffordable } from "../attributes.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { getAttribute } from "../professions.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { RANGE_SPELL } from "../distances.js";
import { getSkill } from "../skills/catalog.js";
import { MISSING_MECHANIC_DESCRIPTIONS } from "../skills/coverage.js";
import { armorMultiplier, weaponAttributeMultiplier } from "../skills/damage.js";
import { describeSkill } from "../skills/describe.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation } from "./simulation.js";
import {
  PLAYER_TEAM,
  TRAINING_SCENARIOS,
  getTrainingScenario,
  scenarioParticipants,
  type TrainingScenario,
} from "./training-scenarios.js";

/**
 * The training catalogue's gate, in the style of `coverage.test.ts`: a
 * scenario that would teach something the simulation cannot do honestly
 * fails here, whatever it looks like in the editor.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";

/**
 * The training maps' size and player spawn, copied from
 * `game-maps/training/*`: `game-core` must not import `game-maps`. The
 * apps side cross-checks these against the real files (#10).
 */
const MAPS: Readonly<Record<string, { width: number; height: number; playerSpawn: Vec2 }>> = {
  "training-hall": { width: 560, height: 420, playerSpawn: vec2(100, 210) },
  "training-pillars": { width: 560, height: 420, playerSpawn: vec2(90, 210) },
};

describe("every training scenario", () => {
  it.each(TRAINING_SCENARIOS.map((scenario) => [scenario.id, scenario] as const))(
    "%s is honest and runnable",
    (_id, scenario: TrainingScenario) => {
      // Nothing it claims to teach is a mechanic the simulation lacks.
      const missing = Object.keys(MISSING_MECHANIC_DESCRIPTIONS);
      expect(scenario.exercises.filter((mechanic) => missing.includes(mechanic))).toEqual([]);

      const map = MAPS[scenario.mapId];
      expect(map, `unknown map ${scenario.mapId}`).toBeDefined();
      if (map === undefined) {
        return;
      }
      expect(scenario.dummies.length).toBeGreaterThan(0);
      expect(scenario.dummies.length).toBeLessThanOrEqual(8);
      expect(new Set(scenario.dummies.map((dummy) => dummy.id)).size).toBe(scenario.dummies.length);

      for (const dummy of scenario.dummies) {
        const where = `${scenario.id}/${dummy.id}`;
        expect(dummy.position.x, where).toBeGreaterThanOrEqual(0);
        expect(dummy.position.x, where).toBeLessThanOrEqual(map.width);
        expect(dummy.position.y, where).toBeGreaterThanOrEqual(0);
        expect(dummy.position.y, where).toBeLessThanOrEqual(map.height);
        expect(distance(dummy.position, map.playerSpawn), where).toBeLessThanOrEqual(RANGE_SPELL);

        // Its ranks are a character's ranks: real attributes, in bounds,
        // affordable.
        const ranks = Object.entries(dummy.attributeRanks);
        for (const [attributeId, rank] of ranks) {
          expect(getAttribute(attributeId), `${where}: ${attributeId}`).toBeDefined();
          expect(Number.isInteger(rank) && rank >= 0 && rank <= MAX_ATTRIBUTE_RANK).toBe(true);
        }
        expect(
          isAffordable(
            ranks.map(([attributeId, rank]) => ({ attributeId, rank })),
            RULES.attributes.attributePointBudget,
          ),
        ).toBe(true);

        // Every skill it uses is implemented, on its bar, and backed by
        // an attribute it has.
        const used =
          dummy.behaviour.kind === "cast-loop" ? dummy.behaviour.skillIds : dummy.skillBar;
        for (const skillId of [...dummy.skillBar, ...used]) {
          const skill = getSkill(skillId);
          expect(skill, `${where}: ${skillId}`).toBeDefined();
          expect(dummy.skillBar).toContain(skillId);
          expect(Object.keys(dummy.attributeRanks)).toContain(skill?.attributeId);
        }
      }
    },
  );

  it("are found by id", () => {
    expect(getTrainingScenario("armor-ladder")?.dummies).toHaveLength(6);
    expect(getTrainingScenario("no-such-scenario")).toBeUndefined();
  });
});

function scenario(id: string): TrainingScenario {
  const found = getTrainingScenario(id);
  if (found === undefined) {
    throw new Error(`no scenario ${id}`);
  }
  return found;
}

/** A player at the scenario's spawn, with Fireball at Fire Magic 12. */
function arena(played: TrainingScenario, seed: string): MatchSimulation {
  const map = MAPS[played.mapId];
  if (map === undefined) {
    throw new Error(`no map ${played.mapId}`);
  }
  return new MatchSimulation({
    seed,
    participants: [
      {
        id: "player",
        team: PLAYER_TEAM,
        skillBar: [FIREBALL],
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        spawn: map.playerSpawn,
      },
      ...scenarioParticipants(played),
    ],
  });
}

describe("armor-ladder, headless", () => {
  const ladder = scenario("armor-ladder");

  it("spaces its rungs wider than Fireball's splash", () => {
    // A rung inside a neighbour's splash takes two hits, and the ladder
    // stops being one hit per armor value.
    const radius = getSkill(FIREBALL)?.area?.radius ?? Infinity;
    for (const a of ladder.dummies) {
      for (const b of ladder.dummies) {
        if (a !== b) {
          expect(distance(a.position, b.position), `${a.id}–${b.id}`).toBeGreaterThan(radius);
        }
      }
    }
  });

  /** One Fireball at each rung, waiting out the recharge in between. */
  function climb(seed: string): Record<string, number> {
    const sim = arena(ladder, seed);
    const dealt: Record<string, number> = {};
    for (const dummy of ladder.dummies) {
      sim.setTarget("player", dummy.id);
      expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
      // Fireball lands at 1 s and recharges for 7: 9 s clears both.
      for (let i = 0; i < Math.round(9 / DT); i += 1) {
        // The Fireball alone: it also turns the player on the dummy with
        // their weapon, and the swings are not what this measures.
        for (const entry of sim.step(DT).log.filter((logged) => logged.cause === "skill")) {
          for (const event of entry.events) {
            if (event.kind === "damage") {
              dealt[event.targetId] = (dealt[event.targetId] ?? 0) + event.amount;
            }
          }
        }
      }
    }
    return dealt;
  }

  it("is the same twice from one seed, and is the tooltip's arithmetic", () => {
    const first = climb("ladder");
    expect(climb("ladder")).toEqual(first);

    const skill = getSkill(FIREBALL);
    const tooltip = skill
      ? describeSkill(skill, new Map([["elementalist.fire-magic", 12]])).effects[0]?.magnitude
      : undefined;
    expect(tooltip?.current).toBe(91);
    const expected = Object.fromEntries(
      ladder.dummies.map((dummy) => [
        dummy.id,
        Math.round((tooltip?.current ?? 0) * armorMultiplier(dummy.armor, RULES.combat)),
      ]),
    );
    expect(first).toEqual(expected);
    // The curve, as a row of numbers: 60 armor is exactly the tooltip.
    expect(first["armor-60"]).toBe(91);
  });
});

describe("interrupt-timing", () => {
  it("loops Troll Unguent on itself: a 3 s cast, again 10 s after it lands", () => {
    const sim = arena(scenario("interrupt-timing"), "unguent");
    const casts: number[] = [];
    for (let i = 0; i < Math.round(25 / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.cause === "skill" && entry.skillId === "ranger.troll-unguent") {
          casts.push(Math.round(entry.atSeconds));
        }
      }
    }
    expect(casts).toEqual([3, 16]);
  });
});

/** A player at the scenario's spawn, holding `weapon` at rank 12 of its attribute. */
function armedArena(played: TrainingScenario, seed: string, weapon: Weapon): MatchSimulation {
  const map = MAPS[played.mapId];
  if (map === undefined) {
    throw new Error(`no map ${played.mapId}`);
  }
  const attributeId = weapon.requirement.kind === "fixed" ? weapon.requirement.attributeId : "";
  return new MatchSimulation({
    seed,
    participants: [
      {
        id: "player",
        team: PLAYER_TEAM,
        skillBar: [],
        attributeRanks: new Map([[attributeId, 12]]),
        equipment: {
          ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          mainHand: { weapon, attributeId, requirementMet: true },
        },
        maxHealth: 1e6,
        spawn: map.playerSpawn,
      },
      ...scenarioParticipants(played),
    ],
  });
}

describe("weapon-dps, headless", () => {
  it("measures a sword at its own damage range, swing interval and rank", () => {
    const sword = WEAPONS.sword;
    const sim = armedArena(scenario("weapon-dps"), "dps", sword);
    expect(sim.requestAttack("player", "melee")).toEqual({ ok: true });

    const seconds = 30;
    const hits: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.cause === "weapon" && entry.sourceId === "player") {
          expect(entry.weaponId).toBe("sword");
          for (const event of entry.events) {
            if (event.kind === "damage" && event.targetId === "melee") {
              hits.push(event.amount);
            }
          }
        }
      }
    }
    // Already in reach: the first swing lands one interval in.
    expect(hits).toHaveLength(Math.floor(seconds / sword.attackIntervalSeconds));
    const scale = weaponAttributeMultiplier(12, RULES.combat) * armorMultiplier(60, RULES.combat);
    const average = hits.reduce((sum, hit) => sum + hit, 0) / hits.length;
    expect(average).toBeGreaterThanOrEqual(sword.damageMin * scale);
    expect(average).toBeLessThanOrEqual(sword.damageMax * scale);
  });
});

describe("dodge-drill, headless", () => {
  /**
   * Ten of the archer's shots land on a player who walks round it as
   * `turn` says: 0 stands still, 1 or -1 walks the circle one way or the
   * other. `released` is true on the tick a new shot leaves the bow. How
   * many of the ten hit. Round it, not away, so the walk never leaves the
   * bow's reach and the archer never stops to close in.
   */
  function hitsOutOfTen(turn: (released: boolean) => 0 | 1 | -1): number {
    const sim = armedArena(scenario("dodge-drill"), "dodge", WEAPONS.sword);
    let landed = 0;
    let hits = 0;
    let shots = 0;
    for (let i = 0; i < Math.round(60 / DT) && landed < 10; i += 1) {
      const released = sim.projectiles.length > shots;
      shots = sim.projectiles.length;
      const from = sim.get("archer")?.position ?? vec2(0, 0);
      const at = sim.get("player")?.position ?? vec2(0, 0);
      const way = turn(released);
      // Along the tangent: a steady walk at a steady distance.
      sim.setInputDirection("player", vec2(-(at.y - from.y) * way, (at.x - from.x) * way));
      for (const entry of sim.step(DT).log) {
        if (entry.cause !== "weapon" || entry.sourceId !== "archer") {
          continue;
        }
        expect(entry.weaponId).toBe("longbow");
        for (const event of entry.events) {
          if (event.kind === "damage" || event.kind === "attack-dodged") {
            landed += 1;
            hits += event.kind === "damage" ? 1 : 0;
          }
        }
      }
    }
    expect(landed).toBe(10);
    return hits;
  }

  it("hits a player who stands still, every time", () => {
    expect(hitsOutOfTen(() => 0)).toBe(10);
  });

  it("hits a player who walks steadily, every time: the shot leads them", () => {
    expect(hitsOutOfTen(() => 1)).toBe(10);
  });

  it("never hits a player who turns round as each arrow leaves the bow", () => {
    let way: 1 | -1 = 1;
    expect(
      hitsOutOfTen((released) => {
        if (released) {
          way = way === 1 ? -1 : 1;
        }
        return way;
      }),
    ).toBe(0);
  });
});
