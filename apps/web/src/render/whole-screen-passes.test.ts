import benchReference from "@vibewars/game-maps/bench/reference-map.json" with { type: "json" };
import { validateMapData } from "@vibewars/game-maps/schema";
import { afterEach, describe, expect, it, vi } from "vitest";

import { structureOf } from "../net/maps.js";
import { FLAT_STRUCTURE } from "./arena-snapshot.js";
import { drawnBare, WHOLE_SCREEN_PASSES, wholeScreenPasses } from "./whole-screen-passes.js";

describe("the render bench's bare reference map (#4129)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is off in a build without VIBEWARS_BENCH_BARE_REFERENCE", () => {
    expect(drawnBare("bench-reference")).toBe(false);
    const { structure } = structureOf(validateMapData(benchReference));
    expect(structure.bare).toBeUndefined();
    expect(wholeScreenPasses(structure)).toEqual(WHOLE_SCREEN_PASSES);
  });

  it("draws only the reference map bare in the bench's build", async () => {
    vi.stubGlobal("__VIBEWARS_BENCH_BARE_REFERENCE__", true);
    vi.resetModules();
    const bench = await import("./whole-screen-passes.js");
    expect(bench.drawnBare("bench-reference")).toBe(true);
    expect(bench.drawnBare("bench-flat")).toBe(false);
    expect(bench.drawnBare("scarred-earth")).toBe(false);
  });

  it("draws no whole-screen pass on a bare structure, every one elsewhere", () => {
    expect(wholeScreenPasses({ ...FLAT_STRUCTURE, bare: true })).toEqual([]);
    expect(wholeScreenPasses(FLAT_STRUCTURE)).toEqual(["vignette", "deck-vignette"]);
  });
});
