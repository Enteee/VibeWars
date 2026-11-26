import { describe, expect, it } from "vitest";

import { SPAWN_BUBBLE_RADIUS } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { segment, type Polygon, type Segment } from "../geometry.js";
import { clampToCircle } from "../movement.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import { teamBubble, teamBubbleDepth } from "./team-bubble.js";
import { BOT, BOUNDS, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";
/** A timed enchantment on the caster alone: allowed before the start (#3910). */
const AURA = "elementalist.aura-of-restoration";
/** Floating point puts a clamped point a hair past the edge, no more. */
const EDGE = SPAWN_BUBBLE_RADIUS + 1e-9;

function swordsman(id: string, team: number, spawn: Vec2, behaviour?: Behaviour): ParticipantSpec {
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
    skillBar: [FIREBALL, AURA],
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["elementalist.fire-magic", 12],
    ]),
    equipment,
    maxEnergy: 50,
    maxHealth: 500,
    spawn,
    facing: 0,
    ...(behaviour === undefined ? {} : { behaviour }),
  };
}

const EMPATHY = "mesmer.empathy";
const HAMSTRING = "warrior.hamstring";
const WARD = "elementalist.ward-against-melee";
const WELL = "necromancer.well-of-suffering";
const SPIRIT = "ranger.edge-of-extinction";
/** Every kind once refused before the start (#3910), all allowed now (#3931). */
const CASTER_BAR = [EMPATHY, HAMSTRING, WARD, WELL, SPIRIT];

/** A swordsman with `CASTER_BAR`, its energy deep enough for all of it. */
function caster(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    ...swordsman(id, team, spawn),
    skillBar: CASTER_BAR,
    attributeRanks: new Map([
      ["warrior.swordsmanship", 12],
      ["mesmer.domination-magic", 12],
      ["elementalist.earth-magic", 12],
      ["necromancer.death-magic", 12],
      ["ranger.wilderness-survival", 12],
    ]),
    maxEnergy: 100,
  };
}

/** `a` at the origin, and `b`, a foe within reach of a sword and a Fireball. */
function pair(behaviour?: Behaviour, walls: ReturnType<typeof segment>[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "held",
    walls,
    participants: [swordsman("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(60, 0), behaviour)],
  });
}

function one(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function hold(sim: MatchSimulation, seconds: number): void {
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    sim.stepHeld(DT, null);
  }
}

describe("clampToCircle (#3817)", () => {
  it("keeps a point inside, and brings one outside to the nearest point on the edge", () => {
    const inside = vec2(3, 4);
    expect(clampToCircle(inside, vec2(0, 0), 10)).toBe(inside);
    expect(clampToCircle(vec2(30, 40), vec2(0, 0), 10)).toEqual(vec2(6, 8));
    expect(clampToCircle(vec2(110, 0), vec2(100, 0), 5)).toEqual(vec2(105, 0));
  });
});

describe("held before the start (#3817)", () => {
  const rect = (x: number, y: number, width: number, height: number): Polygon => [
    vec2(x, y),
    vec2(x + width, y),
    vec2(x + width, y + height),
    vec2(x, y + height),
  ];
  /** `layer-test`'s bridge, with a drop-off along its north edge (as drop-offs.test.ts). */
  const deckLayers = (ground: readonly Segment[] = []): MatchLayers => ({
    count: 2,
    ground: 0,
    pits: [],
    walls: [ground, []],
    decks: [{ layer: 1, footprint: rect(500, 300, 600, 200) }],
    transitions: [{ from: 0, to: 1, area: rect(350, 300, 170, 200), uphill: UPHILL.e, pace: 1 }],
    outline: undefined,
    deepWater: [[], []],
    shallowWater: [[], []],
    dropOffs: [{ layer: 1, edge: { a: vec2(700, 300), b: vec2(900, 300) }, outward: vec2(0, -1) }],
  });

  function onDeck(spawn: Vec2, ground: readonly Segment[] = []): MatchSimulation {
    return new MatchSimulation({
      seed: "held-deck",
      ruleset: RULESET,
      bounds: BOUNDS,
      walls: [],
      layers: deckLayers(ground),
      participants: [fighter("a", 0, RANGER, spawn, { layer: 1, behaviour: undefined })],
    });
  }

  it("walks by keys to the edge of the spawn bubble and no further", () => {
    const sim = pair();
    sim.setInputDirection("a", vec2(-1, 0));
    hold(sim, 5);
    const position = one(sim, "a").position;
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(distance(position, vec2(0, 0))).toBeGreaterThan(SPAWN_BUBBLE_RADIUS - 1);
  });

  it("slides along the edge with a key held across it", () => {
    const sim = pair();
    sim.setInputDirection("a", vec2(-1, 0));
    hold(sim, 2);
    sim.setInputDirection("a", vec2(-1, 1));
    hold(sim, 2);
    const position = one(sim, "a").position;
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(position.y).toBeGreaterThan(20);
  });

  it("keeps out of a wall inside the bubble, sliding along both", () => {
    const sim = pair(undefined, [segment(vec2(-40, -200), vec2(-40, 200))]);
    sim.setInputDirection("a", vec2(-1, 1));
    hold(sim, 5);
    const position = one(sim, "a").position;
    expect(position.x).toBeGreaterThan(-40);
    expect(distance(position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(position.y).toBeGreaterThan(SPAWN_BUBBLE_RADIUS / 2);
  });

  it("stops a click-to-walk to a far point at the edge", () => {
    const sim = pair();
    sim.walkTo("a", vec2(-1000, 0));
    hold(sim, 5);
    const a = one(sim, "a");
    expect(distance(a.position, vec2(0, 0))).toBeLessThanOrEqual(EDGE);
    expect(a.position.x).toBeLessThan(-(SPAWN_BUBBLE_RADIUS - 1));
  });

  it("counts ticks but not the match clock", () => {
    const sim = pair();
    hold(sim, 1);
    expect(sim.tick).toBe(RULES.tickRateHz);
    expect(sim.elapsedSeconds).toBe(0);
    sim.step(DT);
    expect(sim.tick).toBe(RULES.tickRateHz + 1);
    expect(sim.elapsedSeconds).toBeCloseTo(DT, 9);
  });

  it("casts a foe's skill on a foe in reach while held, and it lands (#3931)", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 0)).toEqual({ skillId: FIREBALL, check: { ok: true } });
    hold(sim, 3);
    expect(one(sim, "a").combatant.energy).toBeLessThan(50);
    for (let tick = 0; tick < 3 * RULES.tickRateHz; tick += 1) {
      sim.step(DT);
    }
    expect(one(sim, "b").combatant.health).toBeLessThan(500);
  });

  it("still drops a plain attack while held (#3817)", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    expect(sim.requestAttack("a", "b")).toBeUndefined();
    hold(sim, 3);
    expect(one(sim, "b").combatant.health).toBe(500);
  });

  it("puts a hex and an attack skill on a foe in reach while held (#3931)", () => {
    const sim = new MatchSimulation({
      seed: "held",
      participants: [caster("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(60, 0))],
    });
    sim.stepHeld(DT, null);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", CASTER_BAR.indexOf(EMPATHY))?.check).toEqual({ ok: true });
    hold(sim, 2);
    expect(one(sim, "b").combatant.statuses.has("empathy")).toBe(true);
    expect(sim.requestSkill("a", CASTER_BAR.indexOf(HAMSTRING))?.check).toEqual({ ok: true });
    hold(sim, 2);
    expect(one(sim, "b").combatant.statuses.has("crippled")).toBe(true);
  });

  it("places a ward, a well and a spirit while held, with no foe near (#3931)", () => {
    const sim = new MatchSimulation({
      seed: "held",
      participants: [caster("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(5000, 0))],
    });
    for (const skillId of [WARD, WELL, SPIRIT]) {
      sim.stepHeld(DT, null);
      expect(sim.requestSkill("a", CASTER_BAR.indexOf(skillId))?.check, skillId).toEqual({
        ok: true,
      });
      hold(sim, 6);
    }
    expect(sim.groundEffects).toHaveLength(2);
    expect([...sim.participants()].some(({ creature }) => creature?.skillId === SPIRIT)).toBe(true);
  });

  it("keeps a spirit and a ward cast while held whole until the start (#3931)", () => {
    const sim = new MatchSimulation({
      seed: "held",
      participants: [caster("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(5000, 0))],
    });
    for (const skillId of [WARD, SPIRIT]) {
      sim.stepHeld(DT, null);
      expect(sim.requestSkill("a", CASTER_BAR.indexOf(skillId))?.check, skillId).toEqual({
        ok: true,
      });
      hold(sim, 6);
    }
    const spirit = [...sim.participants()].find(({ creature }) => creature?.skillId === SPIRIT);
    const lasts = spirit?.creature?.expiresInSeconds;
    const ward = sim.groundEffects[0]?.remainingSeconds;
    expect(lasts).toBeLessThan(Number.POSITIVE_INFINITY);
    expect(ward).toBeGreaterThan(0);
    // Held is a paused world beyond your own body: neither runs down.
    hold(sim, 10);
    expect(spirit?.creature?.expiresInSeconds).toBe(lasts);
    expect(sim.groundEffects[0]?.remainingSeconds).toBe(ward);
    sim.step(DT);
    expect(spirit?.creature?.expiresInSeconds).toBeCloseTo((lasts ?? 0) - DT, 9);
  });

  it("refuses a hex with no foe in reach by the target rule alone (#3931)", () => {
    const sim = new MatchSimulation({
      seed: "held",
      participants: [caster("a", 0, vec2(0, 0)), swordsman("b", 1, vec2(5000, 0))],
    });
    sim.stepHeld(DT, null);
    expect(sim.requestSkill("a", CASTER_BAR.indexOf(EMPATHY))?.check).toEqual({
      ok: false,
      reason: "no-target",
    });
  });

  it("casts an enchantment on oneself while held, and it runs down (#3910)", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.setTarget("a", "b");
    expect(sim.requestSkill("a", 1)?.check).toEqual({ ok: true });
    hold(sim, 3);
    const aura = one(sim, "a").combatant.statuses.active.find(
      ({ id }) => id === "aura-of-restoration",
    );
    expect(aura).toBeDefined();
    expect(aura?.remainingSeconds).toBeLessThan(60);
    // Still selected: casting on oneself does not drop the foe.
    expect(one(sim, "a").targetId).toBe("b");
    expect(one(sim, "b").combatant.health).toBe(500);
  });

  it("regenerates energy while held, and the match clock stays at 0 (#3910)", () => {
    const sim = pair();
    one(sim, "a").combatant.energy = 10;
    one(sim, "a").combatant.baseEnergyPips = 4;
    hold(sim, 5);
    expect(one(sim, "a").combatant.energy).toBeGreaterThan(10);
    expect(sim.elapsedSeconds).toBe(0);
  });

  it("lets a bot wander within half its bubble, and move at least once in 10 s (#3910)", () => {
    const sim = pair(BOT);
    const b = one(sim, "b");
    let moved = false;
    for (let tick = 0; tick < 10 * RULES.tickRateHz; tick += 1) {
      sim.stepHeld(DT, null);
      moved ||= distance(b.position, vec2(60, 0)) > 1;
      expect(distance(b.position, vec2(60, 0))).toBeLessThanOrEqual(0.5 * SPAWN_BUBBLE_RADIUS + 1);
    }
    expect(moved).toBe(true);
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("keeps a chasing creature still: it neither chases nor swings", () => {
    const sim = pair({
      kind: "parallel",
      behaviours: [
        { kind: "chase", targeting: { kind: "nearest-enemy" }, standOffUnits: 0 },
        { kind: "auto-attack", targeting: { kind: "nearest-enemy" }, reach: undefined },
      ],
    });
    hold(sim, 3);
    expect(one(sim, "b").position).toEqual(vec2(60, 0));
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("holds a participant added while held in its team's bubble, now grown to its spawn (#3930)", () => {
    const sim = pair();
    sim.stepHeld(DT, null);
    sim.add(swordsman("c", 0, vec2(0, -300)));
    expect(one(sim, "c").position).toEqual(vec2(0, -300));
    sim.walkTo("c", vec2(0, 1000));
    hold(sim, 10);
    // Past `a`, far out of its own circle, at the edge of the two's bubble.
    const c = one(sim, "c").position;
    const bubble = teamBubble([vec2(0, 0), vec2(0, -300)]);
    expect(c.y).toBeGreaterThan(0);
    expect(teamBubbleDepth(c, bubble)).toBeGreaterThanOrEqual(-1e-9);
    expect(teamBubbleDepth(c, bubble)).toBeLessThan(1);
  });

  describe("in one bubble for the whole team (#3930)", () => {
    /** `a` at the origin and its teammate `c` 300 east; the foe `b` far south. */
    function team(behaviour?: Behaviour): MatchSimulation {
      return new MatchSimulation({
        seed: "held-team",
        walls: [],
        participants: [
          swordsman("a", 0, vec2(0, 0)),
          swordsman("c", 0, vec2(300, 0), behaviour),
          swordsman("b", 1, vec2(150, 2000)),
        ],
      });
    }
    const bubble = teamBubble([vec2(0, 0), vec2(300, 0)]);

    it("walks from its spawn to a teammate's 300 away, and arrives", () => {
      const sim = team();
      sim.walkTo("a", vec2(300, 30));
      hold(sim, 10);
      expect(distance(one(sim, "a").position, vec2(300, 30))).toBeLessThan(1);
    });

    it("stops a walk out of the team's bubble at its edge, between the spawns too", () => {
      const sim = team();
      sim.walkTo("a", vec2(150, -1000));
      hold(sim, 10);
      const a = one(sim, "a").position;
      expect(teamBubbleDepth(a, bubble)).toBeGreaterThanOrEqual(-1e-9);
      expect(teamBubbleDepth(a, bubble)).toBeLessThan(1);
      expect(a.y).toBeLessThan(-(SPAWN_BUBBLE_RADIUS - 1));
    });

    it("slides along a straight side with a key held out of it", () => {
      const sim = team();
      sim.setInputDirection("a", vec2(1, -1));
      hold(sim, 5);
      const a = one(sim, "a").position;
      expect(a.x).toBeGreaterThan(SPAWN_BUBBLE_RADIUS);
      expect(teamBubbleDepth(a, bubble)).toBeGreaterThanOrEqual(-1e-9);
      expect(teamBubbleDepth(a, bubble)).toBeLessThan(1);
    });

    it("lets a bot wander round every teammate's spawn, always inside the bubble", () => {
      const sim = team(BOT);
      const c = one(sim, "c");
      let nearA = false;
      for (let tick = 0; tick < 120 * RULES.tickRateHz; tick += 1) {
        sim.stepHeld(DT, null);
        nearA ||= distance(c.position, vec2(0, 0)) <= 0.5 * SPAWN_BUBBLE_RADIUS + 1;
        // Within half the margin of a spawn, and straight between such points.
        expect(teamBubbleDepth(c.position, bubble)).toBeGreaterThanOrEqual(
          0.5 * SPAWN_BUBBLE_RADIUS - 1,
        );
      }
      expect(nearA).toBe(true);
    });
  });

  it("does nothing once the match has started", () => {
    const sim = pair();
    sim.step(DT);
    sim.setInputDirection("a", vec2(-1, 0));
    const before = one(sim, "a").position;
    const result = sim.stepHeld(DT, null);
    expect(result.tick).toBe(1);
    expect(one(sim, "a").position).toEqual(before);
  });

  it("does nothing once the match is over", () => {
    const sim = pair();
    sim.forfeit(1, new Set([0, 1]));
    sim.step(DT);
    expect(sim.phase).toBe("finished");
    const tick = sim.tick;
    sim.stepHeld(DT, null);
    expect(sim.tick).toBe(tick);
  });

  it("keeps a deck spawn's bubble standable across a drop-off, and spawn on its own layer", () => {
    const spawn = vec2(800, 340);
    const sim = onDeck(spawn);
    const a = one(sim, "a");
    let dropped = false;
    for (const direction of [vec2(0, -1), vec2(1, -1), vec2(0, 1), vec2(-1, 0), vec2(0, -1)]) {
      sim.setInputDirection("a", direction);
      for (let tick = 0; tick < 2 * RULES.tickRateHz; tick += 1) {
        sim.stepHeld(DT, null);
        dropped ||= a.layer === 0;
        expect(distance(a.position, spawn)).toBeLessThanOrEqual(SPAWN_BUBBLE_RADIUS + 1);
        if (a.position.x === spawn.x && a.position.y === spawn.y) {
          expect(a.layer).toBe(1);
        }
      }
      // At rest against the bubble: standing somewhere it may, on the layer it is on.
      expect(sim.standable(a.position, a.layer), JSON.stringify(direction)).toBe(true);
    }
    // It did step off the deck: the bubble holds on the layer below too.
    expect(dropped).toBe(true);
  });

  it("puts one displaced to another layer back at its spawn on the spawn's layer", () => {
    const spawn = vec2(800, 400);
    // Under the deck, a wall right where the bubble's edge would hold it.
    const sim = onDeck(spawn, [segment(vec2(700, 481), vec2(900, 481))]);
    const a = one(sim, "a");
    a.layer = 0;
    a.position = vec2(800, 520);
    sim.stepHeld(DT, null);
    expect(a.position).toEqual(spawn);
    expect(a.layer).toBe(1);
  });
});

describe("bots prepare before the start (#3910)", () => {
  const MENDING = "monk.mending";
  /** A 10 s stance on oneself. */
  const STEADY = "warrior.steady-stance";
  const COUNTDOWN_SECONDS = 10;

  function prepping(): MatchSimulation {
    return new MatchSimulation({
      seed: "prep",
      participants: [
        swordsman("a", 0, vec2(0, 0)),
        {
          ...swordsman("b", 1, vec2(600, 0), BOT),
          skillBar: [MENDING, STEADY],
          attributeRanks: new Map([
            ["monk.healing-prayers", 12],
            ["warrior.tactics", 12],
          ]),
          baseEnergyPips: 4,
        },
      ],
    });
  }

  /** 3 s waiting for the players, then the countdown: what `b` used, when, and where it ended. */
  function hold(sim: MatchSimulation) {
    const used: { readonly skillId: string; readonly secondsLeft: number | null }[] = [];
    const countdown = Math.round(COUNTDOWN_SECONDS / DT);
    const ticks = Math.round(3 / DT) + countdown;
    for (let tick = 0; tick < ticks; tick += 1) {
      const counted = tick - (ticks - countdown);
      const secondsLeft = counted < 0 ? null : (countdown - counted) * DT;
      for (const entry of sim.stepHeld(DT, secondsLeft).log) {
        if (entry.sourceId === "b" && entry.skillId !== undefined) {
          used.push({ skillId: entry.skillId, secondsLeft });
        }
      }
    }
    return { used, at: one(sim, "b").position };
  }

  it("puts a maintained enchantment up while waiting, and a stance only once it lasts past the start", () => {
    const sim = prepping();
    const { used } = hold(sim);
    const mending = used.find(({ skillId }) => skillId === MENDING);
    const steady = used.find(({ skillId }) => skillId === STEADY);
    expect(mending?.secondsLeft).toBeNull();
    expect(steady?.secondsLeft).not.toBeNull();
    expect(steady?.secondsLeft).toBeLessThanOrEqual(8);
    const b = one(sim, "b");
    expect(b.combatant.statuses.has("mending")).toBe(true);
    expect(b.combatant.statuses.has("steady-stance")).toBe(true);
    expect(b.combatant.energy).toBeGreaterThanOrEqual(0.5 * b.combatant.maxEnergy);
    expect(one(sim, "a").combatant.health).toBe(500);
  });

  it("does the same, in the same places, for the same seed", () => {
    expect(hold(prepping())).toEqual(hold(prepping()));
  });
});
