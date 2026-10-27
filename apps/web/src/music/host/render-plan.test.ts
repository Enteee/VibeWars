import { describe, expect, it } from "vitest";

import { chunkOf, jobKey, nextRender, stale, type RenderPlan } from "./render-plan.js";

const PLAN: RenderPlan = { chunkCycles: 4, aheadChunks: 3, neighbourChunks: 2 };

function rendered(...jobs: readonly (readonly [number, 0 | 1 | 2 | 3])[]): Set<string> {
  return new Set(jobs.map(([chunk, level]) => jobKey({ chunk, level })));
}

describe("chunkOf", () => {
  it("is the chunk a track cycle falls in", () => {
    expect(chunkOf(0, 4)).toBe(0);
    expect(chunkOf(3.9, 4)).toBe(0);
    expect(chunkOf(4, 4)).toBe(1);
  });
});

describe("nextRender", () => {
  it("renders the playing chunk at the wanted level first", () => {
    expect(nextRender(PLAN, 5, 2, rendered())).toEqual({ chunk: 1, level: 2 });
  });

  it("fills the wanted level ahead before the levels either side", () => {
    expect(nextRender(PLAN, 5, 2, rendered([1, 2]))).toEqual({ chunk: 2, level: 2 });
    expect(nextRender(PLAN, 5, 2, rendered([1, 2], [2, 2], [3, 2]))).toEqual({
      chunk: 1,
      level: 1,
    });
  });

  it("renders the neighbours nearest chunk first, and only as far as kept", () => {
    const done = rendered([1, 2], [2, 2], [3, 2], [1, 1], [1, 3]);
    expect(nextRender(PLAN, 5, 2, done)).toEqual({ chunk: 2, level: 1 });
    done.add(jobKey({ chunk: 2, level: 1 }));
    done.add(jobKey({ chunk: 2, level: 3 }));
    expect(nextRender(PLAN, 5, 2, done)).toBeUndefined();
  });

  it("has one neighbour at either end of the levels", () => {
    const done = rendered([0, 0], [1, 0], [2, 0]);
    expect(nextRender(PLAN, 0, 0, done)).toEqual({ chunk: 0, level: 1 });
    done.add(jobKey({ chunk: 0, level: 1 }));
    done.add(jobKey({ chunk: 1, level: 1 }));
    expect(nextRender(PLAN, 0, 0, done)).toBeUndefined();
  });

  it("starts from chunk 0 before the track has begun", () => {
    expect(nextRender(PLAN, -1.5, 3, rendered())).toEqual({ chunk: 0, level: 3 });
  });
});

describe("stale", () => {
  it("keeps a chunk until its tail has played too", () => {
    expect(stale(PLAN, { chunk: 1, level: 2 }, 9, 2)).toBe(false);
    expect(stale(PLAN, { chunk: 1, level: 2 }, 10, 2)).toBe(true);
  });
});
