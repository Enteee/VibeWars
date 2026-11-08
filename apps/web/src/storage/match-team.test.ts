import { STARTER_BUILDS, encodeTemplateCode } from "@vibewars/game-core";
import type { MatchRecordPlayer } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { fromPlayerBuild } from "./build-validation.js";
import { decodeTemplate } from "./gw1-template.js";
import { teamFromMatch } from "./match-team.js";
import { TEAM_SCHEMA_VERSION } from "./schema.js";

/** Warrior/none: Swift Chop, then GW1 skill 3000, which VibeWars lacks. */
const MISSING_3000 = "OQAAQVF4uAAAAAAAAAAAA";

function templateOf(index: number): string {
  const build = STARTER_BUILDS[index];
  if (build === undefined) {
    throw new Error("no such starter");
  }
  const encoded = encodeTemplateCode(fromPlayerBuild(build, `s${String(index)}`, 1));
  if (!encoded.ok) {
    throw new Error(encoded.problem);
  }
  return encoded.code;
}

function player(name: string, template: string, bot = false): MatchRecordPlayer {
  return { name, guildTag: null, bot, pubkey: bot ? null : "a".repeat(64), template };
}

function ids(): () => string {
  let next = 0;
  return () => `id-${String((next += 1))}`;
}

describe("a match's team as a Team Build (#2585)", () => {
  it("makes a member per player, named after it, with its decoded build", () => {
    const players = [player("Ann", templateOf(0)), player("Bob", templateOf(1))];
    const result = teamFromMatch({ players }, ids(), 42);
    if (!result.ok) {
      throw new Error("refused");
    }
    const { team } = result;
    expect(team).toMatchObject({
      schemaVersion: TEAM_SCHEMA_VERSION,
      name: "Ann's team",
      size: 2,
      updatedAt: 42,
    });
    expect(team.members.map((member) => member.character.name)).toEqual(["Ann", "Bob"]);
    players.forEach((each, index) => {
      const decoded = decodeTemplate(each.template, "x", 42);
      if (!decoded.ok) {
        throw new Error("unreadable");
      }
      const { character } = team.members[index] ?? {};
      expect(character).toMatchObject({
        primaryProfession: decoded.character.primaryProfession,
        secondaryProfession: decoded.character.secondaryProfession,
        attributes: decoded.character.attributes,
        skillBar: decoded.character.skillBar,
        equipment: decoded.character.equipment,
      });
    });
    expect(new Set([team.id, ...team.members.map((member) => member.character.id)]).size).toBe(3);
    expect(result.missingSkills).toEqual([]);
  });

  it("is named after its first player who is not a bot, or its first if all are", () => {
    const code = templateOf(0);
    const mixed = teamFromMatch(
      { players: [player("Bot A", code, true), player("Cy", code)] },
      ids(),
      1,
    );
    expect(mixed).toMatchObject({ ok: true, team: { name: "Cy's team" } });
    const bots = teamFromMatch(
      { players: [player("Bot A", code, true), player("Bot B", code, true)] },
      ids(),
      1,
    );
    expect(bots).toMatchObject({ ok: true, team: { name: "Bot A's team" } });
  });

  it("leaves a skill this game lacks an empty slot, and lists it", () => {
    const result = teamFromMatch(
      { players: [player("Ann", MISSING_3000), player("Bob", templateOf(0))] },
      ids(),
      1,
    );
    expect(result).toMatchObject({ ok: true, missingSkills: [3000] });
    if (result.ok) {
      expect(result.team.members[0]?.character.skillBar).toEqual([
        "warrior.swift-chop",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ]);
    }
  });

  it("refuses an unreadable template and a size no Team Build has", () => {
    const code = templateOf(0);
    expect(
      teamFromMatch({ players: [player("Ann", code), player("Bob", "not a code")] }, ids(), 1),
    ).toEqual({ ok: false });
    const three = [player("Ann", code), player("Bob", code), player("Cy", code)];
    expect(teamFromMatch({ players: three }, ids(), 1)).toEqual({ ok: false });
    expect(teamFromMatch({ players: [player("Ann", code)] }, ids(), 1)).toEqual({ ok: false });
  });
});
