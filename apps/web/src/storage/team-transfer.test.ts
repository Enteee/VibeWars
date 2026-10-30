import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { MAX_TEAM_SIZE, newTeam, teamCharacter } from "../ui/team-builder.js";
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
  members: [
    { character: teamCharacter(ALICE, "m-alice") },
    { character: teamCharacter(BOB, "m-bob") },
  ],
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
    const text = exportTeam(TEAM);

    expect(text).not.toContain("\n");
    expect(text).toContain(exportBuild(ALICE));
    expect(text).toContain(exportBuild(BOB));
  });

  it("round-trips into a new team whose members are its own builds (#1452)", () => {
    const result = importTeam(exportTeam(TEAM), ids(), 42);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const members = result.team.members.map((member) => member.character);
    expect(members.map((c) => c.id)).toEqual(["new-1", "new-2"]);
    expect(members.map(buildPayload)).toEqual([buildPayload(ALICE), buildPayload(BOB)]);
    // A team member is no stored record: it has no version or timestamp.
    expect(members[0]).not.toHaveProperty("schemaVersion");
    expect(members[0]).not.toHaveProperty("updatedAt");
    expect(result.team.name).toBe("Duo");
    expect(result.team.id).toBe("new-3");
    expect(result.team.updatedAt).toBe(42);
  });

  it("makes two members of two identical builds", () => {
    const alice = TEAM.members.slice(0, 1);
    const twice = { ...TEAM, members: [...alice, ...alice] };
    const result = importTeam(exportTeam(twice), ids(), 42);

    expect(result.ok && result.team.members.map((m) => m.character.id)).toEqual(["new-1", "new-2"]);
  });
});

describe("team import", () => {
  it("refuses another team format version", () => {
    const result = importTeam(code([buildPayload(ALICE)], { formatVersion: 99 }), ids(), 0);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.problems.join(" ")).toContain("format version 99");
  });

  it("refuses a member of another build format version", () => {
    const result = importTeam(code([{ ...buildPayload(ALICE), formatVersion: 1 }]), ids(), 0);

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
    expect(!importTeam(code([]), ids(), 0).ok).toBe(true);
    // Invalid members, so a read of any of them would add a problem.
    const many = Array.from({ length: MAX_TEAM_SIZE + 1 }, () => null);
    const tooMany = importTeam(code(many), ids(), 0);
    expect(!tooMany.ok && tooMany.problems).toEqual([
      `A team may not exceed ${String(MAX_TEAM_SIZE)} members.`,
    ]);
    const nameless = importTeam(code([buildPayload(BOB)], { name: " " }), ids(), 0);
    expect(!nameless.ok && nameless.problems).toEqual(["Give the team a name."]);
  });

  it("never throws on junk", () => {
    for (const junk of ["", "{", "null", "[]", '{"format":"vibewars.team"}', code([null, 3])]) {
      expect(importTeam(junk, ids(), 0).ok).toBe(false);
    }
  });

  it("refuses members that only name a character, not a build (#1452)", () => {
    const result = importTeam(code([{ characterId: "alice" }]), ids(), 0);

    expect(result.ok).toBe(false);
  });
});

describe("looksLikeTeam", () => {
  it("takes a team code, whole or clipped, and not a build code", () => {
    const text = exportTeam(TEAM);

    expect(looksLikeTeam(text)).toBe(true);
    expect(looksLikeTeam(text.slice(0, 30))).toBe(true);
    expect(looksLikeTeam(exportBuild(ALICE))).toBe(false);
  });
});

describe("importedTeamSummary", () => {
  it("names the team and counts its members", () => {
    expect(importedTeamSummary(TEAM)).toBe("Pasted Duo, 2 members. Save to keep it.");
    expect(importedTeamSummary({ ...TEAM, members: TEAM.members.slice(1) })).toBe(
      "Pasted Duo, 1 member. Save to keep it.",
    );
  });
});
