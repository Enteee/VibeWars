import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  BUILD_FORMAT,
  BUILD_FORMAT_VERSION,
  exportBuild,
  importBuild,
  looksLikeBuild,
} from "./build-transfer.js";
import { SKILL_BAR_SLOTS } from "./build-validation.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "./schema.js";

/**
 * A shared build is untrusted input: it arrives by copy-paste through a
 * chat client that may have mangled it, or from someone being clever.
 * These tests are written the way the fuzz tests are — the contract is
 * "never throw, never half-apply" (brief §24, §32).
 */

const VALID: StoredCharacter = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "local-1",
  name: "Flame Caller",
  primaryProfession: "elementalist",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "elementalist.fire-magic", rank: 12 },
    { attributeId: "elementalist.energy-storage", rank: 8 },
  ],
  skillBar: ["elementalist.fireball", "monk.orison-of-healing", null, null, null, null, null, null],
  equipment: defaultBuildEquipment("elementalist"),
  updatedAt: 1_700_000_000_000,
};

describe("looksLikeBuild", () => {
  it("takes a build, whole or clipped, so a broken one fails out loud", () => {
    const text = exportBuild(VALID);

    expect(looksLikeBuild(text)).toBe(true);
    expect(looksLikeBuild(text.slice(0, 40))).toBe(true);
  });

  it("ignores any other text", () => {
    expect(looksLikeBuild("gg, well played")).toBe(false);
    expect(looksLikeBuild('{"hero":"someone else\'s format"}')).toBe(false);
    expect(looksLikeBuild(BUILD_FORMAT)).toBe(false);
  });
});

describe("build export", () => {
  it("round-trips a valid build", () => {
    const result = importBuild(exportBuild(VALID), "local-2", 42);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.character.name).toBe(VALID.name);
    expect(result.character.primaryProfession).toBe("elementalist");
    expect(result.character.secondaryProfession).toBe("monk");
    expect(result.character.attributes).toEqual(VALID.attributes);
    expect(result.character.skillBar).toEqual(VALID.skillBar);
  });

  it("round-trips the mods on every item (#2007)", () => {
    const [set] = VALID.equipment.weaponSets;
    if (set.offHand === null) {
      throw new Error("an elementalist starts with a focus");
    }
    const modded: StoredCharacter = {
      ...VALID,
      equipment: {
        ...VALID.equipment,
        weaponSets: [
          {
            mainHand: {
              ...set.mainHand,
              upgrades: { prefix: null, suffix: null, inscription: "seize-the-day" },
            },
            offHand: {
              ...set.offHand,
              upgrades: { prefix: null, suffix: "of-fortitude", inscription: "live-for-today" },
            },
          },
          null,
          null,
          null,
        ],
      },
    };
    const result = importBuild(exportBuild(modded), "local-2", 42);

    expect(result.ok).toBe(true);
    expect(result.ok && result.character.equipment).toEqual(modded.equipment);
  });

  it("gives the imported build a new identity", () => {
    // Keeping the exporter's id would make importing a friend's build
    // silently overwrite one of your own characters on save.
    const result = importBuild(exportBuild(VALID), "local-2", 42);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.character.id).toBe("local-2");
    expect(result.character.updatedAt).toBe(42);
  });

  it("is one line, so a chat client does not reflow it (#572)", () => {
    const text = exportBuild(VALID);

    expect(text).not.toMatch(/[\r\n]/);
    expect(importBuild(text, "local-2", 42).ok).toBe(true);
  });

  it("does not leak local identity into the shared text", () => {
    const text = exportBuild(VALID);

    expect(text).not.toContain("local-1");
    expect(text).not.toContain("1700000000000");
  });

  it("exports a character with no secondary profession", () => {
    const solo: StoredCharacter = {
      ...VALID,
      secondaryProfession: undefined,
      // The monk skill goes too: without the secondary profession the
      // character can no longer access it. See the test below.
      skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
    };
    const result = importBuild(exportBuild(solo), "local-3", 1);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.character.secondaryProfession).toBeUndefined();
  });

  it("refuses a build whose skills its professions cannot access", () => {
    // Exactly the build above, but keeping the monk skill after dropping
    // the monk secondary. The editor's picker would never offer this, but
    // an imported or hand-edited build can contain it — which is why the
    // rule lives in validation rather than only in the dropdown.
    const orphaned: StoredCharacter = { ...VALID, secondaryProfession: undefined };
    const result = importBuild(exportBuild(orphaned), "local-4", 1);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.problems.join()).toContain("Orison of Healing is a Monk skill");
  });
});

describe("build import rejects bad input", () => {
  const emptyBar = Array.from({ length: SKILL_BAR_SLOTS }, () => null);
  const base = {
    format: BUILD_FORMAT,
    formatVersion: BUILD_FORMAT_VERSION,
    name: "Test",
    primaryProfession: "warrior",
    secondaryProfession: null,
    attributes: [],
    skillBar: emptyBar,
    equipment: defaultBuildEquipment("warrior"),
  };

  const reject = (payload: unknown): readonly string[] => {
    const result = importBuild(JSON.stringify(payload), "id", 0);
    expect(result.ok).toBe(false);
    return result.ok ? [] : result.problems;
  };

  it("rejects text that is not JSON", () => {
    const result = importBuild("not json at all {", "id", 0);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.problems[0]).toContain("not valid JSON");
  });

  it("rejects a truncated paste without throwing", () => {
    // The most likely real failure: a chat client clipped the message.
    const text = exportBuild(VALID).slice(0, 40);

    expect(() => importBuild(text, "id", 0)).not.toThrow();
    expect(importBuild(text, "id", 0).ok).toBe(false);
  });

  it("rejects a blob that is not one of ours", () => {
    expect(reject({ some: "other tool's json" })[0]).toContain("does not look like");
  });

  it("refuses a future format version rather than guessing", () => {
    expect(reject({ ...base, formatVersion: 99 })[0]).toContain("reads only version");
  });

  it("rejects an unknown profession", () => {
    expect(reject({ ...base, primaryProfession: "dragonlord" }).join()).toContain("dragonlord");
  });

  it("rejects an unknown secondary profession", () => {
    expect(reject({ ...base, secondaryProfession: "bard" }).join()).toContain("bard");
  });

  it("rejects a build with no name", () => {
    expect(reject({ ...base, name: "   " }).join()).toContain("needs a name");
  });

  it("rejects a skill bar of the wrong size", () => {
    expect(reject({ ...base, skillBar: [null, null] }).join()).toContain("exactly");
  });

  it("rejects non-string skill slots", () => {
    const bar = [...emptyBar];
    bar[0] = 7 as unknown as null;
    expect(reject({ ...base, skillBar: bar }).join()).toContain("skill id or null");
  });

  it("rejects a non-integer attribute rank", () => {
    expect(
      reject({ ...base, attributes: [{ attributeId: "warrior.strength", rank: 1.5 }] }).join(),
    ).toContain("whole number");
  });

  it("rejects NaN and Infinity ranks that survived encoding", () => {
    // JSON.stringify turns these into null, but a hand-edited or
    // non-JS-produced payload can carry them through.
    for (const rank of ["NaN", "Infinity", "-Infinity"]) {
      const text = `{"format":"${BUILD_FORMAT}","formatVersion":1,"name":"T","primaryProfession":"warrior","secondaryProfession":null,"attributes":[{"attributeId":"warrior.strength","rank":${rank}}],"skillBar":[null,null,null,null,null,null,null,null]}`;
      expect(importBuild(text, "id", 0).ok, `rank ${rank} must be refused`).toBe(false);
    }
  });

  it("rejects a build that breaks the attribute budget", () => {
    // The interesting case: structurally perfect, but an illegal build.
    // Catching it here is the difference between a clear error and a
    // character that only fails much later, at join time.
    const problems = reject({
      ...base,
      primaryProfession: "warrior",
      attributes: [
        { attributeId: "warrior.strength", rank: 12 },
        { attributeId: "warrior.swordsmanship", rank: 12 },
        { attributeId: "warrior.axe-mastery", rank: 12 },
        { attributeId: "warrior.tactics", rank: 12 },
      ],
    });

    expect(problems.length).toBeGreaterThan(0);
  });

  it("rejects a skill the professions cannot access", () => {
    const bar = [...emptyBar];
    bar[0] = "elementalist.fireball" as unknown as null;
    const problems = reject({ ...base, primaryProfession: "warrior", skillBar: bar });

    expect(problems.length).toBeGreaterThan(0);
  });

  it("never throws on hostile payloads", () => {
    const hostile: unknown[] = [
      null,
      42,
      "plain string",
      [],
      { format: BUILD_FORMAT, formatVersion: 1 },
      { ...base, attributes: null },
      { ...base, attributes: [null] },
      { ...base, attributes: [{ attributeId: 5, rank: 5 }] },
      { ...base, skillBar: null },
      { ...base, name: null },
      { ...base, primaryProfession: null },
      { ...base, primaryProfession: { toString: "nope" } },
      { ...base, secondaryProfession: [] },
    ];

    for (const payload of hostile) {
      expect(
        () => importBuild(JSON.stringify(payload), "id", 0),
        `payload ${JSON.stringify(payload)} threw`,
      ).not.toThrow();
      expect(importBuild(JSON.stringify(payload), "id", 0).ok).toBe(false);
    }
  });

  it("reports every problem at once, not just the first", () => {
    const problems = reject({ ...base, name: "", primaryProfession: "nope" });

    expect(problems.length).toBeGreaterThan(1);
  });
});

describe("build format version", () => {
  const CURRENT_PAYLOAD = {
    format: BUILD_FORMAT,
    formatVersion: BUILD_FORMAT_VERSION,
    name: "Fresh Share",
    primaryProfession: "warrior",
    secondaryProfession: null,
    attributes: [{ attributeId: "warrior.swordsmanship", rank: 12 }],
    skillBar: ["warrior.sever-artery", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("warrior"),
  };

  it("imports a build in the current format", () => {
    const result = importBuild(JSON.stringify(CURRENT_PAYLOAD), "new-id", 7);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.character.name).toBe("Fresh Share");
    expect(result.character.schemaVersion).toBe(CHARACTER_SCHEMA_VERSION);
  });

  it("writes the current format version on export", () => {
    const payload: unknown = JSON.parse(exportBuild(VALID));
    expect((payload as { formatVersion: number }).formatVersion).toBe(BUILD_FORMAT_VERSION);
  });

  it("carries gear through an export and back", () => {
    const result = importBuild(exportBuild(VALID), "new-id", 7);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.character.equipment).toEqual(VALID.equipment);
  });

  it("refuses a build from any other format version, older or newer", () => {
    // A version only ever rejects; there is no path that adapts an old
    // build string (ADR-0016).
    for (const formatVersion of [BUILD_FORMAT_VERSION - 1, BUILD_FORMAT_VERSION + 1]) {
      const result = importBuild(JSON.stringify({ ...CURRENT_PAYLOAD, formatVersion }), "id", 0);
      expect(result.ok, String(formatVersion)).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.problems[0]).toMatch(/reads only version/);
    }
  });

  it("refuses a build with no equipment instead of filling it in", () => {
    const { equipment: _dropped, ...withoutGear } = CURRENT_PAYLOAD;
    const result = importBuild(JSON.stringify(withoutGear), "id", 0);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.problems[0]).toMatch(/equipment is missing/);
  });

  it("refuses a formatVersion 1 string, shared before GW1's attribute costs (#470)", () => {
    // 12/12/8 was legal under the old cost table. Its version, not its
    // budget, is what refuses it: it is not half-loaded and re-priced.
    const beforeGw1Costs = {
      ...CURRENT_PAYLOAD,
      formatVersion: 1,
      attributes: [
        { attributeId: "warrior.strength", rank: 12 },
        { attributeId: "warrior.swordsmanship", rank: 12 },
        { attributeId: "warrior.tactics", rank: 8 },
      ],
    };
    const result = importBuild(JSON.stringify(beforeGw1Costs), "id", 0);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(
      `uses format version 1, but this game reads only version ${String(BUILD_FORMAT_VERSION)}`,
    );
  });

  it("refuses a build with no usable format version", () => {
    const result = importBuild(
      JSON.stringify({ ...CURRENT_PAYLOAD, formatVersion: "one" }),
      "id",
      0,
    );
    expect(result.ok).toBe(false);
  });
});
