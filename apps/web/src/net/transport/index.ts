import type { Transport } from "@vibewars/game-session";

import { joinBroadcastRoom } from "./broadcast-channel.js";
import { joinTrysteroRoom } from "./trystero.js";

/**
 * Join the room for lobby code `code` (#403): the one place a transport
 * is chosen.
 *
 * `VITE_VIBEWARS_TRANSPORT` is `broadcast` only in the build e2e runs
 * against, whose pages share one browser; every other build plays over
 * Trystero. A capability switch for one kind of build, as `ONLINE_PLAY`
 * was, not a compatibility path. `vite.config.ts` refuses any other value.
 */
export function joinRoom(code: string): Transport {
  return import.meta.env.VITE_VIBEWARS_TRANSPORT === "broadcast"
    ? joinBroadcastRoom(code)
    : joinTrysteroRoom(code);
}
