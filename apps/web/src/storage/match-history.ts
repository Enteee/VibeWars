import {
  LOBBY_MODES,
  parseWireEnded,
  parseWireMatchChart,
  type LobbyMode,
  type WireEnded,
  type WireMatchChart,
  type WireTeamCount,
} from "@vibewars/game-protocol";

import { MATCH_HISTORY_STORE, type KeyValueStore } from "./repository.js";

/** How many ended matches a player keeps in Match history (#3848): the newest, by when they ended. */
export const KEPT_MATCHES = 50;

/**
 * One ended match this browser's player had a seat in (#3848), as the
 * end panel showed it: the host's `ended` as received and, if it came,
 * its charts. Nothing here is sent anywhere.
 */
export interface MatchRecord {
  readonly id: string;
  /** When the player left the ended match, ms. */
  readonly endedAt: number;
  readonly mapId: string;
  readonly mode: LobbyMode;
  readonly teamCount: WireTeamCount;
  readonly selfId: string;
  /** The player key's public key, hex, when the player left it. */
  readonly pubkey: string;
  readonly selfTeam: number;
  /** How long the match ran, whole seconds. */
  readonly durationSeconds: number;
  readonly bots: readonly string[];
  /** The host's `ended`: its teams (#3903) are the builds the Matches page shows. */
  readonly ended: WireEnded;
  readonly chart: WireMatchChart | null;
}

/** What a finished match's view holds of its record (#3848): the rest is the leaving's. */
export type MatchRecordFields = Omit<MatchRecord, "id" | "endedAt" | "pubkey" | "mode">;

type Fields = Readonly<Record<string, unknown>>;

function fields(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Fields)
    : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isLobbyMode(value: unknown): value is LobbyMode {
  return LOBBY_MODES.some((mode) => mode === value);
}

/** A stored record of the current shape, or `undefined` for anything else (ADR-0016). */
export function parseMatchRecord(value: unknown): MatchRecord | undefined {
  const raw = fields(value);
  if (
    raw === undefined ||
    !isString(raw.id) ||
    typeof raw.endedAt !== "number" ||
    !Number.isFinite(raw.endedAt) ||
    !isString(raw.mapId) ||
    !isLobbyMode(raw.mode) ||
    (raw.teamCount !== 2 && raw.teamCount !== 3) ||
    !isString(raw.selfId) ||
    !isString(raw.pubkey) ||
    typeof raw.selfTeam !== "number" ||
    !Number.isInteger(raw.selfTeam) ||
    raw.selfTeam < 0 ||
    raw.selfTeam >= raw.teamCount ||
    typeof raw.durationSeconds !== "number" ||
    !Number.isInteger(raw.durationSeconds) ||
    raw.durationSeconds < 0 ||
    !Array.isArray(raw.bots) ||
    !raw.bots.every(isString)
  ) {
    return undefined;
  }
  const teamCount = raw.teamCount;
  const ended = parseWireEnded(raw.ended, teamCount);
  if (ended === undefined) {
    return undefined;
  }
  const roster = new Set(ended.summary.map(({ id }) => id));
  const chart = raw.chart === null ? null : parseWireMatchChart(raw.chart, roster, teamCount);
  return chart === undefined
    ? undefined
    : {
        id: raw.id,
        endedAt: raw.endedAt,
        mapId: raw.mapId,
        mode: raw.mode,
        teamCount,
        selfId: raw.selfId,
        pubkey: raw.pubkey,
        selfTeam: raw.selfTeam,
        durationSeconds: raw.durationSeconds,
        bots: raw.bots,
        ended,
        chart,
      };
}

/**
 * The player's last `KEPT_MATCHES` ended matches (#3848), each under its
 * id. A record of the wrong shape is deleted, as `replays.ts` does
 * (ADR-0016): one from a build whose `ended` or chart differed is gone.
 */
export class MatchHistoryStore {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  /** Keeps `record`, then drops the oldest past `KEPT_MATCHES`. */
  async add(record: MatchRecord): Promise<void> {
    await this.#store.put(MATCH_HISTORY_STORE, record.id, record);
    await this.list();
  }

  /** Every kept match, newest first; any that is not one is deleted, and so is any past the newest `KEPT_MATCHES`. */
  async list(): Promise<readonly MatchRecord[]> {
    const records: MatchRecord[] = [];
    for (const { key, value } of await this.#store.list(MATCH_HISTORY_STORE)) {
      const record = parseMatchRecord(value);
      if (record?.id !== key) {
        await this.#store.delete(MATCH_HISTORY_STORE, key);
      } else {
        records.push(record);
      }
    }
    records.sort((a, b) => b.endedAt - a.endedAt || (a.id < b.id ? -1 : 1));
    for (const old of records.slice(KEPT_MATCHES)) {
      await this.#store.delete(MATCH_HISTORY_STORE, old.id);
    }
    return records.slice(0, KEPT_MATCHES);
  }
}
