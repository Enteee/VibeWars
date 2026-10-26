import { describe, expect, it } from "vitest";

import { WEAPONS, type WeaponId } from "@vibewars/game-core";

import { WEAPON_MARK_GEOMETRY, type Point } from "./weapon-mark-geometry.js";
import {
  REST_CLIP,
  WEAPON_MOTION,
  weaponPose,
  type AttackClip,
  type SwingClip,
  type WeaponMarkLayout,
} from "./weapon-pose.js";

const IDS = Object.keys(WEAPONS) as WeaponId[];
/** The static mark's limit from #356: r + 5.5, clear of the target ring. */
const LIMIT = 14 + 5.5;
const STEPS = Array.from({ length: 41 }, (_, k) => k / 40);
const HITS = [0, 1, 2, 3, 4, 5];

const pointsOf = (layout: WeaponMarkLayout): Point[] =>
  [...layout.strokes, ...layout.fills, ...layout.strings].flat();

/** Every clip a swing passes through, settling from every point of it included. */
function everyClip(id: WeaponId): AttackClip[] {
  const m = WEAPON_MOTION[id];
  const swings: SwingClip[] = STEPS.flatMap((progress) => [
    { phase: "wind-up", progress },
    { phase: "strike", progress, fromRest: false },
    { phase: "strike", progress, fromRest: true },
  ]);
  return [
    REST_CLIP,
    ...swings,
    ...STEPS.flatMap((progress): AttackClip[] => [
      { phase: "hold", progress, sinceHit: progress * m.hold },
      { phase: "recover", progress, sinceHit: m.hold + progress * m.recover },
    ]),
    ...swings.flatMap((from) =>
      [0, 0.25, 0.5, 0.75, 1].map((progress): AttackClip => ({ phase: "settle", progress, from })),
    ),
  ];
}

describe("weapon motion table (#536 §2)", () => {
  it("has a motion for every weapon the game has, and no other", () => {
    expect(Object.keys(WEAPON_MOTION).sort()).toEqual([...IDS].sort());
  });

  it("fits wind-up, strike, hold and recover inside one interval, every weapon", () => {
    for (const id of IDS) {
      const m = WEAPON_MOTION[id];
      expect(m.windUp + m.strike + m.hold + m.recover, id).toBeLessThanOrEqual(
        WEAPONS[id].attackIntervalSeconds,
      );
    }
  });
});

describe("weaponPose", () => {
  it("keeps every point of every pose within r + 5.5, every weapon and hit", () => {
    for (const id of IDS) {
      // The farthest point, and the clip it is in, so a failure names it.
      let worst = { distance: 0, clip: "" };
      for (const clip of everyClip(id)) {
        for (const hit of HITS) {
          for (const q of pointsOf(weaponPose(id, clip, hit))) {
            const distance = Math.hypot(q.x, q.y);
            if (distance > worst.distance) {
              worst = { distance, clip: JSON.stringify(clip) };
            }
          }
        }
      }
      expect(worst.distance, `${id} ${worst.clip}`).toBeLessThanOrEqual(LIMIT + 1e-9);
    }
  });

  it("is the static mark at rest", () => {
    for (const id of IDS) {
      const posed = weaponPose(id, REST_CLIP, 0);
      const geometry = WEAPON_MARK_GEOMETRY[id];
      expect(posed.alpha, id).toBe(1);
      for (const kind of ["strokes", "fills", "strings"] as const) {
        expect(
          posed[kind].map((line) => line.length),
          `${id} ${kind}`,
        ).toEqual(geometry[kind].map((line) => line.length));
        posed[kind].forEach((line, i) => {
          line.forEach((q, j) => {
            expect(q.x, `${id} ${kind}`).toBeCloseTo(geometry[kind][i]?.[j]?.x ?? NaN, 9);
            expect(q.y, `${id} ${kind}`).toBeCloseTo(geometry[kind][i]?.[j]?.y ?? NaN, 9);
          });
        });
      }
    }
  });

  it("alternates hands for fists and daggers: even hits the right, odd the left", () => {
    const strike: AttackClip = { phase: "hold", progress: 0, sinceHit: 0 };
    for (const id of ["unarmed", "daggers"] as const) {
      const rest = pointsOf(weaponPose(id, REST_CLIP, 0));
      const moved = (hit: number) =>
        pointsOf(weaponPose(id, strike, hit))
          .map((q, i) => ({ q, rest: rest[i] }))
          .filter(({ q, rest: r }) => r !== undefined && (q.x !== r.x || q.y !== r.y))
          .map(({ rest: r }) => Math.sign(r?.y ?? 0));
      expect(new Set(moved(0)), id).toEqual(new Set([1]));
      expect(new Set(moved(1)), id).toEqual(new Set([-1]));
    }
  });

  it("lets the spear go at the release, and fades a new one in by the end of recovery", () => {
    const m = WEAPON_MOTION.spear;
    expect(weaponPose("spear", { phase: "hold", progress: 0, sinceHit: 0 }, 0).alpha).toBe(0);
    const early = { phase: "recover", progress: 0.3, sinceHit: m.hold + 0.3 * m.recover } as const;
    expect(weaponPose("spear", early, 0).alpha).toBe(0);
    const late = { phase: "recover", progress: 1, sinceHit: m.hold + m.recover } as const;
    expect(weaponPose("spear", late, 0).alpha).toBeCloseTo(1, 9);
  });

  it("nocks an arrow while a bow draws, and pulls the string back by its draw", () => {
    for (const id of ["shortbow", "flatbow", "longbow", "recurve-bow", "hornbow"] as const) {
      const rest = weaponPose(id, REST_CLIP, 0);
      const drawn = weaponPose(id, { phase: "wind-up", progress: 0.9 }, 0);
      expect(drawn.strokes, id).toHaveLength(rest.strokes.length + 1);
      expect(drawn.fills, id).toHaveLength(1);
      const nock = (layout: WeaponMarkLayout) => layout.strings[0]?.[1]?.x ?? NaN;
      // At full draw past the anchor; the limbs bend in a little too.
      expect(nock(rest) - nock(drawn), id).toBeGreaterThanOrEqual(WEAPON_MOTION[id].drawDepth);
      expect(weaponPose(id, { phase: "hold", progress: 0, sinceHit: 0 }, 0).fills, id).toEqual([]);
    }
  });

  it("swings the sword back and out on the wind-up, then across to the left", () => {
    const tip = (clip: AttackClip) => weaponPose("sword", clip, 0).strokes[0]?.[1];
    const rest = tip(REST_CLIP);
    const wound = tip({ phase: "wind-up", progress: 1 });
    const struck = tip({ phase: "hold", progress: 0, sinceHit: 0 });
    // +y is the right hand: back and out, then across the front.
    expect(wound?.y ?? 0).toBeGreaterThan(rest?.y ?? 0);
    expect(struck?.y ?? 0).toBeLessThan(rest?.y ?? 0);
  });
});
