import { SPAWN_BUBBLE_RADIUS } from "@vibewars/game-core";
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
    expect(spawnBubbleContact(centre, centre)).toBeUndefined();
    expect(spawnBubbleContact(centre, { x: centre.x + SPAWN_BUBBLE_RADIUS - 2, y: 50 })).toBe(
      undefined,
    );
    expect(spawnBubbleContact(centre, { x: centre.x, y: centre.y + SPAWN_BUBBLE_RADIUS })).toBe(
      Math.PI / 2,
    );
  });

  it("draws the curtain at the edge bright on your side, faint behind you", () => {
    const body = { x: centre.x + SPAWN_BUBBLE_RADIUS, y: centre.y };
    const commands = spawnBubbleCommands(centre, body, 0, undefined, false, 1, 1);
    expect(brightest(commands)).toBeCloseTo(SPAWN_BUBBLE_EDGE_ALPHA, 1);
    const behind = commands.filter(
      (command) => command.kind === "quad" && command.points[0].x < centre.x - 60,
    );
    expect(behind.length).toBeGreaterThan(0);
    expect(brightest(behind)).toBeCloseTo(SPAWN_BUBBLE_REST_ALPHA);
    // At rest it is faint all round.
    expect(brightest(spawnBubbleCommands(centre, centre, 0, undefined, false, 1, 1))).toBe(
      SPAWN_BUBBLE_REST_ALPHA,
    );
  });

  it("keeps its rim at least 2 CSS px wide when zoomed out", () => {
    const rims = spawnBubbleCommands(centre, centre, 0, undefined, false, 1, 2.5).filter(
      (command) => command.kind === "ring",
    );
    expect(rims.map((rim) => rim.width)).toEqual([10, 5]);
  });

  it("ripples where it was bumped, briefly, and not under reduced motion", () => {
    const rings = (seconds: number, reducedMotion: boolean): number =>
      spawnBubbleCommands(centre, centre, 0, { angle: 0, seconds }, reducedMotion, 1, 1).filter(
        (command) => command.kind === "ring",
      ).length;
    expect(rings(0.1, false)).toBe(3);
    expect(rings(SPAWN_BUBBLE_RIPPLE_SECONDS, false)).toBe(2);
    expect(rings(0.1, true)).toBe(2);
  });

  it("shimmers by the clock, and stands still under reduced motion", () => {
    const at = (seconds: number, reducedMotion: boolean): readonly SpawnBubbleCommand[] =>
      spawnBubbleCommands(centre, centre, seconds, undefined, reducedMotion, 1, 1);
    expect(at(0.7, false)).not.toEqual(at(0, false));
    expect(at(0.7, true)).toEqual(at(0, true));
  });

  it("fades out at the start, then is gone", () => {
    expect(spawnBubbleFade(undefined)).toBe(1);
    expect(spawnBubbleFade(SPAWN_BUBBLE_FADE_SECONDS / 2)).toBeCloseTo(0.5);
    expect(spawnBubbleFade(SPAWN_BUBBLE_FADE_SECONDS)).toBe(0);
    expect(spawnBubbleCommands(centre, centre, 0, undefined, false, 0, 1)).toEqual([]);
  });
});
