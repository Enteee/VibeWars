import { describe, expect, it } from "vitest";

import { REST_FRAME } from "./attack-clock.js";
import { LYING_WIDTH, lyingPose } from "./lying-pose.js";
import { weaponMarkLayout } from "./weapon-mark.js";

const R = 14;
const FACINGS = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);

/** How far `p` reaches along and across `facing` from the origin. */
const frame = (p: { x: number; y: number }, facing: number) => ({
  along: p.x * Math.cos(facing) + p.y * Math.sin(facing),
  across: -p.x * Math.sin(facing) + p.y * Math.cos(facing),
});

describe("lyingPose (#545)", () => {
  it("lies along its facing: as long as the disc, and narrower across it", () => {
    for (const facing of FACINGS) {
      const { body } = lyingPose(0, 0, R, facing);
      const along = Math.max(...body.map((p) => Math.abs(frame(p, facing).along)));
      const across = Math.max(...body.map((p) => Math.abs(frame(p, facing).across)));
      expect(along).toBeCloseTo(R, 6);
      expect(across).toBeCloseTo(R * LYING_WIDTH, 6);
    }
  });

  it("stays inside the standing disc, where the collision radius is", () => {
    for (const facing of FACINGS) {
      for (const p of lyingPose(50, -20, R, facing).body) {
        expect(Math.hypot(p.x - 50, p.y - -20)).toBeLessThanOrEqual(R + 1e-9);
      }
    }
  });

  it("drops the weapon on the body's right, clear of the target ring", () => {
    for (const facing of FACINGS) {
      const { weapon } = lyingPose(0, 0, R, facing);
      expect(frame(weapon, facing).across).toBeGreaterThan(0);
      for (const id of ["sword", "hammer", "longbow", "staff"]) {
        const { strokes, fills, strings } = weaponMarkLayout(
          weapon.x,
          weapon.y,
          weapon.r,
          weapon.facing,
          id,
          REST_FRAME,
        );
        for (const p of [...strokes, ...fills, ...strings].flat()) {
          expect(Math.hypot(p.x, p.y), `${id} at ${String(facing)}`).toBeLessThanOrEqual(R + 5.5);
        }
      }
    }
  });
});
