import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { MAX_TEAM_SIZE, newTeam } from "../ui/team-builder.js";
import { buildPayload, exportBuild } from "./build-transfer.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter, type StoredTeam } from "./schema.js";
import {
  TEAM_FORMAT,
  TEAM_FORMAT_VERSION,
  exportTeam,
  importTeam,
  importedTeamSummary,
  looksLikeTeam,
} from "./team-transfer.js";

/**
 * A team code is untrusted input like a build (#577): never throw, never
 * half-apply, and list every problem at once.
 */

const ALICE: StoredCharacter = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "alice",
  name: "Alice",
  primaryProfession: "elementalist",
  secondaryProfession: "monk",
  attributes: [{ attributeId: "elementalist.fire-magic", rank: 12 }],
  skillBar: ["elementalist.fireball", "monk.orison-of-healing", null, null, null, null, null, null],
  equipment: defaultBuildEquipment("elementalist"),
  updatedAt: 1,
};
const BOB: StoredCharacter = {
  ...ALICE,
  id: "bob",
  name: "Bob",
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [],
  skillBar: [null, null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("warrior"),
};
const TEAM: StoredTeam = {
  ...newTeam("team-1"),
  name: "Duo",
  members: [{ characterId: "alice" }, { characterId: "bob" }],
};

/** Ids handed out in order, so a test can say which went where. */
function ids(): () => string {
  let next = 0;
  return () => {
    next += 1;
    return `new-${String(next)}`;
  };
}

function code(members: readonly unknown[], overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: TEAM_FORMAT,
    formatVersion: TEAM_FORMAT_VERSION,
    name: "Duo",
    members,
    ...overrides,
  });
}

describe("team export", () => {
  it("is one line holding every member's build as exportBuild writes it", () => {
    const text = exportTeam(TEAM, [ALICE, BOB]);

    expect(text).toBeDefined();
    expect(text).not.toContain("\n");
    expect(text).toContain(exportBuild(ALICE));
    expect(text).toContain(exportBuild(BOB));
  });

  it("refuses a team with a missing member", () => {
    expect(exportTeam(TEAM, [ALICE])).toBeUndefined();
  });

  it("round-trips into new characters and a new team", () => {
    const text = exportTeam(TEAM, [ALICE, BOB]) ?? "";
    const result = importTeam(text, [], ids(), 42);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.created.map((c) => c.name)).toEqual(["Alice", "Bob"]);
    expect(result.created.map((c) => c.id)).toEqual(["new-1", "new-2"]);
    expect(result.created.map(buildPayload)).toEqual([buildPayload(ALICE), buildPayload(BOB)]);
    expect(result.reused).toEqual([]);
    expect(result.team.name).toBe("Duo");
    expect(result.team.id).toBe("new-3");
    expect(result.team.updatedAt).toBe(42);
    expect(result.team.members).toEqual([{ characterId: "new-1" }, { characterId: "new-2" }]);
  });

  it("reuses a stored character identical to a member, once", () => {
    const text = exportTeam(
      { ...TEAM, members: [{ characterId: "alice" }, { characterId: "alice" }] },
      [ALICE],
    );
    const result = importTeam(text ?? "", [ALICE, BOB], ids(), 42);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.reused).toEqual([ALICE]);
    expect(result.created.map((c) => c.id)).toEqual(["new-2"]);
    expect(result.team.members).toEqual([{ characterId: "alice" }, { characterId: "new-2" }]);
  });

  it("does not reuse a character with the same name but another build", () => {
    const text = exportTeam(TEAM, [ALICE, BOB]) ?? "";
    const result = importTeam(text, [{ ...ALICE, skillBar: Array(8).fill(null) }], ids(), 42);

    expect(result.ok && result.reused).toEqual([]);
  });
});

describe("team import", () => {
  it("refuses another team format version", () => {
    const result = importTeam(code([buildPayload(ALICE)], { formatVersion: 99 }), [], ids(), 0);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain("format version 99");
  });

  it("refuses a member of another build format version", () => {
    const result = importTeam(code([{ ...buildPayload(ALICE), formatVersion: 1 }]), [], ids(), 0);

    expect(!result.ok && result.problems).toEqual([
      expect.stringMatching(/^Member 1 \(Alice\): This build uses format version 1/),
    ]);
  });

  it("lists every bad member and stores nothing", () => {
    const result = importTeam(
      code([
        { ...buildPayload(ALICE), primaryProfession: "bard" },
        buildPayload(BOB),
        { ...buildPayload(BOB), name: "Carol", skillBar: ["no.such-skill"] },
      ]),
      [],
      ids(),
      0,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toMatch(/^Member 1 \(Alice\): Unknown primary profession/);
    expect(result.problems[1]).toMatch(/^Member 3 \(Carol\): skillBar must have exactly 8 slots/);
  });

  it("refuses no members, too many, and no name", () => {
    expect(!importTeam(code([]), [], ids(), 0).ok).toBe(true);
    const many = Array.from({ length: MAX_TEAM_SIZE + 1 }, () => buildPayload(BOB));
    const tooMany = importTeam(code(many), [], ids(), 0);
    expect(!tooMany.ok && tooMany.problems).toEqual([
      `A team may not exceed ${String(MAX_TEAM_SIZE)} members.`,
    ]);
    const nameless = importTeam(code([buildPayload(BOB)], { name: " " }), [], ids(), 0);
    expect(!nameless.ok && nameless.problems).toEqual(["Give the team a name."]);
  });

  it("never throws on junk", () => {
    for (const junk of ["", "{", "null", "[]", '{"format":"vibewars.team"}', code([null, 3])]) {
      expect(importTeam(junk, [], ids(), 0).ok).toBe(false);
    }
  });
});

describe("looksLikeTeam", () => {
  it("takes a team code, whole or clipped, and not a build code", () => {
    const text = exportTeam(TEAM, [ALICE, BOB]) ?? "";

    expect(looksLikeTeam(text)).toBe(true);
    expect(looksLikeTeam(text.slice(0, 30))).toBe(true);
    expect(looksLikeTeam(exportBuild(ALICE))).toBe(false);
  });
});

describe("importedTeamSummary", () => {
  it("says what was created and reused, leaving out a zero part", () => {
    const team = newTeam("t");

    expect(importedTeamSummary({ ok: true, team, created: [ALICE, BOB], reused: [BOB] })).toBe(
      "Created 2 characters: Alice, Bob. Reused 1. Save to keep the team.",
    );
    expect(importedTeamSummary({ ok: true, team, created: [ALICE], reused: [] })).toBe(
      "Created 1 character: Alice. Save to keep the team.",
    );
    expect(importedTeamSummary({ ok: true, team, created: [], reused: [ALICE] })).toBe(
      "Reused 1. Save to keep the team.",
    );
  });
});
