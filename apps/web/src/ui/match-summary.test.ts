import { describe, expect, it } from "vitest";

import type { MatchSummaryRow } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { summaryTables } from "./match-summary.js";

function row(id: string, team: number, values: Partial<MatchSummaryRow> = {}): MatchSummaryRow {
  return {
    id,
    name: id,
    guildTag: null,
    team,
    damage: 0,
    healing: 0,
    taken: 0,
    kills: 0,
    deaths: 0,
    interrupts: 0,
    ...values,
  };
}

const NO_BOTS: ReadonlySet<string> = new Set();

const SUMMARY = [
  row("ann", 0, { damage: 900, kills: 2, healing: 40 }),
  row("bob", 1, { damage: 900, taken: 700, deaths: 1 }),
  row("cat", 0, { healing: 1200, interrupts: 1 }),
  row("dan", 1, { taken: 300, kills: 1 }),
];

describe("summaryTables (#1057)", () => {
  it("puts your team first, in the host's order, and flags your row", () => {
    const [ours, theirs] = summaryTables(SUMMARY, "bob", 1, undefined, NO_BOTS);
    expect(ours?.caption).toBe(t("summary.yourTeam"));
    expect(ours?.lines.map((line) => line.row.id)).toEqual(["bob", "dan"]);
    expect(theirs?.caption).toBe(t("summary.theirTeam"));
    expect(theirs?.lines.map((line) => line.row.id)).toEqual(["ann", "cat"]);
    expect(ours?.lines.map((line) => line.self)).toEqual([true, false]);
    expect(theirs?.lines.some((line) => line.self)).toBe(false);
  });

  it("flags each column's highest value across the whole match, every tie", () => {
    const tables = summaryTables(SUMMARY, "ann", 0, undefined, NO_BOTS);
    const top = new Map(
      tables.flatMap((table) => table.lines.map((line) => [line.row.id, [...line.top]])),
    );
    expect(top.get("ann")).toEqual(["damage", "kills"]);
    expect(top.get("bob")).toEqual(["damage", "taken", "deaths"]);
    expect(top.get("cat")).toEqual(["healing", "interrupts"]);
    expect(top.get("dan")).toEqual([]);
  });

  it("flags nobody in a column that is zero throughout", () => {
    const tables = summaryTables([row("ann", 0), row("bob", 1)], "ann", 0, undefined, NO_BOTS);
    expect(tables.flatMap((table) => table.lines.map((line) => line.top.size))).toEqual([0, 0]);
  });

  it("shows a spectator team 1 first, with no row of its own", () => {
    const [first, second] = summaryTables(SUMMARY, "spectator-1", undefined, undefined, NO_BOTS);
    expect(first?.caption).toBe(t("summary.team", { team: 1 }));
    expect(first?.lines.map((line) => line.row.id)).toEqual(["ann", "cat"]);
    expect(second?.caption).toBe("Team 2");
    expect([first, second].flatMap((table) => table?.lines ?? []).some((line) => line.self)).toBe(
      false,
    );
  });
});

describe("summaryTables: three teams (#2684)", () => {
  const three = [...SUMMARY, row("eve", 2)];

  it("puts your team first, then the winner, then the rest, each by number", () => {
    const tables = summaryTables(three, "ann", 0, 2, NO_BOTS);
    expect(tables.map((table) => table.caption)).toEqual([
      t("summary.yourTeam"),
      `◆ ${t("summary.team", { team: 3 })}`,
      t("summary.team", { team: 2 }),
    ]);
    expect(tables[1]?.lines.map((line) => line.row.id)).toEqual(["eve"]);
  });

  it("shows a spectator the winner first, and team 1 first on a draw", () => {
    const captions = (winner: number | undefined) =>
      summaryTables(three, "spectator-1", undefined, winner, NO_BOTS).map((table) => table.caption);
    expect(captions(1)).toEqual(["Team 2", "Team 1", "◆ Team 3"]);
    expect(captions(undefined)).toEqual(["Team 1", "Team 2", "◆ Team 3"]);
  });
});

describe("summaryTables: bots (#1241)", () => {
  it("marks the rows the roster calls bots, and no one else", () => {
    const tables = summaryTables(SUMMARY, "ann", 0, undefined, new Set(["cat", "zed"]));
    const bot = new Map(
      tables.flatMap((table) => table.lines.map((line) => [line.row.id, line.bot])),
    );
    expect(bot).toEqual(
      new Map([
        ["ann", false],
        ["cat", true],
        ["bob", false],
        ["dan", false],
      ]),
    );
  });
});
