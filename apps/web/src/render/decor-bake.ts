import type { DecorCommand } from "./decor-art.js";

/**
 * Still decor baked into textures (#4017): every shadow and every prop
 * that does not move is painted once into a sheet per layer, band and
 * part, and shown as images of it, which cost the frame nothing to
 * redraw. Phaser-free: which rectangle of which sheet a prop takes is
 * worked out here, so the packing is tested without it.
 */

/** Pixels per world unit of a baked prop: sharp at the closest zoom, as a zone's ground is. */
export const DECOR_TEXTURE_SCALE = 2;
/** The longest side of a sheet, in pixels: what a phone's GPU still takes. */
export const DECOR_TEXTURE_MAX_SIDE = 2048;
/** Clear pixels around each prop on its sheet, so no neighbour bleeds into it when filtered. */
const GUTTER = 2;
/** World units around a prop's strokes: a line's half width and the edge's antialiasing. */
const MARGIN = 2;

/** A rectangle in world units. */
export interface DecorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Where one prop is on its sheet, in whole pixels. */
export interface DecorSlot {
  readonly sheet: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The sheets of one layer, band and part, and each prop's place on them. */
export interface DecorSheets {
  /** Each sheet's size in pixels. */
  readonly sheets: readonly { readonly width: number; readonly height: number }[];
  /** One per rectangle asked for, in the same order. */
  readonly slots: readonly DecorSlot[];
}

/** Where `commands` paint, lifted by `lift`, with a margin: what a prop's slot must hold. */
export function decorBounds(commands: readonly DecorCommand[], lift: number): DecorRect {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  const take = (x: number, y: number, reach: number): void => {
    left = Math.min(left, x - reach);
    right = Math.max(right, x + reach);
    top = Math.min(top, y - lift - reach);
    bottom = Math.max(bottom, y - lift + reach);
  };
  for (const command of commands) {
    switch (command.kind) {
      case "poly":
        for (const point of command.points) {
          take(point.x, point.y, MARGIN);
        }
        break;
      case "ellipse":
        take(command.at.x - command.rx, command.at.y - command.ry, MARGIN);
        take(command.at.x + command.rx, command.at.y + command.ry, MARGIN);
        break;
      case "line":
        take(command.from.x, command.from.y, MARGIN + command.width / 2);
        take(command.to.x, command.to.y, MARGIN + command.width / 2);
        break;
    }
  }
  if (left > right) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * `rects` packed in rows onto sheets of at most `maxSide` pixels a side,
 * at `scale` pixels per world unit, tallest first so the rows stay tight.
 * A sheet is only as large as what it holds. One rectangle too large for
 * a sheet is an error: no prop is.
 */
export function packDecor(
  rects: readonly DecorRect[],
  scale = DECOR_TEXTURE_SCALE,
  maxSide = DECOR_TEXTURE_MAX_SIDE,
): DecorSheets {
  const sized = rects.map(({ width, height }, at) => ({
    at,
    width: Math.ceil(width * scale),
    height: Math.ceil(height * scale),
  }));
  const tallestFirst = [...sized].sort((a, b) => b.height - a.height);
  const sheets: { width: number; height: number }[] = [];
  const slots = new Array<DecorSlot>(rects.length);
  let sheet: { width: number; height: number } | undefined;
  let x = 0;
  let rowTop = 0;
  let rowHeight = 0;
  for (const { at, width, height } of tallestFirst) {
    // A slot's own gutter, before it, and the sheet's last, after it.
    if (width + 2 * GUTTER > maxSide || height + 2 * GUTTER > maxSide) {
      throw new Error(`decor: a prop of ${String(width)}×${String(height)} px fits no sheet`);
    }
    if (x + width + 2 * GUTTER > maxSide) {
      x = 0;
      rowTop += rowHeight;
      rowHeight = 0;
    }
    if (sheet === undefined || rowTop + height + 2 * GUTTER > maxSide) {
      sheet = { width: 0, height: 0 };
      sheets.push(sheet);
      x = 0;
      rowTop = 0;
      rowHeight = 0;
    }
    slots[at] = { sheet: sheets.length - 1, left: x + GUTTER, top: rowTop + GUTTER, width, height };
    x += width + GUTTER;
    rowHeight = Math.max(rowHeight, height + GUTTER);
    sheet.width = Math.max(sheet.width, x + GUTTER);
    sheet.height = Math.max(sheet.height, rowTop + rowHeight + GUTTER);
  }
  return { sheets, slots };
}
