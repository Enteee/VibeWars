import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { gwSkillDataDir, readGwSkillData } from "./gw-skilldata.js";

describe("readGwSkillData (#1207)", () => {
  const corpus = readGwSkillData(gwSkillDataDir());

  it("reads every vendored record: 1,330 skills, 186 PvP variants and the empty slot", () => {
    expect(corpus.size).toBe(1517);
    expect([...corpus.values()].filter((record) => record.pvp)).toHaveLength(186);
    expect(corpus.get(0)?.name).toBe("No Skill");
  });

  it("joins a skill's numbers with its text, ids and split as GW1 has them", () => {
    expect(corpus.get(415)).toMatchObject({
      gwId: 415,
      name: "Call of Haste",
      professionGwId: 2,
      elite: false,
      pvp: false,
      splitId: 2657,
      energy: 10,
      recharge: 25,
    });
    expect(corpus.get(415)?.description).toMatch(/^Shout\. For 30 seconds/);
    expect(corpus.get(2657)).toMatchObject({
      name: "Call of Haste (PvP)",
      pvp: true,
      splitId: 415,
    });
    // No split reads as none, not as the empty slot's id.
    expect(corpus.get(1)?.splitId).toBeUndefined();
  });

  describe("a damaged copy", () => {
    /** A copy of the vendored files with `edit` applied to skill 5's data record. */
    function damaged(edit: (record: Record<string, unknown>) => void): string {
      const dir = mkdtempSync(join(tmpdir(), "gw-skilldata-"));
      copyFileSync(resolve(gwSkillDataDir(), "skilldesc-en.json"), join(dir, "skilldesc-en.json"));
      const data = JSON.parse(
        readFileSync(resolve(gwSkillDataDir(), "skilldata.json"), "utf8"),
      ) as { skilldata: Record<string, Record<string, unknown>> };
      const record = data.skilldata["5"];
      if (record === undefined) {
        throw new Error("no skill 5 to damage");
      }
      edit(record);
      writeFileSync(join(dir, "skilldata.json"), JSON.stringify(data));
      return dir;
    }

    it("throws naming the malformed record", () => {
      const dir = damaged((record) => {
        record.energy = "five";
      });
      try {
        expect(() => readGwSkillData(dir)).toThrow(/skill 5 is malformed/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });

    it("throws naming a record filed under another id", () => {
      const dir = damaged((record) => {
        record.id = 6;
      });
      try {
        expect(() => readGwSkillData(dir)).toThrow(/skill 5 carries id 6/);
      } finally {
        rmSync(dir, { recursive: true });
      }
    });
  });
});
