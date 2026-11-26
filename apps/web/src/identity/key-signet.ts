import { MAX_WIRE_SIGNET } from "@vibewars/game-protocol";

import { signetWord } from "./signet.js";

const keySignets = new Map<string, number>();

/** A player key's signet bits (#2805), as the match host reports them; derived once per key. */
export function keySignet(pubkey: string): number {
  let bits = keySignets.get(pubkey);
  if (bits === undefined) {
    bits = signetWord(pubkey) & MAX_WIRE_SIGNET;
    keySignets.set(pubkey, bits);
  }
  return bits;
}
