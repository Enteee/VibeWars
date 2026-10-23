import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateSkillBundle } from "./generate.js";

const VALID_SKILL = {
  id: "test.skill",
  name: "Test Skill",
  profession: "warrior",
  attribute: "Strength",
  type: "Skill.",
  elite: false,
  campaign: "Core",
  activationSeconds: 0,
  rechargeSeconds: 5,
  description: "Does a thing.",
  variant: "pvp",
  ruleset: "gw1-reference",
  source: {
    name: "gw-memorial.net",
    url: "https://www.gw-memorial.net/x",
    fetchedAt: "2026-01-01T00:00:00.000Z",
  },
  unmapped: {},
};

describe("generateSkillBundle", () => {
  it("returns empty results for a directory that does not exist", () => {
    const result = generateSkillBundle(resolve(tmpdir(), "vibewars-does-not-exist-xyz"));
    expect(result.skills).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), "vibewars-game-data-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("collects every valid normalized file in the directory", () => {
    writeFileSync(resolve(dir, "a.json"), JSON.stringify(VALID_SKILL));
    writeFileSync(resolve(dir, "b.json"), JSON.stringify({ ...VALID_SKILL, id: "test.skill-2" }));

    const result = generateSkillBundle(dir);
    expect(result.skills).toHaveLength(2);
    expect(result.rejected).toEqual([]);
  });

  it("reports an invalid normalized file as rejected rather than throwing or silently skipping it", () => {
    writeFileSync(resolve(dir, "good.json"), JSON.stringify(VALID_SKILL));
    writeFileSync(resolve(dir, "bad.json"), JSON.stringify({ ...VALID_SKILL, name: "" }));

    const result = generateSkillBundle(dir);
    expect(result.skills).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.file).toBe("bad.json");
  });

  it("ignores non-.json files in the normalized directory", () => {
    writeFileSync(resolve(dir, "good.json"), JSON.stringify(VALID_SKILL));
    writeFileSync(resolve(dir, "README.md"), "not a skill");

    const result = generateSkillBundle(dir);
    expect(result.skills).toHaveLength(1);
  });
});

/**
 * CI gate (brief §8: "invalid skill data must fail CI"): run the real
 * generate step against this package's actual `normalized/` directory,
 * the one `pnpm run import` writes to. A bad file here means the
 * committed data is broken, not a test fixture — this must fail loudly.
 */
describe("the real bundled skill corpus", () => {
  it("has zero rejected files", () => {
    const result = generateSkillBundle();
    expect(result.rejected).toEqual([]);
  });

  it("has at least one normalized skill", () => {
    const result = generateSkillBundle();
    expect(result.skills.length).toBeGreaterThan(0);
  });

  it("has no duplicate skill ids", () => {
    const result = generateSkillBundle();
    const ids = result.skills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
