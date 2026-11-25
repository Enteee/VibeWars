import { DECOR_KINDS } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { BIOME } from "./arena-palette.js";
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
});

/** Every coordinate a stroke has. */
function numbers(command: DecorCommand): number[] {
  switch (command.kind) {
    case "poly":
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

  it("casts every shadow toward +x +y, from the north-west light", () => {
    for (const kind of DECOR_KINDS) {
      const shadow = decorShadow(prop(kind));
      expect(shadow.kind).toBe("ellipse");
      if (shadow.kind === "ellipse") {
        expect(shadow.at.x).toBeGreaterThan(400);
        expect(shadow.at.y).toBeGreaterThan(300);
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
