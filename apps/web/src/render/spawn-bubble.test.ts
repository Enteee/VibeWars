import { SPAWN_BUBBLE_RADIUS, teamBubble, teamBubbleDepth } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";
import {
  SPAWN_BUBBLE_EDGE_ALPHA,
  SPAWN_BUBBLE_FADE_SECONDS,
  SPAWN_BUBBLE_NEAR,
  SPAWN_BUBBLE_REST_ALPHA,
  SPAWN_BUBBLE_RIPPLE_SECONDS,
  spawnBubbleAlpha,
  spawnBubbleArc,
  spawnBubbleCommands,
  spawnBubbleContact,
  spawnBubbleFade,
  type SpawnBubbleCommand,
} from "./spawn-bubble.js";

const centre = { x: 100, y: 50 };
/** A team of one: the circle round its spawn. */
const lone = teamBubble([centre]);

/** The brightest piece of curtain among `commands`. */
function brightest(commands: readonly SpawnBubbleCommand[]): number {
  return Math.max(
    ...commands.flatMap((command) => (command.kind === "quad" ? [command.alpha] : [])),
  );
}

describe("the spawn bubble (#3909)", () => {
  it("is faint far from its edge, bright at it, and in between on the way", () => {
    expect(spawnBubbleAlpha(SPAWN_BUBBLE_RADIUS)).toBe(SPAWN_BUBBLE_REST_ALPHA);
    expect(spawnBubbleAlpha(SPAWN_BUBBLE_NEAR)).toBe(0.15);
    expect(spawnBubbleAlpha(0)).toBe(0.6);
    expect(spawnBubbleAlpha(SPAWN_BUBBLE_NEAR / 2)).toBeCloseTo(0.375);
  });

  it("brightens only the arc you walk up to", () => {
    expect(spawnBubbleArc(0)).toBe(1);
    expect(spawnBubbleArc(Math.PI / 4)).toBeCloseTo(0.5);
    expect(spawnBubbleArc(-Math.PI / 4)).toBeCloseTo(0.5);
    expect(spawnBubbleArc(Math.PI / 2)).toBe(0);
    expect(spawnBubbleArc(Math.PI)).toBe(0);
    expect(spawnBubbleArc(2 * Math.PI)).toBe(1);
  });

  it("is touched within a unit of its edge, at the side you are on", () => {
    expect(spawnBubbleContact(lone, centre)).toBeUndefined();
    expect(spawnBubbleContact(lone, { x: centre.x + SPAWN_BUBBLE_RADIUS - 2, y: 50 })).toBe(
      undefined,
    );
    const at = spawnBubbleContact(lone, { x: centre.x, y: centre.y + SPAWN_BUBBLE_RADIUS - 0.5 });
    expect(at?.x).toBeCloseTo(centre.x);
    expect(at?.y).toBeCloseTo(centre.y + SPAWN_BUBBLE_RADIUS);
  });

  it("draws the curtain at the edge bright on your side, faint behind you", () => {
    const body = { x: centre.x + SPAWN_BUBBLE_RADIUS, y: centre.y };
    const commands = spawnBubbleCommands(lone, body, 0, undefined, false, 1, 1);
    expect(brightest(commands)).toBeCloseTo(SPAWN_BUBBLE_EDGE_ALPHA, 1);
    const behind = commands.filter(
      (command) => command.kind === "quad" && command.points[0].x < centre.x - 60,
    );
    expect(behind.length).toBeGreaterThan(0);
    expect(brightest(behind)).toBeCloseTo(SPAWN_BUBBLE_REST_ALPHA);
    // At rest it is faint all round.
    expect(brightest(spawnBubbleCommands(lone, centre, 0, undefined, false, 1, 1))).toBe(
      SPAWN_BUBBLE_REST_ALPHA,
    );
  });

  it("keeps its rim at least 2 CSS px wide when zoomed out", () => {
    const rims = spawnBubbleCommands(lone, centre, 0, undefined, false, 1, 2.5).filter(
      (command) => command.kind === "rim",
    );
    expect(rims.map((rim) => rim.width)).toEqual([10, 5]);
  });

  it("ripples where it was bumped, briefly, and not under reduced motion", () => {
    const rings = (seconds: number, reducedMotion: boolean): number =>
      spawnBubbleCommands(lone, centre, 0, { at: centre, seconds }, reducedMotion, 1, 1).filter(
        (command) => command.kind === "ring",
      ).length;
    expect(rings(0.1, false)).toBe(1);
    expect(rings(SPAWN_BUBBLE_RIPPLE_SECONDS, false)).toBe(0);
    expect(rings(0.1, true)).toBe(0);
  });

  it("shimmers by the clock, and stands still under reduced motion", () => {
    const at = (seconds: number, reducedMotion: boolean): readonly SpawnBubbleCommand[] =>
      spawnBubbleCommands(lone, centre, seconds, undefined, reducedMotion, 1, 1);
    expect(at(0.7, false)).not.toEqual(at(0, false));
    expect(at(0.7, true)).toEqual(at(0, true));
  });

  it("fades out at the start, then is gone", () => {
    expect(spawnBubbleFade(undefined)).toBe(1);
    expect(spawnBubbleFade(SPAWN_BUBBLE_FADE_SECONDS / 2)).toBeCloseTo(0.5);
    expect(spawnBubbleFade(SPAWN_BUBBLE_FADE_SECONDS)).toBe(0);
    expect(spawnBubbleCommands(lone, centre, 0, undefined, false, 0, 1)).toEqual([]);
  });

  it("spans a team of two as one capsule, its rim the hull grown by the margin (#3930)", () => {
    const team = teamBubble([centre, { x: centre.x + 300, y: centre.y }]);
    const rim = spawnBubbleCommands(team, undefined, 0, undefined, false, 1, 1).find(
      (command) => command.kind === "rim",
    );
    expect(rim?.kind).toBe("rim");
    const points = rim?.kind === "rim" ? rim.points : [];
    expect(points.length).toBeGreaterThan(48);
    for (const point of points) {
      expect(teamBubbleDepth(point, team)).toBeCloseTo(0, 6);
    }
    // Both spawns' sides and the straight run between them.
    expect(Math.min(...points.map(({ x }) => x))).toBeCloseTo(centre.x - SPAWN_BUBBLE_RADIUS);
    expect(Math.max(...points.map(({ x }) => x))).toBeCloseTo(centre.x + 300 + SPAWN_BUBBLE_RADIUS);
    expect(
      points.some(({ x, y }) => x > centre.x + 140 && x < centre.x + 160 && y < centre.y),
    ).toBe(true);
  });

  it("brightens the stretch of a long side you walk up to, not its far end (#3930)", () => {
    const team = teamBubble([centre, { x: centre.x + 300, y: centre.y }]);
    const body = { x: centre.x + 150, y: centre.y + SPAWN_BUBBLE_RADIUS };
    const quads = spawnBubbleCommands(team, body, 0, undefined, false, 1, 1);
    const near = quads.filter(
      (command) =>
        command.kind === "quad" &&
        Math.abs(command.points[0].x - body.x) < 15 &&
        command.points[0].y > centre.y,
    );
    expect(brightest(near)).toBeCloseTo(SPAWN_BUBBLE_EDGE_ALPHA, 1);
    const far = quads.filter(
      (command) => command.kind === "quad" && command.points[0].x < centre.x - 40,
    );
    expect(brightest(far)).toBeCloseTo(SPAWN_BUBBLE_REST_ALPHA);
  });
});
