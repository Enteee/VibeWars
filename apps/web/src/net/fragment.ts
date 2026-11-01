import { isLobbyCode } from "@vibewars/game-protocol";

/**
 * An invite link's fragment (#972, #2100) is `&`-separated `name=value`
 * parts, `#lobby=<key>&turn=<relay>`, each taken out by its own reader.
 */

/** The fragment part a lobby invite link carries its key in. */
export const LOBBY_FRAGMENT_KEY = "lobby";

/** Every `name=` part's value of `hash`, and the other parts as they were. */
export interface FragmentPart {
  readonly values: readonly string[];
  /** The other `&`-separated parts, in order, without a leading `#`. */
  readonly rest: string;
}

/**
 * Take every `name=` part out of `hash` (`location.hash`, with or without
 * its `#`); `undefined` when it has none.
 */
export function takeFragmentPart(hash: string, name: string): FragmentPart | undefined {
  const parts = (hash.startsWith("#") ? hash.slice(1) : hash).split("&");
  const isPart = (part: string): boolean => part.startsWith(`${name}=`);
  const values = parts.filter(isPart).map((part) => part.slice(name.length + 1));
  if (values.length === 0) {
    return undefined;
  }
  return { values, rest: parts.filter((part) => !isPart(part)).join("&") };
}

/** What a page's fragment says about a lobby to join. `rest` is the fragment with `lobby=` taken out. */
export type LobbyFragment =
  | { readonly kind: "none" }
  | { readonly kind: "malformed"; readonly rest: string }
  | { readonly kind: "invite"; readonly code: string; readonly rest: string };

/**
 * Read `lobby=` out of `hash`. Every `lobby=` part is consumed, so no key
 * stays behind; one that is not a key, or more than one, is malformed.
 */
export function parseLobbyFragment(hash: string): LobbyFragment {
  const part = takeFragmentPart(hash, LOBBY_FRAGMENT_KEY);
  if (part === undefined) {
    return { kind: "none" };
  }
  const [code] = part.values;
  return part.values.length === 1 && code !== undefined && isLobbyCode(code)
    ? { kind: "invite", code, rest: part.rest }
    : { kind: "malformed", rest: part.rest };
}
