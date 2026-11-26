import { DECOR_KINDS } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { BIOME, WATER_LOOK, grade, ungradedMaterials } from "./arena-palette.js";
import {
  DECOR_SWAY,
  animatedDecor,
  brazierFlicker,
  decorCommands,
  decorOutline,
  decorShadow,
  decorSway,
  tallDecor,
  type DecorCommand,
  type MapDecor,
} from "./decor-art.js";

const prop = (kind: MapDecor["kind"], variant = 0): MapDecor => ({
  kind,
  at: { x: 400, y: 300 },
  layer: 0,
  rotation: 30,
  scale: 1,
  variant,
  wading: false,
});

/** How light `colour` is, 0 to 255: its channels' mean. */
function lightness(colour: number): number {
  return (((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff)) / 3;
}

/** Every coordinate a stroke has. */
function numbers(command: DecorCommand): number[] {
  switch (command.kind) {
    case "poly":
    case "outline":
      return command.points.flatMap(({ x, y }) => [x, y]);
    case "ellipse":
      return [command.at.x, command.at.y, command.rx, command.ry];
    case "line":
      return [command.from.x, command.from.y, command.to.x, command.to.y, command.width];
  }
}

describe("decor art (#4013)", () => {
  it("draws every kind, every variant, in every biome's colours", () => {
    for (const [biome, materials] of Object.entries(BIOME)) {
      for (const kind of DECOR_KINDS) {
        for (const variant of [0, 1, 2, 3]) {
          const commands = decorCommands(prop(kind, variant), materials.decor, 1.7, false);
          expect(commands.length, `${biome} ${kind} ${String(variant)}`).toBeGreaterThan(2);
          for (const value of [...commands, decorShadow(prop(kind, variant))].flatMap(numbers)) {
            expect(Number.isFinite(value)).toBe(true);
          }
        }
      }
    }
  });

  it("casts every standing prop's shadow toward +x +y, from the north-west light", () => {
    for (const kind of DECOR_KINDS.filter((kind) => kind !== "cinders")) {
      const shadow = decorShadow(prop(kind));
      expect(shadow.kind).toBe("ellipse");
      if (shadow.kind === "ellipse") {
        expect(shadow.at.x).toBeGreaterThan(400);
        expect(shadow.at.y).toBeGreaterThan(300);
      }
    }
  });

  it("lays a cinder drift's scorch flat under it, 120 u across at scale 1 (#4018)", () => {
    const shadow = decorShadow(prop("cinders"));
    expect(shadow).toMatchObject({ kind: "ellipse", at: { x: 400, y: 300 } });
    const { decor } = BIOME.volcanic;
    const xs = decorCommands({ ...prop("cinders"), rotation: 0 }, decor, 0, true).flatMap(
      (command) =>
        command.kind === "ellipse" ? [command.at.x - command.rx, command.at.x + command.rx] : [],
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, -1);
  });

  it("keeps a cinder drift's embers small and inside it, the ash never glowing (#4018)", () => {
    const { decor } = BIOME.volcanic;
    for (const variant of [0, 1, 2, 3]) {
      for (const command of decorCommands(prop("cinders", variant), decor, 0, false)) {
        if (command.kind === "outline") {
          continue;
        }
        if (command.kind !== "ellipse") {
          throw new Error("a drift is drawn in ellipses and its outline");
        }
        const ash = [decor.ash, decor.ashLit, decor.ashShade].includes(command.colour);
        expect(command.glow).toBe(!ash);
        if (command.glow) {
          expect(command.rx).toBeLessThanOrEqual(3);
          expect(Math.abs(command.at.x - 400)).toBeLessThan(60);
          expect(Math.abs(command.at.y - 300)).toBeLessThan(30);
        }
      }
    }
  });

  it("holds a moving prop at its mean under reduced motion, and moves it otherwise", () => {
    const { decor } = BIOME.jungle;
    for (const kind of DECOR_KINDS.filter(animatedDecor)) {
      const still = decorCommands(prop(kind), decor, 0.4, true);
      expect(decorCommands(prop(kind), decor, 2.9, true)).toEqual(still);
      expect(decorCommands(prop(kind), decor, 2.9, false)).not.toEqual(
        decorCommands(prop(kind), decor, 0.4, false),
      );
    }
    expect(decorSway(prop("tree"), 1.2, true)).toBe(0);
    expect(brazierFlicker(prop("brazier"), 1.2, true)).toBe(
      brazierFlicker(prop("brazier"), 9, true),
    );
  });

  it("sways a crown or a frond no further than DECOR_SWAY", () => {
    for (let now = 0; now < 6; now += 0.1) {
      expect(Math.abs(decorSway(prop("tree"), now, false))).toBeLessThanOrEqual(DECOR_SWAY);
      expect(Math.abs(decorSway(prop("fern"), now, false))).toBeLessThanOrEqual(DECOR_SWAY);
    }
  });

  it("draws a still prop the same at any time", () => {
    const { decor } = BIOME.hall;
    for (const kind of DECOR_KINDS.filter((kind) => !animatedDecor(kind))) {
      expect(decorCommands(prop(kind), decor, 3, false)).toEqual(
        decorCommands(prop(kind), decor, 0, false),
      );
    }
  });

  it("gives a tall prop an outline to fade over, standing above its foot", () => {
    for (const kind of DECOR_KINDS) {
      const outline = decorOutline(prop(kind));
      if (!tallDecor(kind)) {
        expect(outline).toEqual([]);
        continue;
      }
      expect(outline).toHaveLength(4);
      expect(Math.min(...outline.map(({ y }) => y))).toBeLessThan(300 - 60);
      expect(Math.max(...outline.map(({ y }) => y))).toBeGreaterThan(300);
    }
  });
});

describe("decor in the gothic look (#4059)", () => {
  it("outlines every kind's top, every variant, in 1 px of near-black", () => {
    for (const kind of DECOR_KINDS) {
      for (const variant of [0, 1, 2, 3]) {
        const outlines = decorCommands(prop(kind, variant), BIOME.hall.decor, 0, true).filter(
          (command) => command.kind === "outline",
        );
        expect(outlines.length, `${kind} ${String(variant)}`).toBeGreaterThan(0);
        for (const command of outlines) {
          expect(command).toMatchObject({ colour: 0x08080a, width: 1, alpha: 1 });
        }
      }
    }
  });

  it("grades every decor colour but its fire, which stays a light", () => {
    for (const [biome, materials] of Object.entries(BIOME)) {
      const { decor: before } = ungradedMaterials(biome as keyof typeof BIOME);
      const { decor } = materials;
      expect(decor.wood, biome).toBe(grade(before.wood));
      expect(decor.trunk, biome).toBe(grade(before.trunk));
      expect(decor.leaves, biome).toEqual(before.leaves.map(grade));
      expect(decor.iron, biome).toBe(grade(before.iron));
      expect(decor.ash, biome).toBe(grade(before.ash));
      expect(decor.flame, biome).toEqual(before.flame);
      expect(decor.ember, biome).toBe(before.ember);
    }
  });

  it("grades a crown from its dark, low blob to its light one on top", () => {
    const leaves = BIOME.wilds.decor.leaves;
    expect(leaves).toHaveLength(4);
    for (let k = 1; k < leaves.length; k++) {
      expect(lightness(leaves[k] ?? 0)).toBeGreaterThan(lightness(leaves[k - 1] ?? 0));
    }
  });

  it("darkens a crate's side toward the ground, its lid the lightest", () => {
    const { decor } = BIOME.hall;
    const polys = decorCommands(prop("crates"), decor, 0, true).flatMap((command) =>
      command.kind === "poly" && command.colour !== decor.woodBand ? [command] : [],
    );
    const lowest = polys.reduce((low, command) =>
      Math.max(...command.points.map(({ y }) => y)) > Math.max(...low.points.map(({ y }) => y))
        ? command
        : low,
    );
    const lid = polys.at(-1);
    expect(lid?.colour).toBe(decor.wood);
    expect(lightness(lowest.colour)).toBeLessThan(lightness(decor.wood) * 0.7);
  });

  it("stacks a brazier's flame from deep red at its foot to pale gold at its tip", () => {
    const { decor } = BIOME.hall;
    const flame = decorCommands(prop("brazier"), decor, 0, true).filter(
      (command) => command.kind === "poly" && command.glow,
    );
    expect(flame.map((command) => (command.kind === "poly" ? command.colour : 0))).toEqual(
      decor.flame,
    );
    expect(decor.flame[0]).toBe(0xd8401a);
    expect(decor.flame.at(-1)).toBe(0xffe890);
  });
});

describe("reeds (#4019)", () => {
  const { decor } = BIOME.marsh;
  /** Every x a command reaches, an ellipse at its edges. */
  const xs = (command: DecorCommand): number[] =>
    command.kind === "ellipse"
      ? [command.at.x - command.rx, command.at.x + command.rx]
      : numbers(command).filter((_, k) => k % 2 === 0 && command.kind !== "line");

  it("stands a clump about 50 u across at scale 1, low enough to stay under a crown", () => {
    for (const variant of [0, 1, 2, 3]) {
      const commands = decorCommands(prop("reed", variant), decor, 0, true);
      const across = commands.flatMap(xs);
      expect(Math.max(...across) - Math.min(...across)).toBeGreaterThan(35);
      expect(Math.max(...across) - Math.min(...across)).toBeLessThan(65);
      const ys = commands.flatMap((command) =>
        command.kind === "poly" ? command.points.map(({ y }) => y) : [],
      );
      // 30 u of blade, from a foot up to 5 u behind the clump's.
      expect(300 - Math.min(...ys)).toBeLessThanOrEqual(35);
      expect(tallDecor("reed")).toBe(false);
    }
  });

  it("sways a reed's tips no further than DECOR_SWAY, on a 3 s beat", () => {
    for (let now = 0; now < 6; now += 0.1) {
      expect(Math.abs(decorSway(prop("reed"), now, false))).toBeLessThanOrEqual(DECOR_SWAY);
    }
    expect(decorSway(prop("reed"), 0.7, false)).toBeCloseTo(decorSway(prop("reed"), 3.7, false));
    expect(animatedDecor("reed")).toBe(true);
  });

  it("draws a wading reed's foot under shallow water's tint and ripple, a dry one's not", () => {
    const dry = decorCommands(prop("reed"), decor, 0, true);
    const wet = decorCommands({ ...prop("reed"), wading: true }, decor, 0, true);
    const tint = (command: DecorCommand): boolean =>
      command.kind === "ellipse" && command.colour === WATER_LOOK.shallow.fill;
    expect(dry.some(tint)).toBe(false);
    // Over the blades: drawn after every one of them.
    const at = wet.findIndex(tint);
    expect(at).toBeGreaterThan(wet.findLastIndex((command) => command.kind === "poly"));
    expect(wet.slice(at + 1).every((command) => command.kind === "line")).toBe(true);
    expect(wet.slice(at + 1)).not.toHaveLength(0);
  });
});
