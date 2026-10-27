import { describe, expect, it } from "vitest";

import { MAX_ATTRIBUTE_RANK, isAffordable } from "../attributes.js";
import { baseEnergyPipsFor } from "../equipment/armor.js";
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
      // Eight in the arena at most, the player included (ADR-0020).
      expect(scenario.dummies.length).toBeLessThanOrEqual(7);
      expect(new Set(scenario.dummies.map((dummy) => dummy.id)).size).toBe(scenario.dummies.length);

      for (const dummy of scenario.dummies) {
        const where = `${scenario.id}/${dummy.id}`;
        expect(dummy.position.x, where).toBeGreaterThanOrEqual(0);
        expect(dummy.position.x, where).toBeLessThanOrEqual(map.width);
        expect(dummy.position.y, where).toBeGreaterThanOrEqual(0);
        expect(dummy.position.y, where).toBeLessThanOrEqual(map.height);
        // In reach of a spell from the spawn, unless reaching it is the lesson.
        if (!scenario.exercises.includes("range")) {
          expect(distance(dummy.position, map.playerSpawn), where).toBeLessThanOrEqual(RANGE_SPELL);
        }

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
        facing: 0,
        baseEnergyPips: baseEnergyPipsFor("elementalist"),
      },
      ...scenarioParticipants(played, map.playerSpawn),
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
  /** When `sourceId`'s `skillId` lands in `sim`, in seconds, over `seconds`. */
  function landings(
    sim: MatchSimulation,
    sourceId: string,
    skillId: string,
    seconds: number,
  ): number[] {
    const at: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.cause === "skill" && entry.skillId === skillId && entry.sourceId === sourceId) {
          at.push(entry.atSeconds);
        }
      }
    }
    return at;
  }

  it("loops Troll Unguent on itself: a 3 s cast, again 10 s after it lands", () => {
    const sim = arena(scenario("interrupt-timing"), "unguent");
    expect(landings(sim, "unguent", "ranger.troll-unguent", 25).map(Math.round)).toEqual([3, 16]);
  });

  it("the dazed one's Malaise takes 4 s, not 2: one every 6 s with its recharge", () => {
    const sim = arena(scenario("interrupt-timing"), "malaise");
    const at = landings(sim, "dazed", "necromancer.malaise", 25);
    // The first is asked for on the tick before the daze lands: 2 s.
    expect(at[0]).toBeCloseTo(2, 0);
    const gaps = at.slice(1).map((t, i) => t - (at[i] ?? 0));
    expect(gaps).toHaveLength(3);
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(6, 0);
    }
  });

  it("an archer shooting the dazed one stops every Malaise", () => {
    const sim = armedArena(scenario("interrupt-timing"), "archer", WEAPONS.longbow);
    expect(sim.requestAttack("player", "dazed")).toEqual({ ok: true });
    // Only the undazed first one, before an arrow has landed.
    expect(landings(sim, "dazed", "necromancer.malaise", 25).map(Math.round)).toEqual([2]);
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
        facing: 0,
      },
      ...scenarioParticipants(played, map.playerSpawn),
    ],
  });
}

describe("time-to-kill, headless (#111)", () => {
  it("dies to the player's sword, and is back at full health 2 s later", () => {
    const sim = armedArena(scenario("time-to-kill"), "ttk", WEAPONS.sword);
    expect(sim.requestAttack("player", "dummy")).toEqual({ ok: true });
    let diedAt: number | undefined;
    let backAt: number | undefined;
    for (let i = 0; i < Math.round(120 / DT) && backAt === undefined; i += 1) {
      sim.step(DT);
      const dummy = sim.get("dummy")?.combatant;
      if (diedAt === undefined && dummy?.dead === true) {
        diedAt = i * DT;
      } else if (diedAt !== undefined && dummy?.dead === false) {
        backAt = i * DT;
        expect(dummy.health).toBe(RULES.combat.baseHealth);
      }
    }
    expect(diedAt).toBeDefined();
    expect((backAt ?? Infinity) - (diedAt ?? 0)).toBeCloseTo(2, 1);
  });
});

describe("physical-vs-elemental, headless (#111)", () => {
  /** Every damage `targetId` takes in `seconds`, in order. */
  function damageTo(sim: MatchSimulation, targetId: string, seconds: number): number[] {
    const amounts: number[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        for (const event of entry.events) {
          if (event.kind === "damage" && event.targetId === targetId) {
            amounts.push(event.amount);
          }
        }
      }
    }
    return amounts;
  }

  it("the same sword swings land softer on the guarded warrior", () => {
    // One seed, so both runs roll the same swings.
    const swings = (targetId: string): number[] => {
      const sim = armedArena(scenario("physical-vs-elemental"), "physical", WEAPONS.sword);
      expect(sim.requestAttack("player", targetId)).toEqual({ ok: true });
      return damageTo(sim, targetId, 10);
    };
    const bare = swings("bare");
    const guarded = swings("guarded");
    expect(bare.length).toBeGreaterThan(5);
    expect(guarded).toHaveLength(bare.length);
    // +10 armor is a factor 2^(-10/40), then 3 off each hit.
    const factor = armorMultiplier(90, RULES.combat) / armorMultiplier(80, RULES.combat);
    guarded.forEach((amount, i) => {
      expect(amount).toBeLessThan(bare[i] ?? 0);
      // Within a point: both sides were rounded.
      expect(Math.abs(amount - ((bare[i] ?? 0) * factor - 3))).toBeLessThanOrEqual(1);
    });
  });

  it("a Fireball lands the same on both", () => {
    const burn = (targetId: string): number[] => {
      const sim = arena(scenario("physical-vs-elemental"), "elemental");
      sim.setTarget("player", targetId);
      expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
      return damageTo(sim, targetId, 3);
    };
    const bare = burn("bare");
    expect(bare).toHaveLength(1);
    expect(burn("guarded")).toEqual(bare);
  });
});

describe("condition-pressure, headless (#111)", () => {
  it("the loaded dummy loses 20 health a second and dies in 25 s; the clean one loses none", () => {
    const sim = arena(scenario("condition-pressure"), "conditions");
    const health = (id: string): number => sim.get(id)?.combatant.health ?? NaN;
    const max = RULES.combat.baseHealth;
    for (let i = 0; i < Math.round(10 / DT); i += 1) {
      sim.step(DT);
    }
    expect(health("loaded")).toBeCloseTo(max - 200, -1);
    expect(health("clean")).toBe(max);

    let diedAt: number | undefined;
    for (let i = Math.round(10 / DT); i < Math.round(40 / DT) && diedAt === undefined; i += 1) {
      sim.step(DT);
      if (sim.get("loaded")?.combatant.dead === true) {
        diedAt = (i + 1) * DT;
      }
    }
    expect(diedAt).toBeCloseTo(25, 0);
  });
});

describe("condition-removal, headless (#111)", () => {
  /** A monk at the spawn with Orison of Healing and Mend Affliction, both at 12. */
  function monkArena(): MatchSimulation {
    const played = scenario("condition-removal");
    const map = MAPS[played.mapId];
    if (map === undefined) {
      throw new Error(`no map ${played.mapId}`);
    }
    return new MatchSimulation({
      seed: "removal",
      participants: [
        {
          id: "player",
          team: PLAYER_TEAM,
          skillBar: ["monk.orison-of-healing", "monk.mend-affliction"],
          attributeRanks: new Map([
            ["monk.healing-prayers", 12],
            ["monk.protection-prayers", 12],
          ]),
          equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
          spawn: map.playerSpawn,
          facing: 0,
          baseEnergyPips: baseEnergyPipsFor("monk"),
        },
        ...scenarioParticipants(played, map.playerSpawn),
      ],
    });
  }

  function run(sim: MatchSimulation, seconds: number): void {
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      sim.step(DT);
    }
  }

  it("Mend Affliction takes two of the five off, and they are back within 10 s", () => {
    const sim = monkArena();
    const conditions = (): number =>
      sim.get("ally")?.combatant.statuses.countByCategory("condition") ?? NaN;
    run(sim, 0.5);
    expect(sim.get("ally")?.combatant.health).toBeLessThanOrEqual(200);
    expect(conditions()).toBe(5);

    sim.setTarget("player", "ally");
    expect(sim.requestSkill("player", 1)?.check).toEqual({ ok: true });
    run(sim, 1.5);
    expect(conditions()).toBe(3);

    run(sim, 9);
    expect(conditions()).toBe(5);
  });

  it("heals stop at 400, deep wound's cap", () => {
    const sim = monkArena();
    sim.setTarget("player", "ally");
    let most = 0;
    for (let i = 0; i < Math.round(30 / DT); i += 1) {
      sim.requestSkill("player", 0);
      sim.step(DT);
      most = Math.max(most, sim.get("ally")?.combatant.health ?? 0);
    }
    expect(most).toBe(400);
  });
});

describe("healing-throughput, headless (#111)", () => {
  it("each burner's Fireball takes 91 off the monk and 64 off the warrior, and nobody else", () => {
    const sim = arena(scenario("healing-throughput"), "throughput");
    const taken = new Map<string, number[]>();
    for (let i = 0; i < Math.round(20 / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        for (const event of entry.events) {
          if (event.kind === "damage" && entry.skillId === FIREBALL) {
            taken.set(event.targetId, [...(taken.get(event.targetId) ?? []), event.amount]);
          }
        }
      }
    }
    expect([...taken.keys()].sort()).toEqual(["monk", "warrior"]);
    // Both start at 150, so the monk takes one whole Fireball and the
    // warrior two; the killing blow takes only what is left.
    expect(taken.get("monk")?.[0]).toBe(91);
    expect(taken.get("warrior")?.slice(0, 2)).toEqual([64, 64]);
  });
});

describe("survivability, headless (#111)", () => {
  /** What the hunters deal in 30 s to a player who stands still at `armor`. */
  function damageTaken(armor: number): { damage: number; hits: number } {
    const played = scenario("survivability");
    const spawn = MAPS["training-hall"]?.playerSpawn ?? vec2(0, 0);
    const sim = new MatchSimulation({
      seed: "survive",
      participants: [
        {
          id: "player",
          team: PLAYER_TEAM,
          skillBar: [],
          attributeRanks: new Map(),
          equipment: unarmedResolvedEquipment(armor),
          spawn,
          facing: 0,
          // Immortal here, so the two armors are compared over the same 30 s.
          maxHealth: 10000,
        },
        ...scenarioParticipants(played, spawn),
      ],
    });
    let damage = 0;
    let hits = 0;
    for (let i = 0; i < Math.round(30 / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        for (const event of entry.events) {
          if (event.kind === "damage" && event.targetId === "player") {
            damage += event.amount;
            hits += 1;
          }
        }
      }
    }
    return { damage, hits };
  }

  it("the hunters close in and burn a still player; at 80 armor each burns about 0.71 of 60's", () => {
    const monk = damageTaken(60);
    const warrior = damageTaken(80);
    expect(monk.hits).toBeGreaterThanOrEqual(6);
    expect(warrior.hits).toBe(monk.hits);
    expect(warrior.damage / monk.damage).toBeCloseTo(Math.SQRT1_2, 1);
  });
});

describe("blind-denial, headless (#111)", () => {
  it("the blinded archer misses about nine in ten; the other hits every time", () => {
    const sim = armedArena(scenario("blind-denial"), "blind", WEAPONS.sword);
    const landed: Record<string, number> = { blinded: 0, control: 0 };
    const missed: Record<string, number> = { blinded: 0, control: 0 };
    for (let i = 0; i < Math.round(240 / DT); i += 1) {
      // Standing still: no arrow is dodged.
      for (const entry of sim.step(DT).log) {
        const from = entry.sourceId;
        if (entry.cause !== "weapon" || from === undefined || !(from in landed)) {
          continue;
        }
        for (const event of entry.events) {
          landed[from] = (landed[from] ?? 0) + (event.kind === "damage" ? 1 : 0);
          missed[from] = (missed[from] ?? 0) + (event.kind === "attack-missed" ? 1 : 0);
        }
      }
    }
    expect(missed.control).toBe(0);
    expect(landed.control).toBeGreaterThan(50);
    const shots = (landed.blinded ?? 0) + (missed.blinded ?? 0);
    expect(shots).toBeGreaterThan(50);
    expect((missed.blinded ?? 0) / shots).toBeGreaterThan(0.8);
    expect((missed.blinded ?? 0) / shots).toBeLessThan(0.97);
  });
});

describe("kiting-and-cripple, headless (#111)", () => {
  it("walks two lanes, the crippled runner at half the other's speed", () => {
    const sim = arena(scenario("kiting-and-cripple"), "kite");
    const start = {
      runner: sim.get("runner")?.position ?? vec2(0, 0),
      crippled: sim.get("crippled")?.position ?? vec2(0, 0),
    };
    // One second: less than a lane's length (240) at full speed, so
    // neither has turned back yet.
    for (let i = 0; i < Math.round(1 / DT); i += 1) {
      sim.step(DT);
    }
    const runner = distance(start.runner, sim.get("runner")?.position ?? vec2(0, 0));
    const crippled = distance(start.crippled, sim.get("crippled")?.position ?? vec2(0, 0));
    expect(runner).toBeGreaterThan(50);
    expect(crippled / runner).toBeCloseTo(0.5, 1);
    expect(sim.get("crippled")?.combatant.statuses.has("crippled")).toBe(true);
  });
});

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

/**
 * The pillar in `training-pillars` (250–290 by 170–250), as segments:
 * copied, since `game-core` must not import `game-maps`. The other two
 * pillars are far from these scenarios.
 */
const PILLAR = [
  { a: vec2(250, 170), b: vec2(290, 170) },
  { a: vec2(290, 170), b: vec2(290, 250) },
  { a: vec2(290, 250), b: vec2(250, 250) },
  { a: vec2(250, 250), b: vec2(250, 170) },
];

/** `scenario` on the pillars map, with the player holding Fireball at Fire Magic 12. */
function pillarArena(played: TrainingScenario, seed: string): MatchSimulation {
  const map = MAPS["training-pillars"];
  if (map === undefined) {
    throw new Error("no training-pillars");
  }
  return new MatchSimulation({
    seed,
    walls: PILLAR,
    participants: [
      {
        id: "player",
        team: PLAYER_TEAM,
        skillBar: [FIREBALL],
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
        equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        spawn: map.playerSpawn,
        facing: 0,
        baseEnergyPips: baseEnergyPipsFor("elementalist"),
      },
      ...scenarioParticipants(played, map.playerSpawn),
    ],
  });
}

/** Run `sim` for up to `seconds`: who Fireball damaged, and when it first landed. */
function fireballHits(sim: MatchSimulation, seconds: number): { hit: Set<string>; at?: number } {
  const hit = new Set<string>();
  let at: number | undefined;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      if (entry.skillId !== FIREBALL) {
        continue;
      }
      for (const event of entry.events) {
        if (event.kind === "damage") {
          hit.add(event.targetId);
          at ??= i * DT;
        }
      }
    }
  }
  return at === undefined ? { hit } : { hit, at };
}

describe("aoe-line-of-sight, headless (#111)", () => {
  it("a Fireball at the front burns the three in front of the pillar, not the two behind", () => {
    const sim = pillarArena(scenario("aoe-line-of-sight"), "pillar");
    // The two behind are inside the splash by straight-line distance.
    const radius = getSkill(FIREBALL)?.area?.radius ?? 0;
    for (const id of ["behind-north", "behind-south"]) {
      const behind = scenario("aoe-line-of-sight").dummies.find((dummy) => dummy.id === id);
      expect(distance(behind?.position ?? vec2(0, 0), vec2(235, 210))).toBeLessThan(radius);
    }
    sim.setTarget("player", "front");
    expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
    expect([...fireballHits(sim, 3).hit].sort()).toEqual(["front", "front-north", "front-south"]);
  });
});

describe("obstacles-and-los, headless (#111)", () => {
  it("a Fireball at the one behind the pillar walks out of its shadow, then lands", () => {
    const sim = pillarArena(scenario("obstacles-and-los"), "hidden");
    sim.setTarget("player", "hidden");
    const asked = sim.requestSkill("player", 0);
    expect(asked?.queued).toBe(true);
    const { hit } = fireballHits(sim, 10);
    expect([...hit]).toEqual(["hidden"]);
    // Off the line the pillar blocks.
    expect(Math.abs((sim.get("player")?.position.y ?? 210) - 210)).toBeGreaterThan(30);
  });

  it("a Fireball at the far one, in plain sight, walks into range, then lands", () => {
    const sim = pillarArena(scenario("obstacles-and-los"), "far");
    sim.setTarget("player", "far");
    expect(sim.requestSkill("player", 0)?.queued).toBe(true);
    const { hit } = fireballHits(sim, 10);
    expect([...hit]).toEqual(["far"]);
    // 446 away at the start, spell range 420.
    expect(distance(sim.get("player")?.position ?? vec2(0, 0), vec2(90, 210))).toBeGreaterThan(20);
  });
});

describe("fireball-dodge, headless", () => {
  /**
   * Three Fireballs land on a player who walks round the caster as `turn`
   * says, as dodge-drill's player does: a tangent walk drifts outward, and
   * a fourth would find the player out of range. How many of the three hit.
   */
  function hitsOutOfThree(turn: (released: boolean) => 0 | 1 | -1): number {
    const sim = armedArena(scenario("fireball-dodge"), "fireball", WEAPONS.sword);
    let landed = 0;
    let hits = 0;
    let flying = 0;
    for (let i = 0; i < Math.round(60 / DT) && landed < 3; i += 1) {
      const released = sim.projectiles.length > flying;
      flying = sim.projectiles.length;
      const from = sim.get("pyro")?.position ?? vec2(0, 0);
      const at = sim.get("player")?.position ?? vec2(0, 0);
      const way = turn(released);
      sim.setInputDirection("player", vec2(-(at.y - from.y) * way, (at.x - from.x) * way));
      for (const entry of sim.step(DT).log) {
        if (entry.skillId !== "elementalist.fireball") {
          continue;
        }
        for (const event of entry.events) {
          if (event.kind === "damage" || event.kind === "attack-dodged") {
            landed += 1;
            hits += event.kind === "damage" ? 1 : 0;
          }
        }
      }
    }
    expect(landed).toBe(3);
    return hits;
  }

  it("burns a player who stands still, every time", () => {
    expect(hitsOutOfThree(() => 0)).toBe(3);
  });

  it("never burns a player who turns round as each Fireball leaves", () => {
    let way: 1 | -1 = 1;
    expect(
      hitsOutOfThree((released) => {
        if (released) {
          way = way === 1 ? -1 : 1;
        }
        return way;
      }),
    ).toBe(0);
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

describe("block, headless (#534)", () => {
  it("keeps Guardian up, so about half the player's sword swings are blocked", () => {
    const sim = armedArena(scenario("block"), "block", WEAPONS.sword);
    expect(sim.requestAttack("player", "guardian")).toEqual({ ok: true });
    let guarded = 0;
    let landed = 0;
    let blocked = 0;
    const ticks = Math.round(60 / DT);
    for (let i = 0; i < ticks; i += 1) {
      for (const entry of sim.step(DT).log) {
        if (entry.cause !== "weapon" || entry.sourceId !== "player") {
          continue;
        }
        for (const event of entry.events) {
          landed += event.kind === "damage" ? 1 : 0;
          blocked += event.kind === "attack-blocked" ? 1 : 0;
        }
      }
      guarded += sim.get("guardian")?.combatant.statuses.has("guardian") === true ? 1 : 0;
    }
    // Up 6 s of every 7: it recasts as soon as Guardian recharges.
    expect(guarded / ticks).toBeGreaterThan(0.8);
    expect(blocked).toBeGreaterThan(0);
    expect(blocked / (landed + blocked)).toBeGreaterThan(0.25);
    expect(blocked / (landed + blocked)).toBeLessThan(0.6);
  });
});

describe("the area scenarios, headless (#111)", () => {
  /** Run `sim` for `seconds`: who took damage from `skillId`, and who took any at all. */
  function hits(
    sim: MatchSimulation,
    skillId: string,
    seconds: number,
  ): { bySkill: Set<string>; anyDamage: Set<string> } {
    const bySkill = new Set<string>();
    const anyDamage = new Set<string>();
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        for (const event of entry.events) {
          if (event.kind === "damage") {
            anyDamage.add(event.targetId);
            if (entry.skillId === skillId) {
              bySkill.add(event.targetId);
            }
          }
        }
      }
    }
    return { bySkill, anyDamage };
  }

  const FIVE = ["centre", "east", "north", "south", "west"];

  it("aoe-cluster: a Fireball at the centre burns exactly the five, not the stragglers", () => {
    const sim = arena(scenario("aoe-cluster"), "cluster");
    sim.setTarget("player", "centre");
    expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
    expect([...hits(sim, FIREBALL, 3).bySkill].sort()).toEqual(FIVE);
  });

  it("aoe-friendly-fire: the same Fireball burns the five, and the ally in it takes nothing", () => {
    const sim = arena(scenario("aoe-friendly-fire"), "friendly");
    sim.setTarget("player", "centre");
    expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
    const { bySkill, anyDamage } = hits(sim, FIREBALL, 3);
    expect([...bySkill].sort()).toEqual(FIVE);
    expect(anyDamage.has("ally")).toBe(false);
  });

  it("aoe-cap: Barrage at the centre of seven hits exactly six", () => {
    const played = scenario("aoe-cap");
    const map = MAPS[played.mapId];
    if (map === undefined) {
      throw new Error(`no map ${played.mapId}`);
    }
    const sim = new MatchSimulation({
      seed: "cap",
      participants: [
        {
          id: "player",
          team: PLAYER_TEAM,
          skillBar: ["ranger.barrage"],
          attributeRanks: new Map([["ranger.marksmanship", 12]]),
          equipment: {
            ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
            mainHand: {
              weapon: WEAPONS.longbow,
              attributeId: "ranger.marksmanship",
              requirementMet: true,
            },
          },
          spawn: map.playerSpawn,
          facing: 0,
          baseEnergyPips: baseEnergyPipsFor("ranger"),
        },
        ...scenarioParticipants(played, map.playerSpawn),
      ],
    });
    sim.setTarget("player", "centre");
    expect(sim.requestSkill("player", 0)?.check).toEqual({ ok: true });
    const { bySkill } = hits(sim, "ranger.barrage", 4);
    expect(bySkill.size).toBe(6);
    expect(bySkill.has("centre")).toBe(true);
  });
});
