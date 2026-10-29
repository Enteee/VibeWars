import type { MatchOutcome } from "../match-view.js";
import { MATCH_RECORD_SCHEMA_VERSION, type MatchResult, type StoredMatchRecord } from "./schema.js";

/** Who played a finished match, where, and when (#1404). */
export interface MatchRecordContext {
  readonly id: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly mapId: string;
  readonly mode: string;
  readonly finishedAt: number;
}

/** A character's record (#1404). */
export interface Tally {
  readonly wins: number;
  readonly losses: number;
  readonly draws: number;
}

/**
 * The record of a finished match from the player's team's side (#1404):
 * a win when its team won, a draw when nobody did, else a loss.
 * `undefined` for a spectator, and for a match the host left: nobody
 * finished that one.
 */
export function matchRecordFrom(
  outcome: MatchOutcome,
  context: MatchRecordContext,
): StoredMatchRecord | undefined {
  if (outcome.selfTeam === undefined || outcome.endReason === "host-left") {
    return undefined;
  }
  const result: MatchResult =
    outcome.winningTeam === undefined
      ? "draw"
      : outcome.winningTeam === outcome.selfTeam
        ? "win"
        : "loss";
  return { schemaVersion: MATCH_RECORD_SCHEMA_VERSION, ...context, result };
}

/** Each character's wins, losses and draws, by character id. */
export function tally(records: readonly StoredMatchRecord[]): Map<string, Tally> {
  const tallies = new Map<string, Tally>();
  for (const record of records) {
    const { wins, losses, draws } = tallies.get(record.characterId) ?? {
      wins: 0,
      losses: 0,
      draws: 0,
    };
    tallies.set(record.characterId, {
      wins: wins + (record.result === "win" ? 1 : 0),
      losses: losses + (record.result === "loss" ? 1 : 0),
      draws: draws + (record.result === "draw" ? 1 : 0),
    });
  }
  return tallies;
}
