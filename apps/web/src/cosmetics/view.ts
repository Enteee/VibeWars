/**
 * What this page draws for a seat (ADR-0056): your own picks as your last
 * known entry allows, and anyone else's only as `visibleCosmetics` checks
 * it against this page's leaderboard and the Options toggle.
 */

import type { SeatWorn } from "@vibewars/game-session";

import { leaderboard } from "../net/leaderboard.js";
import { bodyOf, type FigureBody } from "./body.js";
import {
  DEFAULT_LOOK,
  ownCosmetics,
  visibleBody,
  visibleCosmetics,
  type WornCosmetics,
} from "./selection.js";
import { cosmeticsStore } from "./store.js";

/** This page's player key, once main has loaded it. */
let ownPubkey: string | undefined;

/** Tell the view which seats are this page's own. */
export function setOwnPubkey(pubkey: string): void {
  ownPubkey = pubkey;
}

/** What to draw for `seat`; the default for none, a bot or a seat with no key. */
export function seenCosmetics(seat: SeatWorn | undefined): WornCosmetics {
  if (seat === undefined) {
    return DEFAULT_LOOK;
  }
  if (seat.playerPubkey === ownPubkey) {
    return ownLook();
  }
  return visibleCosmetics(seat, leaderboard.current());
}

/** What you see yourself wear: in a match, training too, whatever your seat was sent. */
export function ownLook(): WornCosmetics {
  return ownCosmetics(cosmeticsStore.choice(), cosmeticsStore.lastFacts());
}

/**
 * The body to draw for a seat (#4250): your own as picked, anyone else's
 * as `visibleBody` checks it; a seat with no key, a bot, its
 * `participantId`'s.
 */
export function seenBody(seat: SeatWorn | undefined, participantId: string): FigureBody {
  if (seat !== undefined && seat.playerPubkey === ownPubkey) {
    return bodyOf(cosmeticsStore.body(), ownPubkey);
  }
  return visibleBody(seat, participantId);
}
