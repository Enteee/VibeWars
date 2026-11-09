import { describe, expect, it } from "vitest";

import {
  actorAtPoint,
  EMPTY_SNAPSHOT,
  type MapStructure,
  type RenderableActor,
} from "./arena-snapshot.js";
import {
  altHeld,
  occludersOf,
  pickSurface,
  RING_PATH,
  traceHiddenOutline,
} from "./layer-surfaces.js";
import { ELEVATION_STEP } from "./render-order.js";

const bridge = { kind: "rect", x: 100, y: 100, width: 200, height: 100 } as const;
const BRIDGE: MapStructure = {
  layerCount: 2,
  decks: [{ layer: 1, footprint: bridge }],
  transitions: [],
};

function hiddenSegments(y: number, layer: number): { x: number; y: number }[] {
  const seen: { x: number; y: number }[] = [];
  traceHiddenOutline(RING_PATH, 200, y, 10, layer, occludersOf([], BRIDGE), (ax, ay, bx, by) => {
    seen.push({ x: (ax + bx) / 2, y: (ay + by) / 2 });
  });
  return seen;
}

describe("the surface a click names (#2831)", () => {
  // The deck draws ELEVATION_STEP above its footprint.
  const onDeck = { x: 200, y: 150 - ELEVATION_STEP };

  it("is the deck where one is drawn, at the point on it", () => {
    expect(pickSurface(BRIDGE, onDeck, false)).toEqual({ layer: 1, point: { x: 200, y: 150 } });
  });

  it("is the ground under it with Alt", () => {
    expect(pickSurface(BRIDGE, onDeck, true)).toEqual({ layer: 0, point: onDeck });
  });

  it("acts as a plain click where there is nothing below", () => {
    const open = { x: 10, y: 10 };
    expect(pickSurface(BRIDGE, open, true)).toEqual({ layer: 0, point: open });
  });
});

describe("Alt on the pointer (#2831)", () => {
  it("is not held before the pointer's first event", () => {
    expect(altHeld({})).toBe(false);
  });

  it("follows the pointer's last event", () => {
    expect(altHeld({ event: { altKey: true } })).toBe(true);
    expect(altHeld({ event: { altKey: false } })).toBe(false);
  });
});

describe("the hidden part of a body (#2831)", () => {
  it("is all of a body well under the deck", () => {
    expect(hiddenSegments(150, 0)).toHaveLength(48);
  });

  it("is only the part under the deck's edge", () => {
    // The deck's face and side reach down to y 200.
    const seen = hiddenSegments(200, 0);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(48);
    expect(seen.every((point) => point.y <= 200)).toBe(true);
  });

  it("is nothing for a body clear of it, or standing on it", () => {
    expect(hiddenSegments(400, 0)).toEqual([]);
    expect(hiddenSegments(150, 1)).toEqual([]);
  });

  it("is nothing on a map of one layer", () => {
    expect(occludersOf([], { layerCount: 1, decks: [], transitions: [] })).toEqual([]);
  });
});

describe("clicking a character on a layered map (#2831)", () => {
  const actor = (id: string, y: number, layer: number): RenderableActor => ({
    name: id,
    guildTag: undefined,
    heroRank: 0,
    signet: undefined,
    cape: undefined,
    bot: false,
    facing: 0,
    weaponId: undefined,
    swingElapsed: 0,
    swingTotal: 0,
    attackCast: undefined,
    offhandId: undefined,
    profession: undefined,
    creatureLook: undefined,
    team: "enemy",
    health: 500,
    maxHealth: 500,
    exploited: false,
    knockedDown: false,
    castProgress: undefined,
    castType: undefined,
    statuses: [],
    enchanted: false,
    hexed: false,
    invulnerable: false,
    conditionCues: [],
    id,
    layer,
    dead: false,
    radius: 10,
    position: { x: 200, y },
  });

  it("finds a body on a deck where it is drawn", () => {
    const arena = { ...EMPTY_SNAPSHOT, structure: BRIDGE, actors: [actor("up", 150, 1)] };
    expect(actorAtPoint(arena, { x: 200, y: 150 - ELEVATION_STEP })?.id).toBe("up");
    expect(actorAtPoint(arena, { x: 200, y: 150 })).toBeUndefined();
  });

  it("finds a body under a deck through its outline", () => {
    const arena = { ...EMPTY_SNAPSHOT, structure: BRIDGE, actors: [actor("under", 150, 0)] };
    expect(actorAtPoint(arena, { x: 205, y: 150 })?.id).toBe("under");
  });
});
