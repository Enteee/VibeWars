import { describe, expect, it } from "vitest";

import {
  BREAK_SECONDS,
  crackNetwork,
  crackTip,
  revealedLength,
  SAG_TO,
  sagShare,
  tumbleChunks,
} from "./breakable-mark.js";
import { WALL_HEIGHT } from "./layer-surfaces.js";

/** The tutorial's wall (station 5): long from north to south. */
const tutorial = { kind: "rect", x: 3540, y: 1480, width: 120, height: 640 } as const;
/** The snow map's: long from east to west, thin. */
const ice = { kind: "rect", x: 1301, y: 770, width: 238, height: 26 } as const;

/** A crack point as a key. */
function key({ x, y, up }: { x: number; y: number; up: number }): string {
  return [x, y, up].join(",");
}

/** Where each crack starts: the first point of each line no other segment ends at. */
function origins(network: ReturnType<typeof crackNetwork>): { x: number; y: number }[] {
  const ends = new Set(network.segments.map(({ to }) => key(to)));
  const starts = network.segments.map(({ from }) => from).filter((from) => !ends.has(key(from)));
  return [...new Map(starts.map((p) => [key(p), p])).values()];
}

describe("crackNetwork (#3370)", () => {
  it("is the same for the same seed, and differs between seeds", () => {
    expect(crackNetwork(7, tutorial, WALL_HEIGHT)).toEqual(crackNetwork(7, tutorial, WALL_HEIGHT));
    expect(crackNetwork(7, tutorial, WALL_HEIGHT)).not.toEqual(
      crackNetwork(8, tutorial, WALL_HEIGHT),
    );
  });

  it("grows from 2 to 4 origins, about one per 160 units of length", () => {
    for (const seed of [1, 2, 3, 40, 500]) {
      expect(origins(crackNetwork(seed, ice, WALL_HEIGHT))).toHaveLength(2);
      expect(origins(crackNetwork(seed, tutorial, WALL_HEIGHT))).toHaveLength(4);
      expect(
        origins(crackNetwork(seed, { kind: "rect", x: 0, y: 0, width: 40, height: 20 }, 0)),
      ).toHaveLength(2);
    }
  });

  it("spreads a long wall's origins along its length, not in a cluster", () => {
    const ys = origins(crackNetwork(3, tutorial, WALL_HEIGHT))
      .map(({ y }) => y)
      .sort((a, b) => a - b);
    for (let at = 1; at < ys.length; at += 1) {
      expect((ys[at] ?? 0) - (ys[at - 1] ?? 0)).toBeGreaterThan(60);
    }
  });

  it("keeps a wall to about 30 segments, 2 px at the origin and 1 px at the tips", () => {
    for (const seed of [1, 2, 3, 40, 500]) {
      const { segments } = crackNetwork(seed, tutorial, WALL_HEIGHT);
      expect(segments.length).toBeLessThanOrEqual(32);
      for (const { width } of segments) {
        expect(width).toBeGreaterThanOrEqual(1);
        expect(width).toBeLessThanOrEqual(2);
      }
      expect(segments.some(({ width }) => width === 2)).toBe(true);
    }
  });

  it("reveals more the more it is damaged: a hairline at 99 %, at least 80 % by 20 %", () => {
    for (const wall of [tutorial, ice]) {
      const network = crackNetwork(11, wall, WALL_HEIGHT);
      const whole = revealedLength(network, 1);
      let last = 0;
      for (let damage = 0; damage <= 1.0001; damage += 0.01) {
        const shown = revealedLength(network, damage);
        expect(shown).toBeGreaterThanOrEqual(last);
        last = shown;
      }
      expect(revealedLength(network, 0)).toBe(0);
      expect(revealedLength(network, 0.01)).toBeGreaterThan(0);
      expect(revealedLength(network, 0.8)).toBeGreaterThanOrEqual(0.8 * whole);
    }
  });

  it("runs up the south face and over the lip onto the top", () => {
    const { segments } = crackNetwork(5, ice, WALL_HEIGHT);
    expect(segments.some(({ from }) => from.up < WALL_HEIGHT)).toBe(true);
    expect(segments.some(({ from, to }) => from.up === WALL_HEIGHT && to.y < from.y)).toBe(true);
  });

  it("has a tip where the newest crack grows, and none before the first hit", () => {
    const network = crackNetwork(5, ice, WALL_HEIGHT);
    expect(crackTip(network, 0)).toBeUndefined();
    expect(crackTip(network, 0.3)).toBeDefined();
  });
});

describe("a wall's fall (#3370)", () => {
  it("sags from its whole height to 35 % over 0.6 s, easing in", () => {
    expect(BREAK_SECONDS).toBe(0.6);
    expect(sagShare(0)).toBe(1);
    expect(sagShare(BREAK_SECONDS)).toBeCloseTo(SAG_TO);
    expect(SAG_TO).toBe(0.35);
    expect(sagShare(5)).toBeCloseTo(SAG_TO);
    // Slow at first: less than half its sag in the first half.
    expect(1 - sagShare(BREAK_SECONDS / 2)).toBeLessThan((1 - SAG_TO) / 2);
    for (let age = 0; age < BREAK_SECONDS; age += 0.05) {
      expect(sagShare(age + 0.05)).toBeLessThanOrEqual(sagShare(age));
    }
  });

  it("throws 8 to 14 chunks a course in size, to both sides, landed by the end", () => {
    for (const seed of [1, 2, 3, 40, 500, 7777]) {
      const chunks = tumbleChunks(seed, ice, WALL_HEIGHT);
      expect(chunks.length).toBeGreaterThanOrEqual(8);
      expect(chunks.length).toBeLessThanOrEqual(14);
      expect(chunks.some(({ to }) => to.y > ice.y + ice.height)).toBe(true);
      expect(chunks.some(({ to }) => to.y < ice.y)).toBe(true);
      for (const { size, delay, flight } of chunks) {
        expect(size).toBeLessThanOrEqual(WALL_HEIGHT / 2);
        expect(delay + flight).toBeLessThanOrEqual(BREAK_SECONDS);
      }
    }
  });
});
