import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertRan,
  MAX_JOBS,
  SECONDS_PER_JOB,
  planJobs,
  selectSpecs,
  specSeconds,
} from "./select-e2e-specs.mjs";

describe("selectSpecs", () => {
  /** @type {string} */
  let dir;

  /** @param {...string} args */
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  /** @type {(file: string, body: string) => void} */
  const write = (file, body) => {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), body);
  };
  const body = Array.from({ length: 30 }, (_, i) => `line ${String(i)}`).join("\n");

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "select-e2e-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    write("e2e/modified.spec.ts", body);
    write("e2e/deleted.spec.ts", body);
    write("e2e/renamed-edited.spec.ts", body);
    write("e2e/renamed-pure.spec.ts", `${body}\nmore`);
    write("e2e/helper.ts", "a");
    write("playwright.config.ts", "a");
    git("add", ".");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "pr");
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const commit = () => {
    git("add", "-A");
    git("commit", "-qm", "pr");
    return selectSpecs("main", "HEAD", dir).sort();
  };

  it("selects an added and a modified spec, not a deleted one", () => {
    write("e2e/added.spec.ts", body);
    write("e2e/modified.spec.ts", `${body}\nchanged`);
    fs.rmSync(path.join(dir, "e2e/deleted.spec.ts"));
    expect(commit()).toEqual(["e2e/added.spec.ts", "e2e/modified.spec.ts"]);
  });

  it("selects the new path of a renamed and edited spec (#429)", () => {
    git("mv", "e2e/renamed-edited.spec.ts", "e2e/new-name.spec.ts");
    write("e2e/new-name.spec.ts", `${body}\nedited`);
    expect(commit()).toEqual(["e2e/new-name.spec.ts"]);
  });

  it("selects the new path of a pure rename", () => {
    git("mv", "e2e/renamed-pure.spec.ts", "e2e/pure-new.spec.ts");
    expect(commit()).toEqual(["e2e/pure-new.spec.ts"]);
  });

  it("does not widen the run on a helper or config change", () => {
    write("e2e/helper.ts", "b");
    write("playwright.config.ts", "b");
    expect(commit()).toEqual([]);
  });
});

describe("assertRan", () => {
  it("fails a report with no tests run", () => {
    const report = JSON.stringify({ stats: { expected: 0, unexpected: 0, flaky: 0, skipped: 10 } });
    expect(() => assertRan(report)).toThrow(/ran no tests/);
  });

  it("passes a report that ran a test", () => {
    expect(assertRan(JSON.stringify({ stats: { expected: 10, unexpected: 0, flaky: 0 } }))).toBe(
      10,
    );
  });
});

describe("planJobs", () => {
  /** @param {{ specs: string[], repeat: number }[]} jobs */
  const runsPerSpec = (jobs) => {
    /** @type {Record<string, number>} */
    const runs = {};
    for (const job of jobs) {
      for (const spec of job.specs) runs[spec] = (runs[spec] ?? 0) + job.repeat;
    }
    return runs;
  };

  it("runs a small spec ten times in one job", () => {
    expect(planJobs({ "a.spec.ts": 3 }, 10, 80, 40)).toEqual([
      { specs: ["a.spec.ts"], repeat: 10 },
    ]);
  });

  it("gives every spec exactly ten runs: one big spec and nineteen small ones", () => {
    /** @type {Record<string, number>} */
    const weights = { "builds.spec.ts": 57 };
    for (let i = 0; i < 19; i++) weights[`small-${String(i)}.spec.ts`] = 3;
    const jobs = planJobs(weights, 10, 80, 40);
    expect(Object.values(runsPerSpec(jobs))).toEqual(new Array(20).fill(10));
    for (const job of jobs) {
      const cost = job.specs.reduce((sum, spec) => sum + (weights[spec] ?? 0) * job.repeat, 0);
      expect(cost).toBeLessThanOrEqual(80);
      expect(job.specs.length).toBeGreaterThan(0);
    }
    expect(jobs.length).toBeLessThanOrEqual(40);
  });

  it("never puts a spec twice in one job", () => {
    for (const job of planJobs({ "big.spec.ts": 30, "b.spec.ts": 30 }, 10, 80, 40)) {
      expect(new Set(job.specs).size).toBe(job.specs.length);
    }
  });

  it("refuses a selection over the budget with a clear message", () => {
    /** @type {Record<string, number>} */
    const weights = {};
    for (let i = 0; i < 60; i++) weights[`s-${String(i)}.spec.ts`] = 20;
    expect(() => planJobs(weights, 10, 80, 40)).toThrow(/split the PR/);
  });
});

describe("specSeconds", () => {
  const table = {
    "e2e/a.spec.ts › x": 10,
    "e2e/a.spec.ts › g › y": 5,
    "e2e/b.spec.ts › z": 3,
    "e2e/c.spec.ts › z": 100,
  };

  it("sums a spec's tests from the table", () => {
    expect(specSeconds(["e2e/a.spec.ts"], table)).toEqual({ "e2e/a.spec.ts": 15 });
  });

  it("gives a spec the table lacks the median spec", () => {
    expect(specSeconds(["e2e/new.spec.ts"], table)).toEqual({ "e2e/new.spec.ts": 15 });
  });
});

describe("the plan under the real budget", () => {
  it("never exceeds 6 jobs (builds.spec.ts fits) and refuses a spec over 750 s", () => {
    const fits = { "builds.spec.ts": 720 };
    expect(planJobs(fits, 10, SECONDS_PER_JOB, MAX_JOBS).length).toBeLessThanOrEqual(6);
    expect(() => planJobs({ "big.spec.ts": 800 }, 10, SECONDS_PER_JOB, MAX_JOBS)).toThrow(
      /split the PR/,
    );
  });

  it("is empty for no specs", () => {
    expect(planJobs({}, 10, SECONDS_PER_JOB, MAX_JOBS)).toEqual([]);
  });
});
