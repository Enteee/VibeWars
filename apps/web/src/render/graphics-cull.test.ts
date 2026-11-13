import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type Phaser from "phaser";
import { describe, expect, it } from "vitest";

import {
  COMMANDS,
  StaticGraphicsCull,
  culledCommands,
  cullToView,
  planCull,
  type Box,
  type Command,
} from "./graphics-cull.js";

const {
  ARC,
  BEGIN_PATH,
  CLOSE_PATH,
  FILL_PATH,
  FILL_RECT,
  FILL_STYLE,
  LINE_STYLE,
  LINE_TO,
  MOVE_TO,
  RESTORE,
  SAVE,
  SCALE,
  STROKE_PATH,
  TRANSLATE,
} = COMMANDS;

/** A filled square path, `size` wide, its corner at `x`, `y`. */
function square(x: number, y: number, size = 10): Command[] {
  return [
    BEGIN_PATH,
    MOVE_TO,
    x,
    y,
    LINE_TO,
    x + size,
    y,
    LINE_TO,
    x + size,
    y + size,
    LINE_TO,
    x,
    y + size,
    CLOSE_PATH,
    FILL_PATH,
  ];
}

const VIEW: Box = { left: 0, top: 0, right: 100, bottom: 100 };

function cut(commands: Command[], view: Box = VIEW): Command[] {
  return culledCommands(planCull(commands), view);
}

describe("cutting a Graphics' commands to a view (#3240)", () => {
  it("knows Phaser's opcodes", () => {
    const phaser = dirname(createRequire(import.meta.url).resolve("phaser/package.json"));
    const source = readFileSync(join(phaser, "src/gameobjects/graphics/Commands.js"), "utf8");
    const opcodes = Object.fromEntries(
      [...source.matchAll(/^\s+([A-Z_]+): (\d+),?$/gmu)].map(([, name, value]) => [
        name,
        Number(value),
      ]),
    );
    expect(opcodes).toEqual(COMMANDS);
  });

  it("drops a path off the view and keeps the styles around it", () => {
    const commands = [
      FILL_STYLE,
      0xff0000,
      1,
      ...square(500, 500),
      FILL_STYLE,
      0x00ff00,
      1,
      ...square(10, 10),
    ];
    expect(cut(commands)).toEqual([
      FILL_STYLE,
      0xff0000,
      1,
      FILL_STYLE,
      0x00ff00,
      1,
      ...square(10, 10),
    ]);
  });

  it("keeps everything, in order, when the view covers it all", () => {
    const commands = [
      FILL_STYLE,
      0xff0000,
      1,
      ...square(10, 10),
      FILL_RECT,
      20,
      20,
      5,
      5,
      LINE_STYLE,
      2,
      0,
      1,
      ...square(50, 50),
      STROKE_PATH,
    ];
    expect(cut(commands)).toEqual(commands);
  });

  it("places a draw where its transform puts it, as a deck's height does", () => {
    const lifted = [SAVE, TRANSLATE, 0, -900, ...square(10, 950), RESTORE];
    expect(cut(lifted)).toEqual(lifted);
    expect(cut([...lifted, ...square(10, 950)])).toEqual(lifted);
    const scaled = [SAVE, SCALE, 10, 10, ...square(50, 50), RESTORE];
    expect(cut(scaled)).toEqual([SAVE, SCALE, 10, 10, RESTORE]);
  });

  it("transforms a path by the transform it is filled under, as Phaser does", () => {
    const commands = [
      BEGIN_PATH,
      MOVE_TO,
      10,
      500,
      LINE_TO,
      20,
      510,
      TRANSLATE,
      0,
      -450,
      FILL_PATH,
    ];
    expect(cut(commands)).toEqual(commands);
  });

  it("grows a stroke by its width", () => {
    const line = [
      LINE_STYLE,
      30,
      0,
      1,
      BEGIN_PATH,
      MOVE_TO,
      120,
      10,
      LINE_TO,
      120,
      50,
      STROKE_PATH,
    ];
    expect(cut(line)).toEqual(line);
    const thin = [LINE_STYLE, 1, 0, 1, BEGIN_PATH, MOVE_TO, 120, 10, LINE_TO, 120, 50, STROKE_PATH];
    expect(cut(thin)).toEqual([LINE_STYLE, 1, 0, 1]);
  });

  it("sizes an arc by its radius", () => {
    const circle = [BEGIN_PATH, ARC, 150, 50, 60, 0, Math.PI * 2, false, 0, FILL_PATH];
    expect(cut(circle)).toEqual(circle);
    expect(cut(circle, { left: 0, top: 0, right: 80, bottom: 100 })).toEqual([]);
  });

  it("keeps a path's fill and stroke together, and the style between them", () => {
    const commands = [...square(500, 500), LINE_STYLE, 1, 0, 1, STROKE_PATH];
    expect(cut(commands)).toEqual([LINE_STYLE, 1, 0, 1]);
    const near = [...square(90, 90), LINE_STYLE, 1, 0, 1, STROKE_PATH];
    expect(cut(near)).toEqual(near);
  });

  it("cuts a rectangle on its own, inside a path it does not belong to", () => {
    const commands = [
      ...square(10, 10),
      FILL_RECT,
      500,
      500,
      5,
      5,
      LINE_STYLE,
      1,
      0,
      1,
      STROKE_PATH,
    ];
    expect(cut(commands)).toEqual([...square(10, 10), LINE_STYLE, 1, 0, 1, STROKE_PATH]);
  });

  it("cuts nothing from a list with a command it does not know", () => {
    const commands = [...square(500, 500), 99, ...square(10, 10)];
    expect(cut(commands)).toEqual(commands);
  });
});

/** A Graphics as the cut sees one: its command list. */
function graphics(commands: Command[]): Phaser.GameObjects.Graphics {
  return { commandBuffer: commands } as unknown as Phaser.GameObjects.Graphics;
}

describe("the static graphics cut (#3240)", () => {
  it("cuts each captured graphics to the view and a reach around it", () => {
    const g = graphics([...square(10, 10), ...square(120, 10), ...square(400, 10)]);
    const cull = new StaticGraphicsCull();
    cull.capture([g]);
    cull.cull(VIEW);
    expect(g.commandBuffer).toEqual([...square(10, 10), ...square(120, 10)]);
  });

  it("cuts again only once the view leaves the last cut, from what was drawn", () => {
    const g = graphics([...square(10, 10), ...square(400, 10)]);
    const cull = new StaticGraphicsCull();
    cull.capture([g]);
    cull.cull(VIEW);
    const first: unknown = g.commandBuffer;
    cull.cull({ left: 5, top: 0, right: 105, bottom: 100 });
    expect(g.commandBuffer).toBe(first);
    cull.cull({ left: 350, top: 0, right: 450, bottom: 100 });
    expect(g.commandBuffer).toEqual(square(400, 10));
  });

  it("starts over from a fresh capture, as when the map is drawn again", () => {
    const g = graphics([...square(10, 10)]);
    const cull = new StaticGraphicsCull();
    cull.capture([g]);
    cull.cull(VIEW);
    g.commandBuffer = [...square(20, 20), ...square(900, 900)];
    cull.capture([g]);
    cull.cull(VIEW);
    expect(g.commandBuffer).toEqual(square(20, 20));
  });
});

describe("cutting a graphics drawn this frame (#3240)", () => {
  it("leaves out what it drew off the view", () => {
    const g = graphics([FILL_STYLE, 0, 1, ...square(10, 10), ...square(700, 10)]);
    cullToView(g, VIEW);
    expect(g.commandBuffer).toEqual([FILL_STYLE, 0, 1, ...square(10, 10)]);
  });
});
