import { STARTER_BUILDS, decodeTemplateCode, encodeTemplateCode } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { toJson } from "./match-harness.test-support.js";
import {
  MAX_RECORD_DURATION_SECONDS,
  MAX_RECORD_TEAM,
  RECORD_CLOCK_SKEW_SECONDS,
  recordTemplate,
  validateMatchRecord,
} from "./match-record.js";
import { sanitizeCharacterName } from "./names.js";

/** Off a public relay, from anyone (#2528): only a record of the exact shape is read. */

const NOW = 1_800_000_000;
const MAPS = new Set(["test-arena"]);

const fail = (): never => {
  throw new Error("no such starter build");
};

const template = (index: number) =>
  recordTemplate(STARTER_BUILDS.at(index % STARTER_BUILDS.length) ?? fail());

/** A well-formed code for a build no Warrior may play: Strength 15. */
const illegal = encodeTemplateCode({
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "warrior.strength", rank: 15 }],
  skillBar: [null, null, null, null, null, null, null, null],
});

const player = (name: string, index = 0) => ({
  name,
  guildTag: "VIBE",
  bot: false,
  template: template(index),
});

const valid = () => ({
  v: 1,
  mode: "team-arena",
  map: "test-arena",
  endedAt: NOW - 60,
  durationSeconds: 412,
  winningTeam: 1,
  endReason: "annihilation",
  teams: [
    { players: [player("Ann", 0), player("Bo", 1)] },
    { players: [{ ...player("Elementalist Bot", 2), guildTag: null, bot: true }] },
  ],
});

const read = (value: unknown) => validateMatchRecord(value, MAPS, NOW);

describe("validateMatchRecord (#2528)", () => {
  it("reads a record as a host publishes it", () => {
    const record = valid();
    expect(read(JSON.parse(JSON.stringify(record)))).toMatchObject({
      ...record,
      teams: [
        { players: [{ name: "Ann", guildTag: "VIBE", bot: false }, { name: "Bo" }] },
        { players: [{ name: "Elementalist Bot", guildTag: null, bot: true }] },
      ],
    });
  });

  it("reads a draw", () => {
    expect(read({ ...valid(), winningTeam: null })?.winningTeam).toBeNull();
  });

  it("refuses another version", () => {
    expect(read({ ...valid(), v: 2 })).toBeUndefined();
    expect(read({ ...valid(), v: "1" })).toBeUndefined();
  });

  it.each([
    ["mode", "deathmatch"],
    ["map", "elsewhere"],
    ["map", 3],
    ["endReason", "host-left"],
    ["winningTeam", 2],
    ["endedAt", 1.5],
    ["endedAt", -1],
    ["endedAt", NOW + RECORD_CLOCK_SKEW_SECONDS + 1],
    ["durationSeconds", -1],
    ["durationSeconds", MAX_RECORD_DURATION_SECONDS + 1],
    ["durationSeconds", "412"],
    ["teams", []],
    ["teams", [{ players: [player("Ann")] }]],
    ["teams", [{ players: [] }, { players: [player("Ann")] }]],
  ])("refuses a record whose %s is %j", (field, value) => {
    expect(read({ ...valid(), [field]: value })).toBeUndefined();
  });

  it("allows a full team, and refuses one over it", () => {
    const team = (size: number) => ({
      players: Array.from({ length: size }, (_, i) => player(`P${String(i)}`, i)),
    });
    expect(read({ ...valid(), teams: [team(MAX_RECORD_TEAM), team(1)] })).toBeDefined();
    expect(read({ ...valid(), teams: [team(MAX_RECORD_TEAM + 1), team(1)] })).toBeUndefined();
  });

  it.each([
    ["an empty name", { name: "" }],
    ["a name over 16 graphemes", { name: "x".repeat(17) }],
    ["a name with a bidi override", { name: "Ann\u202Enib" }],
    ["a name with a control character", { name: "An\u0007n" }],
    ["a name with a zero-width space", { name: "An\u200Bn" }],
    ["a name with padding", { name: " Ann " }],
    ["a bad guild tag", { guildTag: "TOOLONG" }],
    ["no bot flag", { bot: "no" }],
    ["no template", { template: null }],
    ["a whole build for a template", { template: toJson(STARTER_BUILDS[0]) }],
    ["a malformed template", { template: "not a code" }],
    ["a template written otherwise, padded", { template: `${template(0)}AAAA` }],
    ["a template over 64 characters", { template: `${template(0)}${"A".repeat(64)}` }],
    ["an illegal build", { template: illegal.ok ? illegal.code : "" }],
  ])("refuses a player with %s", (_, change) => {
    const record = valid();
    const [first, second] = record.teams;
    expect(
      read({
        ...record,
        teams: [{ players: [{ ...first?.players[0], ...change }] }, second],
      }),
    ).toBeUndefined();
  });

  it("keeps a lobby character name cut to an ellipsis", () => {
    const name = sanitizeCharacterName("Necromancer/Elementalist", "");
    expect(name).toBe("Necromancer…");
    const record = valid();
    const [first, second] = record.teams;
    const out = read({ ...record, teams: [{ players: [{ ...first?.players[0], name }] }, second] });
    expect(out?.teams[0].players[0]?.name).toBe(name);
  });

  it("drops anything it does not know about a player", () => {
    const record = valid();
    const [first, second] = record.teams;
    const withPeer = { ...first?.players[0], peerId: "abc", ip: "10.0.0.1" };
    const out = read({ ...record, teams: [{ players: [withPeer] }, second] });
    expect(out?.teams[0].players[0]).toEqual({
      name: "Ann",
      guildTag: "VIBE",
      bot: false,
      template: template(0),
    });
  });
});

describe("recordTemplate (#2528)", () => {
  it("holds the professions, ranks and bar as played", () => {
    const played = STARTER_BUILDS[0] ?? fail();
    const decoded = decodeTemplateCode(recordTemplate(played));
    expect(decoded.ok && decoded.build).toEqual({
      primaryProfession: played.primaryProfession,
      secondaryProfession: played.secondaryProfession,
      attributes: played.attributes.filter(({ rank }) => rank > 0),
      skillBar: played.skillBar,
    });
  });

  it("leaves out a skill GW1 does not have", () => {
    const played = STARTER_BUILDS[0] ?? fail();
    const skillBar = ["necromancer.blood-renewal-lite", ...played.skillBar.slice(1)];
    const decoded = decodeTemplateCode(recordTemplate({ ...played, skillBar }));
    expect(decoded.ok && decoded.build.skillBar).toEqual([null, ...played.skillBar.slice(1)]);
  });
});
