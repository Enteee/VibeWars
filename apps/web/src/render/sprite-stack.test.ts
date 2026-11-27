import { describe, expect, it } from "vitest";

import { CREATURE_LOOKS } from "@vibewars/game-core";

import {
  CREATURE_POSES,
  CREATURE_TONES,
  STACK_BAKED_HEADINGS,
  STACK_CAPE_SETTLE_SECONDS,
  STACK_HEADINGS,
  STACK_HEIGHT,
  STACK_POSES,
  STACK_SLICES,
  STACK_STEP,
  STACK_STRIDE_UNITS,
  STACK_TURN_SECONDS,
  bakedFrame,
  bucketFacing,
  creatureBucket,
  creaturePose,
  creatureSlices,
  creatureStack,
  headingBucket,
  stackHeight,
  stackLayers,
  stackPose,
  stackSlices,
  stackShade,
  stackTones,
  shortTurn,
  stepTurn,
} from "./sprite-stack.js";

const stackShadeOfVisor = stackShade(0x101014, 1);

const centreX = (pose: (typeof STACK_POSES)[number], tone: string, part = 0): number => {
  const slice = stackSlices(pose).find((s) => s.tone === tone);
  const points = slice?.parts[part] ?? [];
  return points.reduce((sum, p) => sum + p.x, 0) / points.length;
};

describe("sprite-stack (ADR-0057, #4031)", () => {
  it("has the gothic preset's 28 slices in every pose, a slice a twelfth of a radius", () => {
    expect(STACK_SLICES).toBe(28);
    for (const pose of STACK_POSES) {
      expect(stackHeight(stackSlices(pose))).toBe(STACK_SLICES);
    }
    expect(STACK_STEP).toBeCloseTo(1 / 12);
    expect(STACK_HEIGHT).toBeCloseTo(28 / 12);
  });

  it("is helmeted, visored and crested, with a cape at its back", () => {
    const tones = stackSlices("stand").map((slice) => slice.tone);
    expect(tones).toContain("metal");
    expect(tones.filter((tone) => tone === "visor")).toHaveLength(2);
    expect(tones.at(-1)).toBe("crest");
    expect(tones.filter((tone) => tone === "cape" || tone === "trim")).toHaveLength(11);
    expect(tones).not.toContain("hair");
    // The cape hangs behind: every cape slice is centred behind the body.
    for (const slice of stackSlices("stand").filter((s) => s.tone === "cape")) {
      const points = slice.parts[0] ?? [];
      expect(points.reduce((sum, p) => sum + p.x, 0) / points.length).toBeLessThan(0);
    }
  });

  it("strides its boots apart one way, then the other, and leans its helmet into a cast", () => {
    expect(centreX("stand", "boot", 0)).toBeCloseTo(centreX("stand", "boot", 1));
    expect(centreX("contact-a", "boot", 0)).toBeGreaterThan(centreX("contact-a", "boot", 1));
    expect(centreX("contact-b", "boot", 0)).toBeLessThan(centreX("contact-b", "boot", 1));
    expect(centreX("pass-a", "boot", 0)).toBeCloseTo(centreX("pass-a", "boot", 1));
    expect(centreX("cast", "visor")).toBeGreaterThan(centreX("stand", "visor"));
  });

  /** Every slice's polygons of `pose`, placed, as one comparable list. */
  /**
   * Every polygon of `pose` placed at `facing`, mirrored across the feet
   * if `flip`, each as its colour and its sorted corners, in no order: what
   * a frame shows, whichever way its polygons are listed or wound.
   */
  const placed = (pose: (typeof STACK_POSES)[number], facing = 0, flip = false): string[] => {
    const at = (v: number): number => (Math.round(v * 1000) + 0) / 1000;
    return stackLayers(stackSlices(pose), facing, 12, stackTones(0x59c2ff, undefined))
      .map((layer) =>
        [
          layer.colour,
          ...layer.points.map((p) => `${String(at(flip ? -p.x : p.x))},${String(at(p.y))}`).sort(),
        ].join(" "),
      )
      .sort();
  };

  it("has four walk frames, each its own (#4060)", () => {
    const walk = ["contact-a", "pass-a", "contact-b", "pass-b"] as const;
    expect(new Set(walk.map((pose) => placed(pose))).size).toBe(4);
    expect(walk.map((pose) => placed(pose).join("|"))).not.toContain(placed("stand").join("|"));
  });

  /** How far `pose` lifts the slices of `tone` over standing, in steps. */
  const lifted = (pose: (typeof STACK_POSES)[number], tone: string): number[] =>
    stackSlices(pose)
      .filter((slice) => slice.tone === tone)
      .map((slice) => slice.rise);

  it("breathes its torso and helmet up one step, and bobs only its helmet as it passes (#4060)", () => {
    expect(lifted("stand", "visor")).toEqual([0, 0]);
    expect(lifted("breath-a", "visor")).toEqual([0.5, 0.5]);
    expect(lifted("breath-b", "visor")).toEqual([1, 1]);
    expect(lifted("breath-b", "skin")).toEqual([1]);
    expect(lifted("breath-b", "boot")).toEqual([0, 0]);
    expect(lifted("pass-a", "visor")).toEqual([1, 1]);
    expect(lifted("pass-a", "skin")).toEqual([0]);
    expect(lifted("contact-a", "visor")).toEqual([0, 0]);
  });

  it("sways its cape out behind as it walks, the hem the most, to one side as it passes", () => {
    const capes = (pose: (typeof STACK_POSES)[number]) =>
      stackSlices(pose)
        .filter((slice) => slice.tone === "cape" || slice.tone === "trim")
        .map((slice) => {
          const points = slice.parts[0] ?? [];
          return {
            x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
            y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
          };
        });
    const [hem, ...above] = capes("contact-a");
    const [standingHem] = capes("stand");
    expect(hem?.x).toBeLessThan((standingHem?.x ?? 0) - 0.1);
    expect(hem?.y).toBeCloseTo(0);
    expect(above.at(-1)?.x).toBeGreaterThan(hem?.x ?? 0);
    expect(capes("pass-a")[0]?.y).toBeGreaterThan(0.1);
    expect(capes("pass-b")[0]?.y).toBeLessThan(-0.1);
  });

  it("turns in the nearest of sixteen heading buckets (#4060)", () => {
    expect(STACK_HEADINGS).toBe(16);
    expect(headingBucket(0)).toBe(0);
    expect(headingBucket(Math.PI / 2)).toBe(4);
    expect(headingBucket(Math.PI)).toBe(8);
    expect(headingBucket(-Math.PI / 8)).toBe(15);
    expect(headingBucket(Math.PI * 2)).toBe(0);
    expect(headingBucket(Math.PI / 16 - 0.01)).toBe(0);
    expect(headingBucket(Math.PI / 16 + 0.01)).toBe(1);
    for (let bucket = 0; bucket < STACK_HEADINGS; bucket += 1) {
      expect(headingBucket(bucketFacing(bucket))).toBe(bucket);
    }
  });

  it("draws a heading it does not bake as its mirror image, in the mirrored pose (#4060)", () => {
    expect(STACK_BAKED_HEADINGS).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (let bucket = 0; bucket < STACK_HEADINGS; bucket += 1) {
      for (const pose of STACK_POSES) {
        const frame = bakedFrame(bucket, pose);
        expect(STACK_BAKED_HEADINGS).toContain(frame.bucket);
        if (!frame.flipped) {
          expect(frame).toEqual({ bucket, pose, flipped: false });
          continue;
        }
        // Flipped, the baked frame is the one wanted, polygon for polygon.
        expect(placed(frame.pose, bucketFacing(frame.bucket), true)).toEqual(
          placed(pose, bucketFacing(bucket)),
        );
      }
    }
  });

  it("eases to a new heading the short way, one bucket a frame at most, in 0.12 s (#4060)", () => {
    expect(shortTurn(1, 15)).toBe(-2);
    expect(shortTurn(15, 1)).toBe(2);
    expect(shortTurn(0, 8)).toBe(8);
    let turn = stepTurn(undefined, 14, 0);
    expect(turn.drawn).toBe(14);
    const drawn: number[] = [];
    for (let now = 1; now <= 1 + STACK_TURN_SECONDS + 0.05; now += 1 / 60) {
      const before = turn.drawn;
      turn = stepTurn(turn, 3, now);
      expect(Math.abs(shortTurn(before, turn.drawn))).toBeLessThanOrEqual(1);
      drawn.push(turn.drawn);
    }
    // 14 to 3 is five buckets on through 0, not eleven back.
    expect([...new Set(drawn)]).toEqual([14, 15, 0, 1, 2, 3]);
    expect(turn.drawn).toBe(3);
  });

  /** `stackPose` of a body that has walked `walked` units, stopped `stoppedFor` seconds ago. */
  const pose = (walked: number, stoppedFor: number, now = 0, reducedMotion = false) =>
    stackPose({ casting: false, walked, stoppedFor, now, phase: 0, reducedMotion });

  it("walks its four frames by the distance walked, however fast (#4060)", () => {
    const quarter = STACK_STRIDE_UNITS / 4;
    expect([0, 1, 2, 3, 4].map((k) => pose(k * quarter + 1, 0))).toEqual([
      "contact-a",
      "pass-a",
      "contact-b",
      "pass-b",
      "contact-a",
    ]);
  });

  it("settles its cape through a passing frame once it stops, then breathes every 3 s", () => {
    expect(pose(1, 0.1)).toBe("pass-a");
    expect(pose(STACK_STRIDE_UNITS / 2 + 1, 0.1)).toBe("pass-b");
    expect(pose(1, STACK_CAPE_SETTLE_SECONDS)).toBe("stand");
    const breaths = Array.from({ length: 30 }, (_, i) => pose(0, 10, i / 10));
    expect(breaths[0]).toBe("stand");
    expect(breaths[15]).toBe("breath-b");
    expect(new Set(breaths)).toEqual(new Set(["stand", "breath-a", "breath-b"]));
    expect(
      stackPose({
        casting: false,
        walked: 0,
        stoppedFor: 10,
        now: 0,
        phase: 0.5,
        reducedMotion: false,
      }),
    ).toBe("breath-b");
  });

  it("strides, sways, breathes and leans only when reduced motion is off", () => {
    expect(
      stackPose({
        casting: true,
        walked: 0,
        stoppedFor: 0,
        now: 0,
        phase: 0,
        reducedMotion: false,
      }),
    ).toBe("cast");
    expect(
      stackPose({ casting: true, walked: 0, stoppedFor: 0, now: 0, phase: 0, reducedMotion: true }),
    ).toBe("stand");
    expect(pose(20, 0, 0, true)).toBe("stand");
    expect(pose(1, 0.1, 0, true)).toBe("stand");
    expect(pose(0, 10, 1.5, true)).toBe("stand");
  });

  it("faces its visor the way it faces, and rises a full stack", () => {
    const tones = stackTones(0x59c2ff, undefined);
    const layers = stackLayers(stackSlices("stand"), Math.PI / 2, 12, tones);
    const visor = layers.filter((layer) => layer.colour === stackShadeOfVisor);
    const mid = (points: readonly { readonly x: number; readonly y: number }[]) =>
      points.reduce((sum, p) => sum + p.x, 0) / points.length;
    // Facing down the screen: the visor sits on the helmet's centre line, at its front.
    expect(visor).toHaveLength(2);
    for (const layer of visor) {
      expect(mid(layer.points)).toBeCloseTo(0, 5);
    }
    const top = Math.min(...layers.flatMap((layer) => layer.points.map((p) => p.y)));
    expect(top).toBeLessThan(-STACK_HEIGHT * 12);
    expect(top).toBeGreaterThan(-STACK_HEIGHT * 12 - 12);
  });

  it("wears its own cape's colours, or the body colour darker without one", () => {
    expect(stackTones(0x59c2ff, undefined).cape).toBe(0x357499);
    expect(stackTones(0x59c2ff, undefined).trim).toBe(0x357499);
    const cape = { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] };
    expect(stackTones(0x59c2ff, cape)).toMatchObject({
      cape: 0x203040,
      trim: 0xc0a060,
      crest: 0xc0a060,
    });
  });

  it("trims a cape's hem and leaves the rest of its back plain", () => {
    const back = stackSlices("stand").filter((s) => s.tone === "cape" || s.tone === "trim");
    expect(back[0]?.tone).toBe("trim");
    expect(back.slice(1).every((slice) => slice.tone === "cape")).toBe(true);
    expect(back.length).toBeGreaterThan(2);
  });

  it("paints in ascending lift, ties in list order, so a prop restarting at the hand sits behind (#4171)", () => {
    const square = (x: number) => [
      { x, y: 0 },
      { x: x + 1, y: 0 },
      { x: x + 1, y: 1 },
    ];
    const layers = stackLayers(
      [
        { parts: [square(0)], tone: "a", light: 1, lift: 0, rise: 0 },
        { parts: [square(1)], tone: "a", light: 1, lift: 5, rise: 0 },
        { parts: [square(2)], tone: "b", light: 1, lift: 2, rise: 0 },
        { parts: [square(3)], tone: "b", light: 1, lift: 2, rise: 0 },
      ],
      0,
      12,
      { a: 0xffffff, b: 0x000000 },
    );
    expect(layers.map((layer) => layer.points[0]?.x)).toEqual([0, 24, 36, 12]);
    // Lift n stands n + 1 steps over the feet.
    expect(layers[0]?.points[0]?.y).toBeCloseTo(-STACK_STEP * 12);
    expect(layers[3]?.points[0]?.y).toBeCloseTo(-6 * STACK_STEP * 12);
  });

  it("bakes a body as it did before lifts were absolute (#4171)", () => {
    // FNV-1a of the layers, as the pipeline drew them with `same` slices.
    const cape = { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] };
    const layers = stackLayers(stackSlices("contact-a"), 1.3, 21, stackTones(0x59c2ff, cape));
    const text = JSON.stringify(
      layers.map((l) => [l.colour, l.points.map((p) => [p.x.toFixed(4), p.y.toFixed(4)])]),
    );
    let hash = 2166136261;
    for (const c of text) {
      hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
    }
    expect(hash).toBe(2628465587);
  });
});

describe("stacked creatures (#4171)", () => {
  const radius = (points: readonly { readonly x: number; readonly y: number }[]): number =>
    Math.max(...points.map((p) => Math.hypot(p.x, p.y)));

  it("stacks a spirit as one heading, one pose: a stone base, then a wisp narrowing upward", () => {
    expect(creatureStack("spirit")).toMatchObject({ headings: 1, poses: ["stand"] });
    const slices = creatureSlices("spirit", "stand") ?? [];
    expect(slices.slice(0, 2).map((slice) => slice.tone)).toEqual(["stone", "stone"]);
    const wisp = slices.slice(2);
    expect(wisp.length).toBeGreaterThanOrEqual(8);
    expect(wisp.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < wisp.length; i += 1) {
      expect(wisp[i]?.lift).toBe((wisp[i - 1]?.lift ?? 0) + 1);
      expect(radius(wisp[i]?.parts[0] ?? [])).toBeLessThan(radius(wisp[i - 1]?.parts[0] ?? []));
    }
    expect(wisp.at(-1)?.tone).toBe("wisp-top");
    expect(
      creatureBucket(creatureStack("spirit") ?? { headings: 1, poses: [], scale: 1, alpha: 1 }, 2),
    ).toBe(0);
  });

  it("stacks the ghostly hero as a capeless body in ghost tones, eight headings by three poses, axe in hand", () => {
    const stack = creatureStack("ghostly-hero");
    expect(stack?.headings).toBe(8);
    expect(stack?.poses).toEqual(CREATURE_POSES);
    for (const pose of CREATURE_POSES) {
      const slices = creatureSlices("ghostly-hero", pose) ?? [];
      const tones = new Set(slices.map((slice) => slice.tone));
      expect(tones.has("ghost")).toBe(true);
      for (const tone of tones) {
        expect(CREATURE_TONES[tone]).toBeDefined();
      }
      // The haft rises from the hand, not from over the helmet.
      const haft = slices.filter(
        (slice) => slice.tone === "ghost-legs" && slice.parts.length === 1,
      );
      expect(Math.min(...haft.map((slice) => slice.lift))).toBe(8);
      expect(stackHeight(slices)).toBe(STACK_SLICES);
    }
    expect(creatureSlices("ghostly-hero", "stride-a")).not.toEqual(
      creatureSlices("ghostly-hero", "stride-b"),
    );
  });

  it("leaves every other look its flat disc", () => {
    const stacked = CREATURE_LOOKS.filter((look) => creatureStack(look) !== undefined);
    expect(stacked).toEqual(["spirit", "ghostly-hero"]);
    for (const look of CREATURE_LOOKS.filter((look) => !stacked.includes(look))) {
      expect(creatureSlices(look, "stand")).toBeUndefined();
    }
  });

  it("strides foot by foot while it walks, and stands still, or under reduced motion", () => {
    const ghost = creatureStack("ghostly-hero");
    const spirit = creatureStack("spirit");
    if (ghost === undefined || spirit === undefined) {
      throw new Error("not stacked");
    }
    expect(creaturePose(ghost, 0, true, false)).toBe("stride-a");
    expect(creaturePose(ghost, STACK_STRIDE_UNITS / 2, true, false)).toBe("stride-b");
    expect(creaturePose(ghost, STACK_STRIDE_UNITS, true, false)).toBe("stride-a");
    expect(creaturePose(ghost, 10, false, false)).toBe("stand");
    expect(creaturePose(ghost, 10, true, true)).toBe("stand");
    expect(creaturePose(spirit, 10, true, false)).toBe("stand");
    expect(creatureBucket(ghost, Math.PI / 2)).toBe(2);
    expect(creatureBucket(ghost, -Math.PI / 4)).toBe(7);
  });
});
