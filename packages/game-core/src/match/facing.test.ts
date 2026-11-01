import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment } from "../geometry.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { directionAngle, facingToward, showsBackTo, spawnFacing } from "./facing.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
/** Where everyone starts facing in these tests: not 0, so a reset is visible. */
const START = 1;

describe("facingToward", () => {
  it("uses the atan2 convention, 0 along +x", () => {
    expect(facingToward(vec2(0, 0), vec2(10, 0))).toBe(0);
    expect(facingToward(vec2(0, 0), vec2(0, 10))).toBeCloseTo(Math.PI / 2, 9);
    expect(facingToward(vec2(0, 0), vec2(-10, 0))).toBeCloseTo(Math.PI, 9);
  });

  it("folds −π onto π, so facing stays in (−π, π]", () => {
    expect(directionAngle(-1, -0)).toBe(Math.PI);
    expect(facingToward(vec2(0, -0), vec2(-10, 0))).toBe(Math.PI);
  });

  it("is 0 for the same point", () => {
    expect(facingToward(vec2(3, 4), vec2(3, 4))).toBe(0);
  });
});

describe("spawnFacing", () => {
  it("faces the middle of the other team's spawns", () => {
    const other = [vec2(100, -50), vec2(100, 50)];
    expect(spawnFacing(vec2(0, 0), other, [vec2(0, 0), ...other])).toBe(0);
    expect(spawnFacing(vec2(200, 0), other, [vec2(200, 0), ...other])).toBeCloseTo(Math.PI, 9);
  });

  it("faces the middle of every spawn when the other team has none", () => {
    const all = [vec2(0, 0), vec2(0, 100)];
    expect(spawnFacing(vec2(0, 0), [], all)).toBeCloseTo(Math.PI / 2, 9);
  });

  it("faces 0 when the only spawn is its own", () => {
    expect(spawnFacing(vec2(5, 5), [], [vec2(5, 5)])).toBe(0);
    expect(spawnFacing(vec2(5, 5), [], [])).toBe(0);
  });
});

function swordsman(id: string, team: number, spawn: Vec2): ParticipantSpec {
  const equipment: ResolvedEquipment = {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon: WEAPONS.sword,
      attributeId: "warrior.swordsmanship",
      damageType: WEAPONS.sword.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
  return {
    id,
    team,
    skillBar: [FIREBALL, ARMOR_OF_EARTH],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
      ["elementalist.earth-magic", 12],
    ]),
    equipment,
    maxEnergy: 1000,
    baseEnergyPips: 0,
    maxHealth: 1e6,
    spawn,
    facing: START,
  };
}

/** `a` at the origin, and `b`, an enemy, wherever the test puts it. */
function pair(b: Vec2, walls: ReturnType<typeof segment>[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "facing",
    walls,
    participants: [swordsman("a", 0, vec2(0, 0)), swordsman("b", 1, b)],
  });
}

function facing(sim: MatchSimulation, id: string): number {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.facing;
}

describe("facing in the match (#187)", () => {
  it("starts at the spec's facing, turns to where you walk, and keeps it standing still", () => {
    const sim = pair(vec2(500, 500));
    expect(facing(sim, "a")).toBe(START);
    sim.setInputDirection("a", vec2(0, 1));
    sim.step(DT);
    expect(facing(sim, "a")).toBeCloseTo(Math.PI / 2, 9);
    sim.setInputDirection("a", vec2(0, 0));
    sim.step(DT);
    expect(facing(sim, "a")).toBeCloseTo(Math.PI / 2, 9);
  });

  it("faces a wall it pushes into, though it does not move", () => {
    const sim = pair(vec2(500, 500), [segment(vec2(20, -100), vec2(20, 100))]);
    sim.setInputDirection("a", vec2(1, 0));
    for (let i = 0; i < 20; i += 1) {
      sim.step(DT);
    }
    expect(facing(sim, "a")).toBe(0);
  });

  it("faces its target while swinging, and while approaching", () => {
    const near = pair(vec2(-50, 0));
    near.requestAttack("a", "b");
    near.step(DT);
    expect(facing(near, "a")).toBeCloseTo(Math.PI, 9);

    const far = pair(vec2(-500, 300));
    far.requestAttack("a", "b");
    far.step(DT);
    expect(facing(far, "a")).toBeCloseTo(Math.atan2(300, -500), 2);
  });

  it("turns to an enemy it casts at, but not for a self-cast", () => {
    const sim = pair(vec2(-200, 0));
    sim.requestSkill("a", 1);
    sim.step(DT);
    expect(facing(sim, "a")).toBe(START);

    for (let i = 0; i < 40; i += 1) {
      sim.step(DT);
    }
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(facing(sim, "a")).toBeCloseTo(Math.PI, 9);
  });

  it("faces the cast target mid-cast; a strafe gives the cast up and faces the walk (#279)", () => {
    const sim = pair(vec2(-200, 0));
    sim.setTarget("a", "b");
    sim.requestSkill("a", 0);
    sim.step(DT);
    expect(facing(sim, "a")).toBeCloseTo(Math.PI, 9);

    sim.setInputDirection("a", vec2(0, 1));
    sim.step(DT);
    expect(sim.get("a")?.combatant.cast.isCasting).toBe(false);
    expect(facing(sim, "a")).toBeCloseTo(Math.PI / 2, 9);
  });

  it("goes back to the spec's facing on a reset, and rearming keeps it", () => {
    const sim = pair(vec2(500, 500));
    sim.setInputDirection("a", vec2(-1, 0));
    sim.step(DT);
    sim.rearm(
      "a",
      {
        attributeRanks: new Map(),
        weaponSets: [
          { equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel), maxEnergy: 30 },
          null,
          null,
          null,
        ],
        maxHealth: 500,
        baseEnergyPips: 0,
      },
      [],
    );
    expect(facing(sim, "a")).toBeCloseTo(Math.PI, 9);
    sim.resetParticipant("a");
    expect(facing(sim, "a")).toBe(START);
  });
});

describe("showsBackTo (#533)", () => {
  it("is the back past 90° off the facing, and not side on or in front", () => {
    const at = vec2(0, 0);
    expect(showsBackTo(at, 0, vec2(-10, 0))).toBe(true);
    expect(showsBackTo(at, 0, vec2(-10, 9))).toBe(true);
    expect(showsBackTo(at, 0, vec2(0, 10))).toBe(false);
    expect(showsBackTo(at, 0, vec2(10, 0))).toBe(false);
    expect(showsBackTo(at, Math.PI, vec2(10, 0))).toBe(true);
  });
});

describe("a blow from behind a moving target always crits (#533)", () => {
  /** `a`, unskilled with a sword so its own crit chance is 1%, swings at `b` 40 ahead of it, facing away. */
  function chase(): MatchSimulation {
    const unskilled = { ...swordsman("a", 0, vec2(0, 0)), attributeRanks: new Map() };
    const sim = new MatchSimulation({
      seed: "behind",
      participants: [unskilled, { ...swordsman("b", 1, vec2(40, 0)), facing: 0 }],
    });
    sim.requestAttack("a", "b");
    return sim;
  }

  function swingsOver(sim: MatchSimulation, seconds: number): boolean[] {
    const critical: boolean[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      for (const entry of sim.step(DT).log) {
        for (const event of entry.events) {
          if (entry.cause === "weapon" && event.kind === "damage") {
            critical.push(event.critical);
          }
        }
      }
    }
    return critical;
  }

  it("crits every swing at a target walking away", () => {
    const sim = chase();
    // Crippled, so the chase catches it.
    sim.get("b")?.combatant.statuses.apply("crippled", 1e6, "a", NO_RANKS);
    sim.setInputDirection("b", vec2(1, 0));
    const swings = swingsOver(sim, 8);
    expect(swings.length).toBeGreaterThanOrEqual(3);
    expect(swings.every(Boolean)).toBe(true);
  });

  it("does not crit for the back of a target standing still", () => {
    const swings = swingsOver(chase(), 8);
    expect(swings.length).toBeGreaterThan(3);
    expect(swings.some(Boolean)).toBe(false);
  });
});
