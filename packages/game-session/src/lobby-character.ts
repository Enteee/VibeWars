import { isProfessionId } from "@vibewars/game-core";
import type { WireLobbyCharacter } from "@vibewars/game-protocol";

import type { LobbyCharacter } from "./lobby-connection.js";
import { sanitizeName } from "./names.js";

/** What a character with nothing left of its name after `sanitizeName` is listed as. */
export const UNNAMED_CHARACTER = "Unnamed";

/**
 * The character a lobby member brings (#580), as the lobby lists it: its
 * name made safe to show, and its professions only if they are real ones.
 * A primary that is not a profession, or a secondary that is not one or
 * repeats the primary, is no build anyone can bring, so it lists as the
 * house loadout. The host runs a join's through here, and a peer runs the
 * host's state through it too: neither shows what the other could not have
 * meant.
 */
export function lobbyCharacter(wire: WireLobbyCharacter | null): LobbyCharacter | null {
  if (wire === null || !isProfessionId(wire.primary)) {
    return null;
  }
  const { secondary } = wire;
  if (secondary !== null && (!isProfessionId(secondary) || secondary === wire.primary)) {
    return null;
  }
  return { name: sanitizeName(wire.name, UNNAMED_CHARACTER), primary: wire.primary, secondary };
}
