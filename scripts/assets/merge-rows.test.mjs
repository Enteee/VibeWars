import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { GLYPHS, MODIFIERS } from "./glyph-table.mjs";
import { loadDirectories, loadTables, mergeRows } from "./merge-rows.mjs";
import { SKILL_ICON_TABLES } from "./skill-icon-table.mjs";
import { STATUS_ICON_TABLES } from "./status-icon-table.mjs";

/** @type {string[]} */
const made = [];

/** A temporary directory of `files`, by path, each a module of `rows` (#2021). @param {Record<string, object>} files */
const tablesDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "merge-rows-"));
  made.push(dir);
  for (const [file, rows] of Object.entries(files)) {
    mkdirSync(join(dir, file, ".."), { recursive: true });
    writeFileSync(join(dir, file), `export default ${JSON.stringify(rows)};\n`);
  }
  return pathToFileURL(`${dir}/`);
};

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("mergeRows (#1705)", () => {
  it("joins tables with distinct ids", () => {
    const merged = mergeRows({ a: { "a.x": 1 }, b: { "b.y": 2 } }, { prefixed: true, what: "row" });
    expect(merged).toEqual({ "a.x": 1, "b.y": 2 });
  });

  it("throws on an id in two files, naming both", () => {
    expect(() =>
      mergeRows({ a: { x: 1 }, b: { x: 1 } }, { prefixed: false, what: "icon row" }),
    ).toThrow('icon row "x" is in a.mjs and b.mjs');
  });

  it("throws on a row in the wrong file when ids are prefixed", () => {
    expect(() =>
      mergeRows({ ranger: { "monk.heal": 1 } }, { prefixed: true, what: "icon row" }),
    ).toThrow('icon row "monk.heal" is in ranger but belongs to "monk"');
  });

  it("passes the real tables", () => {
    expect(() => mergeRows(SKILL_ICON_TABLES, { prefixed: true, what: "icon row" })).not.toThrow();
    expect(() =>
      mergeRows(STATUS_ICON_TABLES, { prefixed: false, what: "icon row" }),
    ).not.toThrow();
  });
});

describe("one file per card (#2021)", () => {
  it("merges a profession's files into its table", async () => {
    const dir = tablesDir({
      "ranger/base.mjs": { "ranger.a": 1 },
      "ranger/2021-two.mjs": { "ranger.b": 2 },
      "monk/base.mjs": { "monk.c": 3 },
    });
    expect(await loadDirectories(dir, "icon row")).toEqual({
      monk: { "monk.c": 3 },
      ranger: { "ranger.a": 1, "ranger.b": 2 },
    });
  });

  it("throws on a row in two files of one directory, naming both", async () => {
    const dir = tablesDir({
      "ranger/base.mjs": { "ranger.a": 1 },
      "ranger/2021-stand-in.mjs": { "ranger.a": 2 },
    });
    await expect(loadDirectories(dir, "icon row")).rejects.toThrow(
      'icon row "ranger.a" is in ranger/2021-stand-in.mjs and ranger/base.mjs',
    );
  });

  it("throws on a glyph name in two files", async () => {
    const dir = tablesDir({ "heals.mjs": { heal: 1 }, "2021-heal.mjs": { heal: 2 } });
    const tables = await loadTables(dir, "glyphs/");
    expect(() => mergeRows(tables, { prefixed: false, what: "glyph" })).toThrow(
      'glyph "heal" is in glyphs/2021-heal.mjs and glyphs/heals.mjs',
    );
  });

  it("loads the real glyphs and modifiers, each with what it means", () => {
    expect(Object.keys(GLYPHS).length).toBeGreaterThan(600);
    expect(Object.keys(MODIFIERS)).toContain("corpse");
    for (const entry of [...Object.values(GLYPHS), ...Object.values(MODIFIERS)]) {
      expect(entry.means).not.toBe("");
      expect(entry.draw()).toMatch(/^</);
    }
  });
});
