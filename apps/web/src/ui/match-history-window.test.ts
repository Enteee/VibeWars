import type { WireEnded } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { t } from "../i18n/index.js";
import type { MatchRecord } from "../storage/match-history.js";
import { historyRows, matchResult } from "./match-history-window.js";

const ENDED: WireEnded = {
  winningTeam: 0,
  endReason: "annihilation",
  summary: [],
  clearSeconds: null,
};

function record(id: string, playerKey: string, change: Partial<MatchRecord> = {}): MatchRecord {
  return {
    id,
    endedAt: 1_700_000_000_000,
    mapId: "ember-pits",
    mode: "hosted-game",
    teamCount: 2,
    selfId: "me",
    playerKey,
    selfTeam: 0,
    bots: [],
    ended: ENDED,
    chart: null,
    ...change,
  };
}

describe("Match history's list (#3848)", () => {
  it("names a win, a loss and a draw from the keeper's team", () => {
    expect(matchResult(record("a", "k"))).toBe("hud.outcomeVictory");
    expect(matchResult(record("a", "k", { selfTeam: 1 }))).toBe("hud.outcomeDefeat");
    expect(matchResult(record("a", "k", { ended: { ...ENDED, winningTeam: null } }))).toBe(
      "hud.outcomeDraw",
    );
  });

  it("reads each line's map, mode and result", () => {
    const [line] = historyRows([record("a", "k")], true, "k").rows;
    expect(line?.mode).toBe(t("matches.kindHosted"));
    expect(line?.result).toBe(t("hud.outcomeVictory"));
    expect(line?.map).not.toBe("");
    expect(line?.when).not.toBe("");
  });

  it("shows only this key's matches with My matches, every one without", () => {
    const records = [record("mine", "k"), record("theirs", "old")];
    expect(historyRows(records, true, "k").rows.map(({ record }) => record.id)).toEqual(["mine"]);
    expect(historyRows(records, false, "k").rows.map(({ record }) => record.id)).toEqual([
      "mine",
      "theirs",
    ]);
  });

  it("says why the list is empty", () => {
    expect(historyRows([], true, "k").empty).toBe(t("history.empty"));
    expect(historyRows([record("theirs", "old")], true, "k").empty).toBe(t("history.emptyMine"));
    expect(historyRows([record("theirs", "old")], false, "k").empty).toBeUndefined();
  });
});
