import { describe, expect, it } from "vitest";

import { jobCpus } from "./job-cpus.mjs";

describe("jobCpus", () => {
  it("reads a positive integer", () => {
    expect(jobCpus({ VIBEWARS_RUNNER_CPUS: "2" })).toBe(2);
  });

  it("is undefined where there is no runner variable", () => {
    expect(jobCpus({})).toBeUndefined();
  });

  it.each(["0", "-1", "abc", "2.5", ""])("ignores %j as wrong data", (value) => {
    expect(jobCpus({ VIBEWARS_RUNNER_CPUS: value })).toBeUndefined();
  });
});
