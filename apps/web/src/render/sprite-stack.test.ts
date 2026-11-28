import { describe, expect, it } from "vitest";

import { CREATURE_LOOKS } from "@vibewars/game-core";

import { CREATURE_DRAWN_RADIUS } from "./creature-shape.js";
import { STACK_BAKE_RADIUS } from "./stack-atlas.js";

import {
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
  creatureBucket,
  creatureLayers,
  creaturePose,
  creatureSlices,
  creatureStack,
  bucketFacing,
  headingBucket,
  stackLayers,
  stackLifts,
  stackPose,
  stackSlices,
  stackShade,
  stackTones,
  shortTurn,
  stepTurn,
  type StackSlice,
  type StackTone,
} from "./sprite-stack.js";
import {
  PROFESSION_OUTFITS,
  WARRIOR_OUTFIT,
  accentOf,
  outfitOf,
  type Accent,
  type Outfit,
} from "./profession-outfits.js";

const stackShadeOfVisor = stackShade(0x101014, 1);

const centreX = (pose: (typeof STACK_POSES)[number], tone: string, part = 0): number => {
  const slice = stackSlices(pose, WARRIOR_OUTFIT, undefined).find((s) => s.tone === tone);
  const points = slice?.parts[part] ?? [];
  return points.reduce((sum, p) => sum + p.x, 0) / points.length;
};

describe("sprite-stack (ADR-0057, #4031)", () => {
  it("has the gothic preset's 28 slices in every pose, a slice a twelfth of a radius", () => {
    expect(STACK_SLICES).toBe(28);
    for (const pose of STACK_POSES) {
      expect(stackLifts(stackSlices(pose, WARRIOR_OUTFIT, undefined))).toBe(STACK_SLICES);
    }
    expect(STACK_STEP).toBeCloseTo(1 / 12);
    expect(STACK_HEIGHT).toBeCloseTo(28 / 12);
  });

  it("is helmeted, visored and crested, with a cape at its back", () => {
    const tones = stackSlices("stand", WARRIOR_OUTFIT, undefined).map((slice) => slice.tone);
    expect(tones).toContain("metal");
    expect(tones.filter((tone) => tone === "visor")).toHaveLength(2);
    expect(tones.at(-1)).toBe("crest");
    expect(tones.filter((tone) => tone === "cape")).toHaveLength(11);
    expect(tones).not.toContain("hair");
    // The cape hangs behind: every cape slice is centred behind the body.
    for (const slice of stackSlices("stand", WARRIOR_OUTFIT, undefined).filter(
      (s) => s.tone === "cape",
    )) {
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
    return stackLayers(
      stackSlices(pose, WARRIOR_OUTFIT, undefined),
      facing,
      12,
      stackTones(0x59c2ff, undefined, WARRIOR_OUTFIT, undefined),
    )
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
    stackSlices(pose, WARRIOR_OUTFIT, undefined)
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
      stackSlices(pose, WARRIOR_OUTFIT, undefined)
        .filter((slice) => slice.tone === "cape")
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
    const tones = stackTones(0x59c2ff, undefined, WARRIOR_OUTFIT, undefined);
    const layers = stackLayers(
      stackSlices("stand", WARRIOR_OUTFIT, undefined),
      Math.PI / 2,
      12,
      tones,
    );
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
    expect(stackTones(0x59c2ff, undefined, WARRIOR_OUTFIT, undefined).cape).toBe(0x357499);
    expect(stackTones(0x59c2ff, undefined, WARRIOR_OUTFIT, undefined).trim).toBe(0x357499);
    const cape = { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] };
    expect(stackTones(0x59c2ff, cape, WARRIOR_OUTFIT, undefined)).toMatchObject({
      cape: 0x203040,
      trim: 0xc0a060,
      crest: 0xc0a060,
    });
  });

  it("trims a cape's hem and leaves the rest of its back plain", () => {
    const tones = stackTones(
      0x59c2ff,
      { main: 0x203040, trim: 0xc0a060, emblem: "", palette: [] },
      WARRIOR_OUTFIT,
      undefined,
    );
    const slices = stackSlices("stand", WARRIOR_OUTFIT, undefined);
    const layers = stackLayers(slices, 0, 12, tones);
    let cape = 0;
    let at = 0;
    for (const slice of slices) {
      if (slice.tone === "cape") {
        const tone = cape === 0 ? tones.trim : tones.cape;
        expect(layers[at]?.colour).toBe(stackShade(tone, slice.light));
        cape += 1;
      }
      at += slice.parts.length;
    }
    expect(cape).toBeGreaterThan(2);
  });

  it("keeps the body's frames as they were when lifts replaced `same` (#4171)", () => {
    // FNV-1a of the stand and contact-a layers, measured before the change.
    const fingerprint = (pose: (typeof STACK_POSES)[number]): number => {
      const tones = stackTones(
        0x3366cc,
        { main: 0x8a2a2a, trim: 0xc9a227, emblem: "", palette: [] },
        WARRIOR_OUTFIT,
        undefined,
      );
      const text = JSON.stringify(
        stackLayers(stackSlices(pose, WARRIOR_OUTFIT, undefined), 1.3, 21, tones).map((layer) => [
          layer.colour,
          layer.points.map((p) => [p.x.toFixed(4), p.y.toFixed(4)]),
        ]),
      );
      let hash = 2166136261;
      for (let i = 0; i < text.length; i += 1) {
        hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
      }
      return hash;
    };
    expect(fingerprint("stand")).toBe(1718110711);
    expect(fingerprint("contact-a")).toBe(47814412);
  });

  it("drops a cape's slices, not their lifts, from a figure without one", () => {
    const caped = stackSlices("stand", WARRIOR_OUTFIT, undefined);
    const bare = stackSlices("stand", WARRIOR_OUTFIT, undefined, false);
    expect(bare.some((slice) => slice.tone === "cape")).toBe(false);
    expect(stackLifts(bare)).toBe(stackLifts(caped));
    const helmet = (slices: typeof caped): number | undefined =>
      slices.find((slice) => slice.tone === "visor")?.lift;
    expect(helmet(bare)).toBe(helmet(caped));
  });
});

describe("creature figures (#4171)", () => {
  const radius = (slice: StackSlice<number>): number =>
    Math.max(...slice.parts.flatMap((part) => part.map((p) => Math.hypot(p.x, p.y))));

  it("stands a spirit in one heading and one pose, its wisp narrowing as it rises", () => {
    expect(creatureStack("spirit")).toEqual({ headings: 1, poses: ["stand"] });
    const slices = creatureSlices("spirit", "stand") ?? [];
    expect(stackLifts(slices)).toBe(11);
    const wisp = slices.slice(2);
    expect(wisp.length).toBeGreaterThanOrEqual(8);
    expect(wisp.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < wisp.length; i += 1) {
      const [below, above] = [wisp[i - 1], wisp[i]];
      expect(below !== undefined && above !== undefined && radius(above) < radius(below)).toBe(
        true,
      );
      expect((above?.alpha ?? 1) < (below?.alpha ?? 0)).toBe(true);
    }
  });

  it("turns a ghostly hero in 8 headings and walks it in 3 poses, translucent and caped in nothing", () => {
    const stack = creatureStack("ghostly-hero");
    expect(stack?.headings).toBe(8);
    expect(stack?.poses).toEqual(["stand", "stride-a", "stride-b"]);
    for (const pose of stack?.poses ?? []) {
      const slices = creatureSlices("ghostly-hero", pose) ?? [];
      expect(slices.length).toBeGreaterThan(0);
      expect(slices.every((slice) => slice.alpha === 0.75)).toBe(true);
    }
    expect(creatureSlices("ghostly-hero", "stride-a")).not.toEqual(
      creatureSlices("ghostly-hero", "stride-b"),
    );
  });

  it("restarts the ghost's axe at the hand and paints it under the head above it", () => {
    const slices = creatureSlices("ghostly-hero", "stand") ?? [];
    const haft = slices.find((slice) => slice.tone === 0x6a4a2c);
    expect(haft?.lift).toBe(8);
    // A body's 28 lifts; the axe, restarting at the hand, adds none.
    expect(stackLifts(slices)).toBe(STACK_SLICES);
    // Listed after the helmet, painted before it: slices go up by lift.
    const layers = creatureLayers(slices, 0, 12);
    const haftAt = layers.findIndex((layer) => layer.colour === stackShade(0x6a4a2c, 0.8));
    const visorAt = layers.findIndex((layer) => layer.colour === stackShade(0x101014, 1));
    expect(haftAt).toBeGreaterThanOrEqual(0);
    expect(haftAt).toBeLessThan(visorAt);
  });

  const MINIONS = [
    "bone-minion",
    "bone-horror",
    "bone-fiend",
    "vampiric-horror",
    "shambling-horror",
    "jagged-horror",
    "flesh-golem",
  ] as const;
  /** How far `look`'s figure reaches from its feet, drawn, at its widest. */
  const footprint = (look: (typeof MINIONS)[number]): number =>
    Math.max(...(creatureSlices(look, "stand") ?? []).map(radius)) * CREATURE_DRAWN_RADIUS[look];

  it("turns every minion in 8 headings and walks it in 3 poses (#4172)", () => {
    for (const look of MINIONS) {
      const stack = creatureStack(look);
      expect(stack?.headings).toBe(8);
      expect(stack?.poses).toEqual(["stand", "stride-a", "stride-b"]);
      for (const pose of stack?.poses ?? []) {
        expect(creatureSlices(look, pose)?.length).toBeGreaterThan(0);
      }
      expect(creatureSlices(look, "stride-a")).not.toEqual(creatureSlices(look, "stride-b"));
    }
  });

  it("makes the flesh golem the widest minion and taller than a horror, the bone minion the smallest", () => {
    const golem = footprint("flesh-golem");
    const minion = footprint("bone-minion");
    for (const look of MINIONS) {
      expect(footprint(look)).toBeLessThanOrEqual(golem);
      expect(footprint(look)).toBeGreaterThanOrEqual(minion);
    }
    expect(footprint("bone-horror")).toBeGreaterThan(minion);
    expect(footprint("bone-horror")).toBeLessThan(golem);
    const tall = (look: (typeof MINIONS)[number]): number =>
      stackLifts(creatureSlices(look, "stand") ?? []) * CREATURE_DRAWN_RADIUS[look];
    expect(tall("flesh-golem")).toBeGreaterThan(tall("bone-horror"));
    expect(tall("bone-minion")).toBeLessThan(tall("bone-horror"));
  });

  it("gives each horror its own cue over the shared build", () => {
    const horrors = MINIONS.filter((look) => look.endsWith("horror") || look === "bone-fiend");
    const builds = horrors.map((look) => JSON.stringify(creatureSlices(look, "stand")));
    expect(new Set(builds).size).toBe(horrors.length);
    expect(creatureSlices("vampiric-horror", "stand")?.some((s) => s.tone === 0x7a1f2b)).toBe(true);
  });

  it("draws every creature look as a figure (#4173)", () => {
    for (const look of CREATURE_LOOKS) {
      expect(creatureStack(look), look).toBeDefined();
      expect(creatureSlices(look, "stand")?.length, look).toBeGreaterThan(0);
    }
  });

  it("picks a creature's heading and pose from a body's", () => {
    const ghost = creatureStack("ghostly-hero");
    expect(ghost && creatureBucket(ghost, 2)).toBe(1);
    expect(ghost && creatureBucket(ghost, 15)).toBe(0);
    const spirit = creatureStack("spirit");
    expect(spirit && creatureBucket(spirit, 7)).toBe(0);
    expect(ghost && creaturePose(ghost, "contact-a")).toBe("stride-a");
    expect(spirit && creaturePose(spirit, "contact-a")).toBe("stand");
    expect(ghost && creaturePose(ghost, "contact-b")).toBe("stride-b");
    expect(ghost && creaturePose(ghost, "pass-a")).toBe("stand");
    expect(ghost && creaturePose(ghost, "cast")).toBe("stand");
  });
});

describe("profession outfits (#4175)", () => {
  const OUTFITS = Object.values(PROFESSION_OUTFITS);
  const ACCENTS = (["monk", "elementalist", "warrior"] as const).map((secondary) => {
    const accent = accentOf(secondary);
    if (accent === undefined) {
      throw new Error(`no accent for ${secondary}`);
    }
    return accent;
  });
  const standing = (outfit: Outfit, accent?: Accent): readonly StackSlice[] =>
    stackSlices("stand", outfit, accent);

  /** Inside `polygon`, by the even-odd rule. */
  const inside = (polygon: readonly { x: number; y: number }[], x: number, y: number): boolean => {
    let on = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const a = polygon[i];
      const b = polygon[j];
      if (a !== undefined && b !== undefined && a.y > y !== b.y > y) {
        if (x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
          on = !on;
        }
      }
    }
    return on;
  };
  /** How much of a grid of twenty-fifths of a radius lies under team-coloured slices, from above. */
  const teamArea = (slices: readonly StackSlice[]): number => {
    const parts = slices.filter((slice) => slice.tone === "team").flatMap((slice) => slice.parts);
    let hit = 0;
    for (let x = -30; x <= 30; x += 1) {
      for (let y = -30; y <= 30; y += 1) {
        if (parts.some((part) => inside(part, x / 25, y / 25))) {
          hit += 1;
        }
      }
    }
    return hit;
  };

  it("dresses every profession its own way (#4175, #4179, #4180)", () => {
    expect(OUTFITS).toHaveLength(10);
    const looks = OUTFITS.map((outfit) => JSON.stringify(standing(outfit)));
    expect(new Set(looks).size).toBe(OUTFITS.length);
  });

  it("wears the warrior's outfit with no primary, and adds no accent with no secondary", () => {
    expect(outfitOf("warrior")).toBe(WARRIOR_OUTFIT);
    expect(outfitOf(undefined)).toBe(WARRIOR_OUTFIT);
    expect(accentOf(undefined)).toBeUndefined();
  });

  it("adds exactly its secondary's accent slices, and none without a secondary", () => {
    for (const outfit of OUTFITS) {
      const plain = standing(outfit);
      expect(plain.map((slice) => slice.tone)).not.toContain("accent");
      for (const accent of ACCENTS) {
        const worn = standing(outfit, accent);
        expect(worn.filter((slice) => slice.tone !== "accent")).toEqual(plain);
        expect(worn.map((slice) => slice.tone)).toContain("accent");
        expect(stackLifts(worn)).toBe(stackLifts(plain));
      }
    }
  });

  it("keeps at least 80 % of the warrior's team colour seen from above", () => {
    const warrior = teamArea(standing(WARRIOR_OUTFIT));
    for (const outfit of OUTFITS) {
      for (const accent of [undefined, ...ACCENTS]) {
        expect(teamArea(standing(outfit, accent))).toBeGreaterThanOrEqual(0.8 * warrior);
      }
    }
  });

  it("stands every outfit at most STACK_SLICES high, in every pose alike, at most 4 over the warrior", () => {
    const warrior = stackLifts(standing(WARRIOR_OUTFIT));
    for (const outfit of OUTFITS) {
      const lifts = stackLifts(standing(outfit));
      expect(lifts).toBeLessThanOrEqual(STACK_SLICES);
      expect(lifts).toBeLessThanOrEqual(warrior + 4);
      for (const pose of STACK_POSES) {
        expect(stackLifts(stackSlices(pose, outfit, undefined))).toBe(lifts);
      }
    }
  });

  it("paints the outfit's cloth and the accent's tone", () => {
    const monk = outfitOf("monk");
    const accent = accentOf("elementalist");
    const tones = stackTones(0x59c2ff, undefined, monk, accent);
    expect(tones.cloth).toBe(monk.cloth);
    expect(tones.accent).toBe(accent?.tone);
  });

  it("hoods the ranger with a quiver on its back, bares the monk's head, crowns the elementalist", () => {
    const tones = (primary: "monk" | "elementalist" | "ranger"): StackTone[] =>
      standing(outfitOf(primary)).map((slice) => slice.tone);
    expect(tones("ranger")).toContain("leather");
    expect(tones("ranger")).not.toContain("visor");
    expect(tones("monk")).toContain("hair");
    expect(tones("monk")).not.toContain("metal");
    expect(tones("elementalist")).toContain("gold");
    expect(tones("elementalist").at(-1)).toBe("hair");
  });

  it("spikes the necromancer in bone, plumes the mesmer's hat, crosses blades on the assassin's back (#4179)", () => {
    const tones = (primary: "necromancer" | "mesmer" | "assassin"): StackTone[] =>
      standing(outfitOf(primary)).map((slice) => slice.tone);
    // Both cowls hide the face in the dark.
    expect(tones("necromancer")).toContain("bone");
    expect(tones("necromancer")).toContain("visor");
    expect(tones("necromancer")).not.toContain("metal");
    expect(tones("mesmer").at(-1)).toBe("crest");
    expect(tones("mesmer")).not.toContain("visor");
    expect(tones("assassin")).toContain("visor");
    expect(tones("assassin")).toContain("metal");
    expect(tones("assassin")).not.toContain("bone");
    expect(stackTones(0x59c2ff, undefined, outfitOf("necromancer"), undefined).bone).toBe(0xd8d0b8);
  });

  it("feathers the ritualist, tabards the paragon with spears on its back, turbans the dervish (#4180)", () => {
    const tones = (primary: "warrior" | "ritualist" | "paragon" | "dervish"): StackTone[] =>
      standing(outfitOf(primary)).map((slice) => slice.tone);
    expect(tones("ritualist").at(-1)).toBe("gold");
    expect(tones("ritualist")).toContain("crest");
    expect(tones("ritualist")).not.toContain("visor");
    // The paragon's helm and pauldrons, its tabard's cloth and its spears' shafts.
    expect(tones("paragon")).toContain("visor");
    expect(tones("paragon")).toContain("cloth");
    expect(tones("paragon")).toContain("leather");
    expect(tones("warrior")).not.toContain("cloth");
    expect(tones("dervish").at(-1)).toBe("gold");
    expect(tones("dervish")).not.toContain("hair");
  });
});

describe("pet and NPC figures (#4173)", () => {
  const WALKERS = ["beast", "rat", "guard", "priest", "guild-lord"] as const;

  it("turns every pet and NPC in 8 headings and walks it in 3 poses, each stride its own figure", () => {
    for (const look of WALKERS) {
      const stack = creatureStack(look);
      expect(stack?.headings).toBe(8);
      expect(stack?.poses).toEqual(["stand", "stride-a", "stride-b"]);
      for (const pose of stack?.poses ?? []) {
        expect((creatureSlices(look, pose) ?? []).length).toBeGreaterThan(0);
      }
      expect(creatureSlices(look, "stride-a")).not.toEqual(creatureSlices(look, "stride-b"));
    }
  });

  it("swaps a beast's diagonal legs in a stride and keeps the rest of it still", () => {
    const [a, b, still] = (["stride-a", "stride-b", "stand"] as const).map(
      (pose) => creatureSlices("beast", pose) ?? [],
    );
    const legs = (slices: readonly StackSlice<number>[]): readonly StackSlice<number>[] =>
      slices.slice(0, 3);
    expect(legs(a ?? [])).not.toEqual(legs(b ?? []));
    expect(legs(a ?? [])).not.toEqual(legs(still ?? []));
    // The body, head and ears do not stride; only the tail sways.
    const body = (slices: readonly StackSlice<number>[]): readonly StackSlice<number>[] =>
      slices.slice(3, 8);
    expect(body(a ?? [])).toEqual(body(b ?? []));
  });

  it("gives a rat a longer tail than a beast, and no ears", () => {
    const tail = (look: "beast" | "rat"): number =>
      (creatureSlices(look, "stand") ?? []).filter((slice) =>
        slice.parts.every((part) => part.every((p) => p.x < -0.6)),
      ).length;
    expect(tail("rat")).toBeGreaterThan(tail("beast"));
    const triangles = (look: "beast" | "rat"): number =>
      (creatureSlices(look, "stand") ?? []).filter((slice) =>
        slice.parts.some((part) => part.length === 3),
      ).length;
    expect(triangles("beast")).toBe(1);
    expect(triangles("rat")).toBe(0);
  });

  it("raises a guard's spear from the hand to over its helmet, beside a shield", () => {
    const slices = creatureSlices("guard", "stand") ?? [];
    const haft = slices.filter((slice) => slice.tone === 0x6a4a2c);
    expect(haft[0]?.lift).toBe(8);
    // Its helmet, crestless, tops out a lift under a body's; the spear clears it.
    const helmet = Math.max(
      ...slices.filter((slice) => slice.tone === 0x9aa0a8).map((slice) => slice.lift),
    );
    const tip = slices.filter((slice) => slice.tone === 0xc9ced6);
    expect(tip.length).toBe(3);
    expect(Math.min(...tip.map((slice) => slice.lift))).toBeGreaterThan(helmet);
    expect(slices.some((slice) => slice.tone === 0xc9a227)).toBe(true);
  });

  it("stands a guild lord 1.25 of a warrior's height, helm to feet (#4173)", () => {
    const height = (layers: readonly { points: readonly { y: number }[] }[]): number => {
      const ys = layers.flatMap((layer) => layer.points.map((p) => p.y));
      return Math.max(...ys) - Math.min(...ys);
    };
    const warrior = PROFESSION_OUTFITS.warrior;
    const body = stackLayers(
      stackSlices("stand", warrior, undefined),
      0,
      STACK_BAKE_RADIUS,
      stackTones(0x59c2ff, undefined, warrior, undefined),
    );
    const lord = creatureLayers(
      creatureSlices("guild-lord", "stand") ?? [],
      0,
      CREATURE_DRAWN_RADIUS["guild-lord"],
    );
    expect(height(lord) / height(body)).toBeCloseTo(1.25, 2);
  });

  it("wears no cape, crest or team on a guard or a priest; a guild lord its red cape", () => {
    const tones = (look: "guard" | "priest" | "guild-lord"): Set<number> =>
      new Set((creatureSlices(look, "stand") ?? []).map((slice) => slice.tone));
    for (const look of ["guard", "priest"] as const) {
      expect(tones(look).has(0x8a2a2a)).toBe(false);
    }
    expect(tones("guild-lord").has(0x8a2a2a)).toBe(true);
    // A guard is steel, never a body's friend or foe colour.
    expect(tones("guard").has(0x6c727c)).toBe(true);
    expect(stackLifts(creatureSlices("guard", "stand") ?? [])).toBe(
      stackLifts(creatureSlices("guard", "stride-a") ?? []),
    );
  });
});
