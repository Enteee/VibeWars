import { describe, expect, it } from "vitest";

import { REST_FRAME, type AttackFrame, type CastBeat } from "./attack-clock.js";
import { paintBodyMarks, type Painter, type StandingBody } from "./body-painter.js";
import {
  SWING_FADE_SECONDS,
  SWING_TRAIL_ALPHA,
  SWING_TRAIL_SECONDS,
  isMeleeWeapon,
  swingRibbon,
} from "./cosmetic-trail.js";
import type { WeaponMarkId } from "./weapon-mark-geometry.js";
import { WEAPON_MOTION } from "./weapon-pose.js";

const AT = { x: 100, y: 50, r: 14, facing: 0 };
const strike = (progress: number): AttackFrame => ({
  clip: { phase: "strike", progress },
  hit: 1,
});
const after = (phase: "hold" | "recover", sinceHit: number): AttackFrame => ({
  clip: { phase, progress: 0.5, sinceHit },
  hit: 1,
});
const MARKS = Object.keys(WEAPON_MOTION) as WeaponMarkId[];
const MELEE = MARKS.filter(isMeleeWeapon);
const RANGED = MARKS.filter((id) => !isMeleeWeapon(id));

describe("swingRibbon (#3579)", () => {
  it("tells melee weapons from the rest by their reach", () => {
    expect(MELEE).toEqual(expect.arrayContaining(["sword", "axe", "hammer", "daggers", "scythe"]));
    expect(RANGED).toEqual(
      expect.arrayContaining(["wand", "staff", "shortbow", "longbow", "flatbow", "spear"]),
    );
  });

  it("grows along the strike's arc, from where it began to the weapon's tip", () => {
    const early = swingRibbon(AT, "sword", strike(0.3), undefined, false);
    const late = swingRibbon(AT, "sword", strike(1), undefined, false);
    expect(early?.alpha).toBe(SWING_TRAIL_ALPHA);
    expect(early?.points[0]).toEqual(late?.points[0]);
    const span = (points: readonly { x: number; y: number }[] | undefined): number => {
      const first = points?.[0];
      const last = points?.at(-1);
      return first === undefined || last === undefined
        ? 0
        : Math.hypot(last.x - first.x, last.y - first.y);
    };
    expect(span(late?.points)).toBeGreaterThan(span(early?.points));
  });

  it("fades from the hit through the hold and into the recovery, then is gone", () => {
    expect(swingRibbon(AT, "sword", after("hold", 0), undefined, false)?.alpha).toBe(
      SWING_TRAIL_ALPHA,
    );
    const fading = swingRibbon(
      AT,
      "sword",
      after("recover", SWING_FADE_SECONDS / 2),
      undefined,
      false,
    );
    expect(fading?.alpha).toBeCloseTo(SWING_TRAIL_ALPHA / 2);
    expect(swingRibbon(AT, "sword", after("recover", SWING_FADE_SECONDS), undefined, false)).toBe(
      undefined,
    );
  });

  it("lasts at most SWING_TRAIL_SECONDS for every melee weapon", () => {
    for (const id of MELEE) {
      expect(WEAPON_MOTION[id].strike + SWING_FADE_SECONDS, id).toBeLessThanOrEqual(
        SWING_TRAIL_SECONDS,
      );
    }
  });

  it("is never drawn for a wind-up, a spell's raise, a settle or at rest", () => {
    const frames: AttackFrame[] = [
      REST_FRAME,
      { clip: { phase: "wind-up", progress: 0.8 }, hit: 1 },
      { clip: { phase: "raise", progress: 1 }, hit: 1 },
      {
        clip: { phase: "settle", progress: 0.2, from: { phase: "strike", progress: 0.5 } },
        hit: 1,
      },
    ];
    for (const frame of frames) {
      expect(swingRibbon(AT, "sword", frame, undefined, false), frame.clip.phase).toBe(undefined);
    }
  });

  it("is never drawn for a spell's release, which strikes too (#3320)", () => {
    const casting: CastBeat = { phase: "casting", skillId: "s", progress: 0.5 };
    const released: CastBeat = { phase: "released", skillId: "s", since: 0.05 };
    const long: CastBeat = { phase: "released", skillId: "s", since: SWING_TRAIL_SECONDS };
    expect(swingRibbon(AT, "sword", strike(0.5), casting, false)).toBe(undefined);
    expect(swingRibbon(AT, "sword", strike(0.5), released, false)).toBe(undefined);
    // Long after the release, the next auto-attack's swing has one again.
    expect(swingRibbon(AT, "sword", strike(0.5), long, false)).not.toBe(undefined);
  });

  it("is never drawn for a ranged or caster weapon, nor with no weapon", () => {
    for (const id of RANGED) {
      expect(swingRibbon(AT, id, strike(0.5), undefined, false), id).toBe(undefined);
    }
    expect(swingRibbon(AT, undefined, strike(0.5), undefined, false)).toBe(undefined);
  });

  it("is never drawn under reduced motion", () => {
    expect(swingRibbon(AT, "sword", strike(0.5), undefined, true)).toBe(undefined);
  });
});

describe("paintBodyMarks with a swing trail (#3579)", () => {
  /** A painter that writes down every call. */
  function recorder(): { readonly painter: Painter; readonly calls: string[] } {
    const calls: string[] = [];
    const log =
      (name: string) =>
      (...args: number[]): void => {
        calls.push(`${name}(${args.map((v) => v.toFixed(2)).join(", ")})`);
      };
    return {
      calls,
      painter: {
        fillStyle: log("fillStyle"),
        lineStyle: log("lineStyle"),
        fillCircle: log("fillCircle"),
        strokeCircle: log("strokeCircle"),
        beginPath: log("beginPath"),
        moveTo: log("moveTo"),
        lineTo: log("lineTo"),
        arc: log("arc"),
        strokePath: log("strokePath"),
        fillPoints: (points) => {
          calls.push(`fillPoints(${String(points.length)})`);
        },
      },
    };
  }
  const BODY: StandingBody = {
    ...AT,
    team: "self",
    weaponId: "sword",
    offhandId: undefined,
    frame: strike(0.6),
    cape: undefined,
  };

  it("draws the ribbon under the weapon mark, and the mark as without it", () => {
    const ribbon = swingRibbon(AT, "sword", BODY.frame, undefined, false);
    expect(ribbon).not.toBe(undefined);
    if (ribbon === undefined) {
      return;
    }
    const plain = recorder();
    paintBodyMarks(plain.painter, BODY);
    const worn = recorder();
    paintBodyMarks(worn.painter, { ...BODY, swingTrail: { ribbon, colour: 0x66ff33 } });
    const pieces = ribbon.points.length - 1;
    // Each piece: its style, then one stroked segment.
    expect(worn.calls.length).toBe(plain.calls.length + pieces * 5);
    expect(worn.calls[0]).toMatch(new RegExp(`^lineStyle\\(.*, ${String(0x66ff33)}\\.00, `));
    expect(worn.calls.slice(pieces * 5)).toEqual(plain.calls);
  });
});
