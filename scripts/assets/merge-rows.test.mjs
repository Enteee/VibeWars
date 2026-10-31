import { describe, expect, it } from "vitest";

import { mergeRows } from "./merge-rows.mjs";
import { SKILL_ICON_TABLES } from "./skill-icon-table.mjs";
import { STATUS_ICON_TABLES } from "./status-icon-table.mjs";

describe("mergeRows (#1705)", () => {
  it("joins tables with distinct ids", () => {
    const merged = mergeRows({ a: { "a.x": 1 }, b: { "b.y": 2 } }, { prefixed: true });
    expect(merged).toEqual({ "a.x": 1, "b.y": 2 });
  });

  it("throws on an id in two files, naming both", () => {
    expect(() => mergeRows({ a: { x: 1 }, b: { x: 1 } }, { prefixed: false })).toThrow(
      'icon row "x" is in a.mjs and b.mjs',
    );
  });

  it("throws on a row in the wrong file when ids are prefixed", () => {
    expect(() => mergeRows({ ranger: { "monk.heal": 1 } }, { prefixed: true })).toThrow(
      'icon row "monk.heal" is in ranger.mjs but belongs to "monk"',
    );
  });

  it("passes the real tables", () => {
    expect(() => mergeRows(SKILL_ICON_TABLES, { prefixed: true })).not.toThrow();
    expect(() => mergeRows(STATUS_ICON_TABLES, { prefixed: false })).not.toThrow();
  });
});
