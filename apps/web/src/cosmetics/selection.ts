/**
 * What a player wears and what a viewer draws (ADR-0056). A selection is
 * a list of catalog ids its key signs; each viewer checks the signature
 * and its own copy of the leaderboard, and draws what it cannot verify
 * as the default, quietly. Your own selection is drawn for you as your
 * last known entry allows.
 */

import type { WireCosmetics } from "@vibewars/game-protocol";
import type { CosmeticSelection, PlayerKey } from "@vibewars/game-session";

import type { Leaderboard, LeaderboardEntry } from "../net/leaderboard.js";
import { verifyCosmetics } from "../net/transport/player-key.js";

import { bodyFromKey, bodyOf, type BodyChoice, type FigureBody } from "./body.js";
import { COSMETIC_SLOTS, cosmeticById, type CosmeticEntry, type CosmeticSlot } from "./catalog.js";
import { isUnlocked, type UnlockFacts } from "./unlocks.js";

/** At most one id per slot: what a player picked. */
export type CosmeticChoice = Partial<Readonly<Record<CosmeticSlot, string>>>;

/** What is drawn, per slot: each a known, earned entry. */
export type WornCosmetics = Partial<Readonly<Record<CosmeticSlot, CosmeticEntry>>>;

/** Nothing worn: the default look. */
export const DEFAULT_LOOK: WornCosmetics = {};

/**
 * `choice` and `body` as `pubkey`'s selection at `at`, ms since the
 * epoch, its ids in slot order and each body axis never picked the key's.
 */
export function buildSelection(
  pubkey: string,
  choice: CosmeticChoice,
  body: BodyChoice,
  at: number,
): CosmeticSelection {
  return {
    pubkey,
    ids: COSMETIC_SLOTS.flatMap((slot) => {
      const id = choice[slot];
      return id === undefined ? [] : [id];
    }),
    body: bodyOf(body, pubkey),
    at,
  };
}

/** `choice` and `body`, signed by `key` at `at`, as a join carries it. */
export function signSelection(
  key: PlayerKey,
  choice: CosmeticChoice,
  body: BodyChoice,
  at: number,
): WireCosmetics {
  const selection = buildSelection(key.pubkey, choice, body, at);
  return {
    ids: selection.ids,
    body: selection.body,
    at: selection.at,
    sig: key.signCosmetics(selection),
  };
}

/** Checks already made, by selection object, as a viewer asks every frame. */
const verified = new WeakMap<WireCosmetics, { readonly pubkey: string; readonly holds: boolean }>();

/** Whether `cosmetics` is `pubkey`'s own signed selection. */
export function verifySelection(pubkey: string, cosmetics: WireCosmetics): boolean {
  const memo = verified.get(cosmetics);
  if (memo?.pubkey === pubkey) {
    return memo.holds;
  }
  const holds = verifyCosmetics(
    { pubkey, ids: cosmetics.ids, body: cosmetics.body, at: cosmetics.at },
    cosmetics.sig,
  );
  verified.set(cosmetics, { pubkey, holds });
  return holds;
}

/**
 * What `ids` draw for a key whose leaderboard entry is `facts`: per slot
 * its first id this build knows and `facts` earns. An unknown id, one
 * from a newer build, is passed over; so is one not earned (any more).
 */
export function wornOf(ids: readonly string[], facts: UnlockFacts | undefined): WornCosmetics {
  const worn: Partial<Record<CosmeticSlot, CosmeticEntry>> = {};
  for (const id of ids) {
    const entry = cosmeticById(id);
    if (entry !== undefined && worn[entry.slot] === undefined && isUnlocked(entry, facts)) {
      worn[entry.slot] = entry;
    }
  }
  return worn;
}

/** Each board's entries by key, indexed once a fetched board. */
const indexed = new WeakMap<Leaderboard, ReadonlyMap<string, LeaderboardEntry>>();

/** `pubkey`'s entry in `board`, if it lists it. */
export function factsOf(board: Leaderboard | undefined, pubkey: string): UnlockFacts | undefined {
  if (board === undefined) {
    return undefined;
  }
  let byKey = indexed.get(board);
  if (byKey === undefined) {
    byKey = new Map(board.entries.map((entry) => [entry.pubkey, entry]));
    indexed.set(board, byKey);
  }
  return byKey.get(pubkey);
}

/** What was last drawn of each selection object, and for what. */
const drawn = new WeakMap<
  WireCosmetics,
  {
    readonly pubkey: string;
    readonly board: Leaderboard | undefined;
    readonly worn: WornCosmetics;
  }
>();

/**
 * What a viewer draws of another seat (ADR-0056 §3): its selection only
 * if its signature holds for its key and the viewer's `board` shows the
 * key earned each item. Anything else is the default.
 * Asked every frame, it works it out again only when one of them changes.
 */
export function visibleCosmetics(
  seat: { readonly playerPubkey: string; readonly cosmetics: WireCosmetics } | undefined,
  board: Leaderboard | undefined,
): WornCosmetics {
  if (seat === undefined) {
    return DEFAULT_LOOK;
  }
  const { playerPubkey: pubkey, cosmetics } = seat;
  const last = drawn.get(cosmetics);
  if (last?.pubkey === pubkey && last.board === board) {
    return last.worn;
  }
  const worn = verifySelection(pubkey, cosmetics)
    ? wornOf(cosmetics.ids, factsOf(board, pubkey))
    : DEFAULT_LOOK;
  drawn.set(cosmetics, { pubkey, board, worn });
  return worn;
}

/**
 * What you see yourself wear (ADR-0056 §3): your picks as your own
 * leaderboard entry allows, `facts`, the last one known when a fetch
 * failed. An item you no longer earn stays picked but is drawn default.
 */
export function ownCosmetics(
  choice: CosmeticChoice,
  facts: UnlockFacts | undefined,
): WornCosmetics {
  return wornOf(
    COSMETIC_SLOTS.flatMap((slot) => {
      const id = choice[slot];
      return id === undefined ? [] : [id];
    }),
    facts,
  );
}

/**
 * The body a viewer draws for a seat (#4250): its signed body when the
 * signature holds for its key, whatever the viewer's leaderboard says,
 * since a body is never earned. Anything else, and a seat with no key,
 * is the body its key hashes to, or for no key its `participantId`.
 */
export function visibleBody(
  seat: { readonly playerPubkey: string; readonly cosmetics: WireCosmetics } | undefined,
  participantId: string,
): FigureBody {
  return seat !== undefined && verifySelection(seat.playerPubkey, seat.cosmetics)
    ? seat.cosmetics.body
    : bodyFromKey(seat?.playerPubkey ?? participantId);
}
