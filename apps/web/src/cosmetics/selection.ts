/**
 * What a player wears and what a viewer draws (ADR-0056). A selection is
 * a list of catalog ids its key signs; each viewer checks the signature
 * and its own copy of the leaderboard, and draws what it cannot verify
 * as the default, quietly. Your own selection is drawn for you as your
 * last known entry allows.
 */

import type { WireCosmetics } from "@vibewars/game-protocol";
import type { CosmeticSelection, PlayerKey } from "@vibewars/game-session";

import type { Leaderboard } from "../net/leaderboard.js";
import { verifyCosmetics } from "../net/transport/player-key.js";

import { COSMETIC_SLOTS, cosmeticById, type CosmeticEntry, type CosmeticSlot } from "./catalog.js";
import { isUnlocked, type UnlockFacts } from "./unlocks.js";

/** At most one id per slot: what a player picked. */
export type CosmeticChoice = Partial<Readonly<Record<CosmeticSlot, string>>>;

/** What is drawn, per slot: each a known, earned entry. */
export type WornCosmetics = Partial<Readonly<Record<CosmeticSlot, CosmeticEntry>>>;

/** Nothing worn: the default look. */
export const DEFAULT_LOOK: WornCosmetics = {};

/** `choice` as `pubkey`'s selection at `at`, ms since the epoch, its ids in slot order. */
export function buildSelection(
  pubkey: string,
  choice: CosmeticChoice,
  at: number,
): CosmeticSelection {
  return {
    pubkey,
    ids: COSMETIC_SLOTS.flatMap((slot) => {
      const id = choice[slot];
      return id === undefined ? [] : [id];
    }),
    at,
  };
}

/** `choice`, signed by `key` at `at`, as a join carries it. */
export function signSelection(key: PlayerKey, choice: CosmeticChoice, at: number): WireCosmetics {
  const selection = buildSelection(key.pubkey, choice, at);
  return { ids: selection.ids, at: selection.at, sig: key.signCosmetics(selection) };
}

/** Checks already made, as a viewer asks every frame; let go of when full. */
const verified = new Map<string, boolean>();
const MAX_VERIFIED = 256;

/** Whether `cosmetics` is `pubkey`'s own signed selection. */
export function verifySelection(pubkey: string, cosmetics: WireCosmetics): boolean {
  const memo = JSON.stringify([pubkey, cosmetics.ids, cosmetics.at, cosmetics.sig]);
  let holds = verified.get(memo);
  if (holds === undefined) {
    holds = verifyCosmetics({ pubkey, ids: cosmetics.ids, at: cosmetics.at }, cosmetics.sig);
    if (verified.size >= MAX_VERIFIED) {
      verified.clear();
    }
    verified.set(memo, holds);
  }
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

/** `pubkey`'s entry in `board`, if it lists it. */
export function factsOf(board: Leaderboard | undefined, pubkey: string): UnlockFacts | undefined {
  return board?.entries.find((entry) => entry.pubkey === pubkey);
}

/**
 * What a viewer draws of another seat (ADR-0056 §3): its selection only
 * if `showOthers`, its signature holds for its key, and the viewer's
 * `board` shows the key earned each item. Anything else is the default.
 */
export function visibleCosmetics(
  seat: { readonly playerPubkey: string; readonly cosmetics: WireCosmetics } | undefined,
  board: Leaderboard | undefined,
  showOthers: boolean,
): WornCosmetics {
  if (!showOthers || seat === undefined || !verifySelection(seat.playerPubkey, seat.cosmetics)) {
    return DEFAULT_LOOK;
  }
  return wornOf(seat.cosmetics.ids, factsOf(board, seat.playerPubkey));
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
