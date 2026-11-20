import { describe, expect, it, vi } from "vitest";

import { segment, type Segment } from "../../geometry.js";
import { CAPTURE_POINTS_MATCH_RULES } from "../../match-rules.js";
import { distance, vec2, type Vec2 } from "../../vec2.js";
import type * as Pathing from "../../pathing.js";
import type { Behaviour } from "../behaviour.js";
import { MatchSimulation, type ParticipantSpec } from "../simulation.js";
import { body, BOUNDS, DT, fighter, RULESET, WARRIOR } from "./rules/test-support.js";

/** Every route the simulation plans, counted. */
const FINDS = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../pathing.js", async (importOriginal) => {
  const original = await importOriginal<typeof Pathing>();
  return {
    ...original,
    createLayeredPathFinder: (
      ...args: Parameters<typeof Pathing.createLayeredPathFinder>
    ): Pathing.LayeredPathFinder => {
      const paths = original.createLayeredPathFinder(...args);
      return {
        nodeCount: paths.nodeCount,
        find: (...query) => {
          FINDS.count += 1;
          return paths.find(...query);
        },
      };
    },
  };
});

/**
 * A follower a body holds up goes another way (#3702): it sidesteps,
 * then plans round the body, then gives its goal up. Pets heeling to
 * owners at the far ends of a corridor walk into each other head-on.
 */

/** Walks to its owner once farther than a body or two from it. */
const HEEL: Behaviour = {
  kind: "follow-and-attack",
  drawnTo: undefined,
  engage: "owner-target",
  skillIds: [],
  aggroUnits: 0,
  leashUnits: 60,
  heelUnits: 40,
};

/** Team 0's pet `id`, owned by `ownerId`, at `spawn`. */
function pet(id: string, ownerId: string, spawn: Vec2): ParticipantSpec {
  return body(id, 0, spawn, {
    behaviour: HEEL,
    creature: {
      ownerId,
      kind: "pet",
      look: "beast",
      name: id,
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: undefined,
      aura: undefined,
      onDeath: "lie",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      pulse: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      bondStatusId: undefined,
      mode: "guard",
    },
  });
}

/** A rectangle's four sides: a wall is a closed outline. */
function rect(x: number, y: number, width: number, height: number): Segment[] {
  const a = vec2(x, y);
  const b = vec2(x + width, y);
  const c = vec2(x + width, y + height);
  const d = vec2(x, y + height);
  return [segment(a, b), segment(b, c), segment(c, d), segment(d, a)];
}

/** The only way across: a corridor `width` wide along y = 300, from x = `west` to `east`. */
function corridor(width: number, west = 250, east = 750): Segment[] {
  const top = 300 - width / 2;
  const bottom = 300 + width / 2;
  return [
    ...rect(west, 0, east - west, top),
    ...rect(west, bottom, east - west, BOUNDS.height - bottom),
  ];
}

/** Pet "a" heels east to owner "oa", pet "b" west to owner "ob", through `walls`; `flip` mirrors it. */
function headOn(walls: readonly Segment[], flip = false): MatchSimulation {
  const x = (at: number) => (flip ? 1000 - at : at);
  return new MatchSimulation({
    seed: "jam",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls,
    participants: [
      body("oa", 0, vec2(x(900), 300)),
      body("ob", 0, vec2(x(100), 300)),
      pet("a", "oa", vec2(x(300), 300)),
      pet("b", "ob", vec2(x(700), 300)),
    ],
  });
}

/** Seconds until every pet in `pets` is within 70 of its owner, or `Infinity` past `seconds`. */
function arrival(sim: MatchSimulation, pets: Record<string, string>, seconds: number): number {
  for (let t = 0; t < seconds; t += DT) {
    const home = Object.entries(pets).every(([id, ownerId]) => {
      const self = sim.get(id);
      const owner = sim.get(ownerId);
      return (
        self !== undefined && owner !== undefined && distance(self.position, owner.position) <= 70
      );
    });
    if (home) {
      return t;
    }
    sim.step(DT);
  }
  return Number.POSITIVE_INFINITY;
}

describe("a follower a body holds up (#3702)", () => {
  it("passes another head-on in a corridor three bodies wide within 3 s", () => {
    const sim = headOn(corridor(84));
    expect(arrival(sim, { a: "oa", b: "ob" }, 3 + 2)).toBeLessThan(5);
  });

  it("backs out of a corridor one body wide for the other, mirrored on a mirrored map", () => {
    const first = (flip: boolean) => {
      const sim = headOn(corridor(32, 440, 560), flip);
      return arrival(sim, { a: "oa", b: "ob" }, 6 + 1);
    };
    const plain = first(false);
    expect(plain).toBeLessThan(6);
    expect(first(true)).toBe(plain);
  });

  it("put back mid-yield, walks on from where it is put, holding for nothing", () => {
    const sim = headOn(corridor(32, 440, 560));
    const at = (id: string) => sim.get(id)?.position ?? vec2(0, 0);
    /** How far each of `ids` moves in one step. */
    const moved = (ids: readonly string[]) => {
      const before = ids.map(at);
      sim.step(DT);
      return ids.map((id, index) => distance(before[index] ?? vec2(0, 0), at(id)));
    };
    // The pet that yields stands a quarter second on end while the other
    // walks past: pressed together, both stand.
    const still = { a: 0, b: 0 };
    let yielder: "a" | "b" | undefined;
    for (let t = 0; t < 4 && yielder === undefined; t += DT) {
      const [a, b] = moved(["a", "b"]);
      still.a = a === 0 && b !== 0 ? still.a + DT : 0;
      still.b = b === 0 && a !== 0 ? still.b + DT : 0;
      yielder = still.a >= 0.25 ? "a" : still.b >= 0.25 ? "b" : undefined;
    }
    if (yielder === undefined) throw new Error("no pet yielded");
    sim.resetParticipant(yielder);
    let walked = 0;
    for (let t = 0; t < 0.3; t += DT) walked += moved([yielder])[0] ?? 0;
    expect(walked).toBeGreaterThan(10);
  });

  it("plans round a body standing in a narrow gap, through a wider one, and arrives", () => {
    // A wall across the field with a gap one body wide, a still body in
    // it, and a wide gap 200 lower.
    const walls = [
      ...rect(495, 0, 10, 284),
      ...rect(495, 316, 10, 144),
      ...rect(495, 540, 10, BOUNDS.height - 540),
    ];
    const sim = new MatchSimulation({
      seed: "jam",
      ruleset: RULESET,
      bounds: BOUNDS,
      walls,
      participants: [
        body("oa", 0, vec2(800, 300)),
        body("plug", 0, vec2(500, 300)),
        pet("a", "oa", vec2(300, 300)),
      ],
    });
    expect(arrival(sim, { a: "oa" }, 8)).toBeLessThan(8);
    expect(sim.get("plug")?.position).toEqual(vec2(500, 300));
  });

  it("does nothing about a body that walks off its way in time: its route is kept", () => {
    const sim = new MatchSimulation({
      seed: "jam",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants: [
        body("oa", 0, vec2(800, 300)),
        body("off", 0, vec2(330, 300), {
          behaviour: { kind: "patrol", waypoints: [vec2(330, 100)], loop: false },
        }),
        pet("a", "oa", vec2(300, 300)),
      ],
    });
    FINDS.count = 0;
    expect(arrival(sim, { a: "oa" }, 6)).toBeLessThan(6);
    // Planned once, and never a sidestep: it kept to its line.
    expect(FINDS.count).toBeLessThanOrEqual(1);
  });

  describe("a bot on its way to a shrine", () => {
    const foe = () => body("foe", 1, vec2(1500, 700));

    it("holding a shrine it stands on, pressed by a body, is never jammed off it", () => {
      const sim = new MatchSimulation({
        seed: "jam",
        ruleset: RULESET,
        bounds: BOUNDS,
        matchRules: CAPTURE_POINTS_MATCH_RULES,
        capturePoints: [{ ...vec2(400, 300), layer: 0 }],
        participants: [
          fighter("bot", 0, WARRIOR, vec2(400, 300)),
          body("press", 0, vec2(425, 300)),
          foe(),
        ],
      });
      for (let t = 0; t < 6; t += DT) sim.step(DT);
      expect(distance(sim.get("bot")?.position ?? vec2(0, 0), vec2(400, 300))).toBeLessThan(30);
    });

    it("boxed in on the way for 3 s, gives that shrine up for the other", () => {
      // Shrine A in a box whose one door a still pet plugs (a pet is no
      // teammate a shrine is left to); shrine B in the open, farther.
      const box = [
        ...rect(600, 50, 400, 10),
        ...rect(990, 50, 10, 500),
        ...rect(600, 540, 400, 10),
        ...rect(600, 50, 10, 230),
        ...rect(600, 320, 10, 230),
      ];
      const sim = new MatchSimulation({
        seed: "jam",
        ruleset: RULESET,
        bounds: BOUNDS,
        walls: box,
        matchRules: CAPTURE_POINTS_MATCH_RULES,
        capturePoints: [
          { ...vec2(800, 300), layer: 0 },
          { ...vec2(100, 650), layer: 0 },
        ],
        participants: [
          fighter("bot", 0, WARRIOR, vec2(450, 300)),
          { ...pet("plug", "nobody", vec2(605, 300)), behaviour: { kind: "idle" } },
          foe(),
        ],
      });
      for (let t = 0; t < 12; t += DT) sim.step(DT);
      expect(distance(sim.get("bot")?.position ?? vec2(0, 0), vec2(100, 650))).toBeLessThan(150);
    });
  });
});
