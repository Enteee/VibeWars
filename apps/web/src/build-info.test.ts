import { describe, expect, it } from "vitest";

import { versionLine } from "./build-info.js";

describe("Help's version line (#2798)", () => {
  it("cuts a commit to 8 characters", () => {
    expect(versionLine("0.1.0", "916c25cf3a1b2c4d")).toBe("VibeWars 0.1.0 · build 916c25cf");
  });

  it("leaves dev as it is", () => {
    expect(versionLine("dev", "dev")).toBe("VibeWars dev · build dev");
  });
});
