import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_COMPASS, RANGE_SPELL, vec2 } from "@vibewars/game-core";
import { PING_SECONDS } from "@vibewars/game-session";

import {
  ACTOR_RADIUS,
  EMPTY_SNAPSHOT,
  type ArenaSnapshot,
  type RenderableActor,
} from "../render/arena-snapshot.js";
import { compassReach, compassView } from "./compass.js";

function actor(
  id: string,
  x: number,
  y: number,
  overrides: Partial<RenderableActor> = {},
): RenderableActor {
  return {
    id,
    name: id,
    guildTag: undefined,
    cape: undefined,
    bot: false,
    position: vec2(x, y),
    facing: 0,
    weaponId: undefined,
    swingElapsed: 0,
    swingTotal: 0,
    attackCast: undefined,
    offhandId: undefined,
    profession: undefined,
    creatureLook: undefined,
    radius: ACTOR_RADIUS,
    team: "ally",
    health: 500,
    maxHealth: 500,
    dead: false,
    exploited: false,
    knockedDown: false,
    castProgress: undefined,
    castType: undefined,
    statuses: [],
    enchanted: false,
    hexed: false,
    invulnerable: false,
    conditionCues: [],
    ...overrides,
  };
}

/** You at (1000, 1000); a 160 px compass is 80 px to its edge, 1700 units. */
const SIZE = 160;
const me = actor("me", 1000, 1000, { team: "self" });
const arena = (more: Partial<ArenaSnapshot>): ArenaSnapshot => ({
  ...EMPTY_SNAPSHOT,
  ...more,
  actors: [me, ...(more.actors ?? [])],
});

describe("compassView (#1056)", () => {
  it("puts you at the centre, a body 850 east at half radius on +x, north on -y", () => {
    const view = compassView(
      arena({
        actors: [actor("east", 1850, 1000, { team: "enemy" }), actor("north", 1000, 150)],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.dots).toEqual([
      { id: "me", x: 0, y: 0, kind: "self", targeted: false, called: false, small: false },
      { id: "east", x: 40, y: 0, kind: "foe", targeted: false, called: false, small: false },
      { id: "north", x: 0, y: -40, kind: "friend", targeted: false, called: false, small: false },
    ]);
  });

  it("leaves out bodies beyond its range and corpses, but keeps you dead", () => {
    const dots = (actors: RenderableActor[], self = me) =>
      compassView(
        { ...EMPTY_SNAPSHOT, actors: [self, ...actors] },
        "me",
        SIZE,
        RANGE_COMPASS,
      )?.dots.map((dot) => dot.id);
    expect(dots([actor("edge", 2700, 1000), actor("beyond", 2701, 1000)])).toEqual(["me", "edge"]);
    expect(dots([actor("corpse", 1100, 1000, { dead: true })])).toEqual(["me"]);
    expect(dots([], { ...me, dead: true })).toEqual(["me"]);
  });

  it("marks your target and the called foe", () => {
    const view = compassView(
      arena({
        actors: [actor("a", 1100, 1000, { team: "enemy" }), actor("b", 1200, 1000)],
        targetId: "b",
        calledId: "a",
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.dots.find((dot) => dot.id === "a")).toMatchObject({
      called: true,
      targeted: false,
    });
    expect(view?.dots.find((dot) => dot.id === "b")).toMatchObject({
      called: false,
      targeted: true,
    });
  });

  it("draws a creature's dot small, a player's not (#1052)", () => {
    const view = compassView(
      arena({
        actors: [
          actor("wolf", 1100, 1000, { team: "enemy", creatureLook: "beast", radius: 10 }),
          // NPCs are drawn bigger than a pet, and are still creatures (#2047).
          actor("priest", 1150, 1000, { team: "enemy", creatureLook: "priest", radius: 12 }),
          actor("horror", 1150, 1050, { team: "enemy", creatureLook: "bone-horror", radius: 11.5 }),
          actor("warrior", 1200, 1000, { team: "enemy" }),
        ],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.dots.map((dot) => [dot.id, dot.small])).toEqual([
      ["me", false],
      ["wolf", true],
      ["priest", true],
      ["horror", true],
      ["warrior", false],
    ]);
  });

  it("rings earshot and cast range at their own distances", () => {
    const view = compassView(arena({}), "me", SIZE, RANGE_COMPASS);
    const scale = SIZE / 2 / 1700;
    expect(view?.scale).toBe(scale);
    expect(view?.rings).toEqual([
      { radius: AREA_EARSHOT * scale, kind: "earshot" },
      { radius: RANGE_SPELL * scale, kind: "cast" },
    ]);
  });

  it("shows pings in range with their age", () => {
    const view = compassView(
      arena({
        pings: [
          { id: 1, position: vec2(1000, 1850), remaining: PING_SECONDS / 2 },
          { id: 2, position: vec2(3000, 1000), remaining: PING_SECONDS },
        ],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.pings).toEqual([{ x: 0, y: 40, age: 0.5 }]);
  });

  it("marks the shrines in range by side, clipping those beyond as pings (#1199)", () => {
    const view = compassView(
      arena({
        shrines: [
          { position: vec2(1000, 1850), side: "ally" },
          { position: vec2(1850, 1000), side: "enemy" },
          { position: vec2(3000, 1000), side: "enemy" },
        ],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.shrines).toEqual([
      { x: 0, y: 40, side: "ally" },
      { x: 40, y: 0, side: "enemy" },
    ]);
  });

  it("marks a Guild Battle's lords, flags, a carried one on its carrier, and the stand (#1226)", () => {
    const view = compassView(
      arena({
        actors: [
          actor("guild-lord/0", 1000, 1850, { creatureLook: "guild-lord" }),
          actor("guild-lord/1", 1850, 1000, { creatureLook: "guild-lord", team: "enemy" }),
          actor("far-lord", 3000, 1000, { creatureLook: "guild-lord", team: "enemy" }),
          actor("carrier", 150, 1000, { team: "enemy" }),
        ],
        flags: [
          { id: "flag/0", side: "ally", position: vec2(150, 1000), carried: true, onStand: false },
          {
            id: "flag/1",
            side: "enemy",
            position: vec2(3000, 1000),
            carried: false,
            onStand: false,
          },
        ],
        stand: { id: "flag-stand", position: vec2(1000, 150), holder: "enemy" },
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.lords).toEqual([
      { x: 0, y: 40, side: "ally" },
      { x: 40, y: 0, side: "enemy" },
    ]);
    expect(view?.flags).toEqual([{ x: -40, y: 0, side: "ally" }]);
    expect(view?.stand).toEqual({ x: 0, y: -40, holder: "enemy" });
  });

  it("marks no stand held by nobody in a side's colour, and none on another map (#1226)", () => {
    const stand = { id: "flag-stand", position: vec2(1000, 150), holder: undefined };
    expect(compassView(arena({ stand }), "me", SIZE, RANGE_COMPASS)?.stand).toEqual({
      x: 0,
      y: -40,
      holder: undefined,
    });
    const bare = compassView(arena({}), "me", SIZE, RANGE_COMPASS);
    expect([bare?.stand, bare?.flags, bare?.lords]).toEqual([undefined, [], []]);
  });

  it("marks a Relic Run's altar in reach, none out of reach or on another map (#1388)", () => {
    const near = compassView(arena({ altar: vec2(1850, 1000) }), "me", SIZE, RANGE_COMPASS);
    expect(near?.altar).toEqual({ x: 40, y: 0 });
    // Out of reach: not pinned to the rim.
    const far = compassView(arena({ altar: vec2(3000, 1000) }), "me", SIZE, RANGE_COMPASS);
    expect(far?.altar).toBeUndefined();
    expect(compassView(arena({}), "me", SIZE, RANGE_COMPASS)?.altar).toBeUndefined();
  });

  it("marks Capture Points' shrines in reach by owner, none out of reach or on another map (#1407)", () => {
    const view = compassView(
      arena({
        capturePoints: [
          { position: vec2(1000, 1850), owner: "ally", ring: undefined },
          { position: vec2(1850, 1000), owner: "enemy", ring: undefined },
          { position: vec2(1000, 150), owner: undefined, ring: { side: "ally", fraction: 0.5 } },
          // Out of reach: not pinned to the rim.
          { position: vec2(3000, 1000), owner: "enemy", ring: undefined },
        ],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    expect(view?.capturePoints).toEqual([
      { x: 0, y: 40, owner: "ally" },
      { x: 40, y: 0, owner: "enemy" },
      { x: 0, y: -40, owner: undefined },
    ]);
    expect(compassView(arena({}), "me", SIZE, RANGE_COMPASS)?.capturePoints).toEqual([]);
  });

  it("clips a wall crossing the disc's edge, keeps one inside whole, skips one outside", () => {
    const view = compassView(
      arena({
        walls: [
          // From 850 east to 2550 east: its inner half is on the compass.
          { kind: "rect", x: 1850, y: 990, width: 1700, height: 20 },
          // A small square just north-west of you.
          { kind: "polygon", points: [vec2(900, 900), vec2(950, 900), vec2(950, 950)] },
          { kind: "rect", x: 5000, y: 5000, width: 100, height: 100 },
        ],
      }),
      "me",
      SIZE,
      RANGE_COMPASS,
    );
    const walls = view?.walls ?? [];
    expect(walls).toHaveLength(2);
    const crossing = walls[0] ?? [];
    for (const point of crossing) {
      expect(Math.hypot(point.x, point.y)).toBeLessThanOrEqual(SIZE / 2 + 1e-9);
    }
    expect(Math.min(...crossing.map((point) => point.x))).toBeCloseTo(40);
    expect(Math.max(...crossing.map((point) => point.x))).toBeCloseTo(
      Math.sqrt(80 ** 2 - 0.47 ** 2),
      1,
    );
    // The triangle inside: one closed line, back to its first corner.
    expect(walls[1]).toHaveLength(4);
    expect(walls[1]?.[0]).toEqual(walls[1]?.[3]);
  });

  it("is nothing without a self actor: a spectator has no compass", () => {
    expect(compassView(arena({}), "spectator", SIZE, RANGE_COMPASS)).toBeUndefined();
  });
});

describe("compassReach (#1080)", () => {
  it("is the arena's longer side, never past RANGE_COMPASS", () => {
    expect(compassReach({ width: 960, height: 640 })).toBe(960);
    expect(compassReach({ width: 2000, height: 2000 })).toBe(RANGE_COMPASS);
    expect(compassReach({ width: 3200, height: 1100 })).toBe(RANGE_COMPASS);
  });

  it("fills the disc on a small arena: a body 900 away is near the edge, one 1000 away is off", () => {
    const view = compassView(
      arena({ actors: [actor("near", 1900, 1000), actor("far", 1000, 2000)] }),
      "me",
      SIZE,
      960,
    );
    const scale = SIZE / 2 / 960;
    expect(view?.scale).toBe(scale);
    expect(view?.dots.map((dot) => [dot.id, dot.x, dot.y])).toEqual([
      ["me", 0, 0],
      ["near", 900 * scale, 0],
    ]);
    expect(view?.rings[0]).toEqual({ radius: AREA_EARSHOT * scale, kind: "earshot" });
  });
});
