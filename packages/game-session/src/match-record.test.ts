import { STARTER_BUILDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { toJson } from "./match-harness.test-support.js";
import {
  MAX_RECORD_DURATION_SECONDS,
  MAX_RECORD_TEAM,
  RECORD_CLOCK_SKEW_SECONDS,
  validateMatchRecord,
} from "./match-record.js";

/** Off a public relay, from anyone (#2528): only a record of the exact shape is read. */

const NOW = 1_800_000_000;
const MAPS = new Set(["test-arena"]);

const fail = (): never => {
  throw new Error("no such starter build");
};

const build = (index: number) => {
  const { name: _, ...played } = STARTER_BUILDS.at(index % STARTER_BUILDS.length) ?? fail();
  return toJson(played);
};

const player = (name: string, index = 0) => ({
  name,
  guildTag: "VIBE",
  bot: false,
  build: build(index),
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
    ["a name too long", { name: "x".repeat(65) }],
    ["a bad guild tag", { guildTag: "TOOLONG" }],
    ["no bot flag", { bot: "no" }],
    ["no build", { build: null }],
    ["a malformed build", { build: { primaryProfession: "pirate" } }],
    [
      "an illegal build",
      {
        build: {
          ...(build(0) as object),
          attributes: [{ attributeId: "warrior.strength", rank: 99 }],
        },
      },
    ],
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

  it("drops anything it does not know about a player", () => {
    const record = valid();
    const [first, second] = record.teams;
    const withPeer = { ...first?.players[0], peerId: "abc", ip: "10.0.0.1" };
    const out = read({ ...record, teams: [{ players: [withPeer] }, second] });
    expect(out?.teams[0].players[0]).toEqual({
      name: "Ann",
      guildTag: "VIBE",
      bot: false,
      build: expect.any(Object),
    });
  });
});
