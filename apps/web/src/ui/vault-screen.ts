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
 * `undefined` for any record but a won Hall.
 */
export function hallHolderOf(record: MatchRecord): string | undefined {
  if (
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

/** The newest Hall holder heard. */
export interface HallWatch {
  readonly holder: () => string | undefined;
  readonly close: () => void;
}

/**
 * Hear who holds the Hall, from `watch`. `announce` is told of a Hall won
 * after `openedAt` only: the records replayed on connecting are history.
 * `changed` is told of every new holder.
 */
export function watchHall(
  watch: (on: MatchRecordWatchHandlers) => MatchRecordWatch,
  openedAt: number,
  announce: (text: string) => void,
  changed: () => void,
): HallWatch {
  let newest: { readonly holder: string; readonly endedAt: number } | undefined;
  const records = watch({
    record: ({ record }) => {
      const holder = hallHolderOf(record);
      if (holder === undefined) {
        return;
      }
      if (record.endedAt * 1000 > openedAt) {
        announce(t("queue.hallHeldBy", { holder }));
      }
      if (newest === undefined || record.endedAt > newest.endedAt) {
        newest = { holder, endedAt: record.endedAt };
        changed();
      }
    },
    noRelay: () => undefined,
  });
  return {
    holder: () => newest?.holder,
    close: () => {
      records.close();
    },
  };
}
