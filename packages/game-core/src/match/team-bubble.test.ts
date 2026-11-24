import { describe, expect, it } from "vitest";
import { SPAWN_BUBBLE_RADIUS } from "../distances.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import {
  clampToTeamBubble,
  nearestOnHull,
  teamBubble,
  teamBubbleDepth,
  teamBubbleOutline,
} from "./team-bubble.js";

const R = SPAWN_BUBBLE_RADIUS;
const EPSILON = 1e-9;

/** Eight spawns spread like a team's on a big map, one inside the others. */
const EIGHT = [
  vec2(0, 0),
  vec2(160, -40),
  vec2(320, 10),
  vec2(400, 200),
  vec2(250, 380),
  vec2(60, 300),
  vec2(-80, 150),
  vec2(150, 150),
];

/** Points round `centre` out to `reach`, on rings and spokes. */
function around(centre: Vec2, reach: number): Vec2[] {
  const out: Vec2[] = [];
  for (let ring = 0; ring <= 8; ring += 1) {
    for (let spoke = 0; spoke < 24; spoke += 1) {
      const angle = (2 * Math.PI * spoke) / 24;
      const at = (reach * ring) / 8;
      out.push(vec2(centre.x + at * Math.cos(angle), centre.y + at * Math.sin(angle)));
    }
  }
  return out;
}

describe("the team bubble (#3930)", () => {
  it("is the circle round a lone spawn", () => {
    const bubble = teamBubble([vec2(10, 20)]);
    expect(bubble.hull).toEqual([vec2(10, 20)]);
    expect(clampToTeamBubble(vec2(10 + 2 * R, 20), bubble)).toEqual(vec2(10 + R, 20));
    expect(teamBubbleOutline(bubble, 48)).toHaveLength(48);
  });

  it("is a capsule round two spawns: the straight line between them is inside", () => {
    const bubble = teamBubble([vec2(300, 0), vec2(0, 0)]);
    expect(bubble.hull).toEqual([vec2(0, 0), vec2(300, 0)]);
    for (let x = 0; x <= 300; x += 10) {
      expect(teamBubbleDepth(vec2(x, 0), bubble)).toBeCloseTo(R);
      expect(teamBubbleDepth(vec2(x, R), bubble)).toBeCloseTo(0);
    }
    expect(clampToTeamBubble(vec2(150, 200), bubble)).toEqual(vec2(150, R));
  });

  it("is a rounded triangle round three, its inside unclamped", () => {
    const bubble = teamBubble([vec2(0, 0), vec2(200, 0), vec2(100, 150)]);
    expect(bubble.hull).toHaveLength(3);
    const inside = vec2(100, 50);
    expect(clampToTeamBubble(inside, bubble)).toBe(inside);
    expect(nearestOnHull(inside, bubble)).toBe(inside);
  });

  it("holds all eight spawns' circles, and every line between two spawns", () => {
    const bubble = teamBubble(EIGHT);
    // The one inside the others is no corner.
    expect(bubble.hull).not.toContainEqual(vec2(150, 150));
    for (const spawn of EIGHT) {
      for (const point of around(spawn, R - EPSILON)) {
        expect(clampToTeamBubble(point, bubble)).toBe(point);
      }
      for (const other of EIGHT) {
        for (let step = 0; step <= 10; step += 1) {
          const point = vec2(
            spawn.x + ((other.x - spawn.x) * step) / 10,
            spawn.y + ((other.y - spawn.y) * step) / 10,
          );
          expect(teamBubbleDepth(point, bubble)).toBeGreaterThanOrEqual(R - EPSILON);
        }
      }
    }
  });

  it("clamps a point outside onto its edge, and the outline runs along that edge", () => {
    const bubble = teamBubble(EIGHT);
    for (const point of around(vec2(160, 160), 900)) {
      const held = clampToTeamBubble(point, bubble);
      expect(teamBubbleDepth(held, bubble)).toBeGreaterThanOrEqual(-EPSILON);
      if (held !== point) {
        expect(teamBubbleDepth(held, bubble)).toBeCloseTo(0, 9);
      }
    }
    for (const point of teamBubbleOutline(bubble, 48)) {
      expect(teamBubbleDepth(point, bubble)).toBeCloseTo(0, 9);
    }
  });

  it("drops duplicate and collinear spawns to a point or a segment", () => {
    expect(teamBubble([vec2(5, 5), vec2(5, 5), vec2(5, 5)]).hull).toEqual([vec2(5, 5)]);
    const line = teamBubble([vec2(0, 0), vec2(100, 100), vec2(50, 50), vec2(100, 100)]);
    expect(line.hull).toEqual([vec2(0, 0), vec2(100, 100)]);
    expect(teamBubbleDepth(vec2(50, 50), line)).toBeCloseTo(R);
    const outline = teamBubbleOutline(line, 48);
    expect(outline.length).toBeGreaterThanOrEqual(48);
    for (const point of outline) {
      expect(teamBubbleDepth(point, line)).toBeCloseTo(0, 9);
    }
  });

  it("is the same whatever order the spawns come in", () => {
    const reversed = teamBubble([...EIGHT].reverse());
    expect(reversed).toEqual(teamBubble(EIGHT));
    expect(distance(reversed.hull[0] ?? vec2(0, 0), vec2(-80, 150))).toBe(0);
  });
});
