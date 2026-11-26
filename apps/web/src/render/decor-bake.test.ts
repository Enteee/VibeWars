import { describe, expect, it } from "vitest";

import { BIOME } from "./arena-palette.js";
import { decorCommands, decorShadow, type MapDecor } from "./decor-art.js";
import {
  DECOR_TEXTURE_MAX_SIDE,
  DECOR_TEXTURE_SCALE,
  DecorTextureKeys,
  decorBounds,
  packDecor,
  type DecorRect,
  type DecorSlot,
} from "./decor-bake.js";

const crates: MapDecor = {
  kind: "crates",
  at: { x: 400, y: 300 },
  layer: 0,
  rotation: 30,
  scale: 1.5,
  variant: 2,
  wading: false,
};

/** Whether two slots on one sheet share a pixel. */
function overlap(a: DecorSlot, b: DecorSlot): boolean {
  return (
    a.sheet === b.sheet &&
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

describe("decorBounds (#4017)", () => {
  it("holds every point a prop paints, lifted to its layer", () => {
    const commands = decorCommands(crates, BIOME.hall.decor, 0, true);
    const lift = 24;
    const box = decorBounds(commands, lift);
    for (const command of commands) {
      const points =
        command.kind === "poly" || command.kind === "outline"
          ? command.points
          : command.kind === "line"
            ? [command.from, command.to]
            : [command.at];
      for (const { x, y } of points) {
        expect(x).toBeGreaterThanOrEqual(box.x);
        expect(x).toBeLessThanOrEqual(box.x + box.width);
        expect(y - lift).toBeGreaterThanOrEqual(box.y);
        expect(y - lift).toBeLessThanOrEqual(box.y + box.height);
      }
    }
  });

  it("holds a shadow's whole ellipse", () => {
    const shadow = decorShadow(crates);
    const box = decorBounds([shadow], 0);
    if (shadow.kind !== "ellipse") {
      throw new Error("a shadow is an ellipse");
    }
    expect(box.x).toBeLessThan(shadow.at.x - shadow.rx);
    expect(box.x + box.width).toBeGreaterThan(shadow.at.x + shadow.rx);
    expect(box.y).toBeLessThan(shadow.at.y - shadow.ry);
    expect(box.y + box.height).toBeGreaterThan(shadow.at.y + shadow.ry);
  });
});

describe("packDecor (#4017)", () => {
  it("gives each prop a slot of its size, at the bake's scale", () => {
    const rects: DecorRect[] = [
      { x: 0, y: 0, width: 30, height: 20 },
      { x: 500, y: 90, width: 12.2, height: 41 },
    ];
    const { slots, sheets } = packDecor(rects);
    expect(sheets).toHaveLength(1);
    expect(slots.map(({ width, height }) => [width, height])).toEqual([
      [30 * DECOR_TEXTURE_SCALE, 20 * DECOR_TEXTURE_SCALE],
      [Math.ceil(12.2 * DECOR_TEXTURE_SCALE), 41 * DECOR_TEXTURE_SCALE],
    ]);
    const [first, second] = slots;
    expect(first !== undefined && second !== undefined && overlap(first, second)).toBe(false);
  });

  it("keeps every sheet within the largest side a GPU takes, splitting into more", () => {
    // 400 props of 60×60 world units: about four sheets' worth at scale 2.
    const rects = Array.from({ length: 400 }, (_, at) => ({
      x: at * 10,
      y: 0,
      width: 60,
      height: 60,
    }));
    const { slots, sheets } = packDecor(rects);
    expect(sheets.length).toBeGreaterThan(1);
    for (const sheet of sheets) {
      expect(sheet.width).toBeLessThanOrEqual(DECOR_TEXTURE_MAX_SIDE);
      expect(sheet.height).toBeLessThanOrEqual(DECOR_TEXTURE_MAX_SIDE);
    }
    expect(slots).toHaveLength(rects.length);
    slots.forEach((slot, at) => {
      const size = sheets[slot.sheet];
      expect(size).toBeDefined();
      expect(slot.left + slot.width).toBeLessThanOrEqual(size?.width ?? 0);
      expect(slot.top + slot.height).toBeLessThanOrEqual(size?.height ?? 0);
      for (const other of slots.slice(at + 1)) {
        expect(overlap(slot, other)).toBe(false);
      }
    });
  });

  it("packs to a small side when asked, as a phone would cap it", () => {
    const rects = Array.from({ length: 60 }, () => ({ x: 0, y: 0, width: 20, height: 20 }));
    const { sheets } = packDecor(rects, 2, 256);
    expect(sheets.length).toBeGreaterThan(1);
    expect(Math.max(...sheets.flatMap(({ width, height }) => [width, height]))).toBeLessThanOrEqual(
      256,
    );
  });

  it("refuses a prop larger than a sheet", () => {
    expect(() => packDecor([{ x: 0, y: 0, width: 2000, height: 10 }])).toThrow(/fits no sheet/);
  });

  it("makes no sheet for no props", () => {
    expect(packDecor([])).toEqual({ sheets: [], slots: [] });
  });
});

describe("DecorTextureKeys", () => {
  it("removes every key it made when dropped, and makes none twice", () => {
    const keys = new DecorTextureKeys("decor");
    const made = [keys.next(), keys.next(), keys.next()];
    expect(new Set(made).size).toBe(3);
    const removed: string[] = [];
    keys.drop((key) => removed.push(key));
    expect(removed).toEqual(made);
    expect(keys.size).toBe(0);
    expect(made).not.toContain(keys.next());
  });
});
