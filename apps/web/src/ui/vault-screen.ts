import { nextHallSlotMs } from "@vibewars/game-core";
import type { MatchRecord } from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { ASCENT_PROGRESSION, ascentMapPool } from "../net/maps.js";
import type { MatchRecordWatch, MatchRecordWatchHandlers } from "../net/transport/match-records.js";
import { waitedLabel } from "./queue-screen.js";

/**
 * The Vault (#2701): where a party waits for the Hall of Heroes, which
 * forms only every 12 minutes, and who holds the Hall meanwhile. The
 * holder is the newest Hall win among the match records, host-reported
 * as all of them are.
 */

/** Whether a side at `round` waits in the Vault. */
export function isVaultRound(round: number | null): boolean {
  return round === ASCENT_PROGRESSION.length - 1;
}

/** The Vault's lines at `nowMs`, with `holder` holding the Hall or nobody. */
export function vaultLines(
  nowMs: number,
  holder: string | undefined,
): { readonly title: string; readonly countdown: string; readonly holder: string } {
  return {
    title: t("queue.vault"),
    countdown: t("queue.vaultOpensIn", { time: waitedLabel(nextHallSlotMs(nowMs) - nowMs) }),
    holder: holder === undefined ? t("queue.hallUnheld") : t("queue.hallHeldBy", { holder }),
  };
}

/**
 * Who `record` says now holds the Hall: its winning party's guild tag when
 * more than half of its people share one, else its leader's name.
 * `undefined` for any record but a won Hall: a Hosted Game may play the
 * same maps, and holds nothing.
 */
export function hallHolderOf(record: MatchRecord): string | undefined {
  if (
    record.mode !== "heroes-ascent" ||
    !ascentMapPool(ASCENT_PROGRESSION.length - 1).includes(record.map) ||
    record.winningTeam === null
  ) {
    return undefined;
  }
  const players = record.teams[record.winningTeam]?.players ?? [];
  const people = players.filter((player) => !player.bot);
  const tags = new Map<string, number>();
  for (const { guildTag } of people) {
    if (guildTag !== null) {
      tags.set(guildTag, (tags.get(guildTag) ?? 0) + 1);
    }
  }
  for (const [tag, count] of tags) {
    if (count * 2 > people.length) {
      return tag;
    }
  }
  return (people[0] ?? players[0])?.name;
}

/**
 * The Hall watch runs on every open page, on the thread that hosts matches,
 * and records are free to forge: a few checks at once, for the replay's
 * newest wins, and then one every 10 s. A real Hall ends at most once a slot.
 */
const HALL_VERIFY_BURST = 5;
const HALL_VERIFY_PER_SECOND = 0.1;

/** How far ahead of this clock a Hall win's end may be: a host's clock is a little off, no more. */
export const HALL_CLOCK_SKEW_MS = 30_000;

/** The newest Hall holder heard. */
export interface HallWatch {
  readonly holder: () => string | undefined;
  /** Stop listening, and checking signatures, for as long as a match runs. */
  readonly pause: () => void;
  /** Listen again; what the relays replay finds a Hall won meanwhile. */
  readonly resume: () => void;
}

/**
 * Hear who holds the Hall, from `watch`. `announce` is told of a new holder
 * who won since the watch last opened, at most once a slot, as one Hall forms
 * a slot; the records replayed on connecting are history. `changed` is told
 * of every new holder.
 */
export function watchHall(
  watch: (on: MatchRecordWatchHandlers) => MatchRecordWatch,
  now: () => number,
  announce: (text: string) => void,
  changed: () => void,
): HallWatch {
  let newest: { readonly holder: string; readonly endedAt: number } | undefined;
  let announcedSlot: number | undefined;
  const open = (): MatchRecordWatch => {
    const openedAt = now();
    return watch({
      filter: {
        wants: (record) => hallHolderOf(record) !== undefined,
        verifyPerSecond: HALL_VERIFY_PER_SECOND,
        verifyBurst: HALL_VERIFY_BURST,
      },
      record: ({ record }) => {
        const holder = hallHolderOf(record);
        const heardAt = now();
        const endedAt = record.endedAt * 1000;
        if (
          holder === undefined ||
          endedAt > heardAt + HALL_CLOCK_SKEW_MS ||
          (newest !== undefined && record.endedAt <= newest.endedAt)
        ) {
          return;
        }
        newest = { holder, endedAt: record.endedAt };
        changed();
        const slot = nextHallSlotMs(heardAt);
        if (endedAt > openedAt && slot !== announcedSlot) {
          announcedSlot = slot;
          announce(t("queue.hallHeldBy", { holder }));
        }
      },
      noRelay: () => undefined,
    });
  };
  let records: MatchRecordWatch | undefined = open();
  return {
    holder: () => newest?.holder,
    pause: () => {
      records?.close();
      records = undefined;
    },
    resume: () => {
      records ??= open();
    },
  };
}

/** How many holds the Matches page lists. */
const HALL_HOLDS_SHOWN = 20;

/** One of a hold's people: a name and the key its signet (#2805) comes from. */
export interface HallPerson {
  readonly name: string;
  readonly pubkey: string | null;
}

/** An unbroken run of Hall wins by one holder. */
export interface HallHold {
  readonly holder: string;
  /** The winning team's non-bot people, from the newest win. */
  readonly people: readonly HallPerson[];
  /** Unix seconds, of the newest win. */
  readonly endedAt: number;
  readonly wins: number;
}

/**
 * The newest holds among `records`, newest first. A record is forgeable, so
 * a win from the far future is dropped and cannot pin the top row.
 */
export function hallHolds(records: readonly MatchRecord[], nowMs: number): HallHold[] {
  const holds: HallHold[] = [];
  const oldestFirst = records
    .filter((record) => record.endedAt * 1000 <= nowMs + HALL_CLOCK_SKEW_MS)
    .sort((a, b) => a.endedAt - b.endedAt);
  for (const record of oldestFirst) {
    const holder = hallHolderOf(record);
    if (holder === undefined || record.winningTeam === null) {
      continue;
    }
    const players = record.teams[record.winningTeam]?.players ?? [];
    const people = players
      .filter((player) => !player.bot)
      .map(({ name, pubkey }) => ({ name, pubkey }));
    const running = holds.at(-1);
    const wins = running?.holder === holder ? running.wins + 1 : 1;
    if (wins > 1) {
      holds.pop();
    }
    holds.push({ holder, people, endedAt: record.endedAt, wins });
  }
  return holds.slice(-HALL_HOLDS_SHOWN).reverse();
}
