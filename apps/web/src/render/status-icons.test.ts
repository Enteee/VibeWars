import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { STATUS_DEFINITIONS, isStatusId } from "@vibewars/game-core";

import { STATUS_ICON_SIZE } from "./arena-atlas.js";
import { STATUS_ICON, statusRowLayout } from "./status-icons.js";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

describe("STATUS_ICON", () => {
  it("has a file under public/ for every status the game has", () => {
    for (const id of Object.keys(STATUS_DEFINITIONS).filter(isStatusId)) {
      const url = STATUS_ICON[id];
      expect(url, id).toBe(`/icons/status/${id}.svg`);
      expect(fs.existsSync(path.join(PUBLIC, url)), url).toBe(true);
    }
  });
});

describe("statusRowLayout", () => {
  const x = 100;
  const y = 200;
  const radius = 14;
  const rowY = y + radius + 6 + STATUS_ICON_SIZE / 2;

  it("centres one icon under the actor", () => {
    expect(statusRowLayout(1, x, y, radius)).toEqual({
      icons: [{ x: 100, y: rowY }],
      overflow: undefined,
    });
  });

  it("lays six out in one centred row, 2 px apart", () => {
    const row = statusRowLayout(6, x, y, radius);
    expect(row.overflow).toBeUndefined();
    // 6 × 16 + 5 × 2 = 106 wide, so the first centre is 53 − 8 left of x.
    expect(row.icons.map((p) => p.x)).toEqual([55, 73, 91, 109, 127, 145]);
    expect(row.icons.every((p) => p.y === rowY)).toBe(true);
  });

  it("shows five and then +N past six", () => {
    const row = statusRowLayout(7, x, y, radius);
    expect(row.icons.map((p) => p.x)).toEqual([55, 73, 91, 109, 127]);
    expect(row.overflow).toEqual({ count: 2, position: { x: 145, y: rowY } });
  });
});
