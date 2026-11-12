import { isLobbyCode, parseWireCape, type WireCape } from "@vibewars/game-protocol";
import { sanitizeGuildTag } from "@vibewars/game-session";

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

/** The longest pasted invite link read (#2882); any real one is far shorter. */
export const MAX_PASTED_LINK_LENGTH = 2048;

/** What a pasted invite link turned out to be (#2882). */
export type PastedLobbyLink =
  | { readonly kind: "link"; readonly fragment: string }
  | { readonly kind: "malformed" }
  | { readonly kind: "other-build" };

/**
 * Read a link pasted into the Lobby window (#2882). Only this very build's
 * links count: another path on this origin may speak another protocol.
 */
export function readPastedLobbyLink(
  text: string,
  here: { readonly origin: string; readonly pathname: string },
): PastedLobbyLink {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > MAX_PASTED_LINK_LENGTH || !URL.canParse(trimmed)) {
    return { kind: "malformed" };
  }
  const url = new URL(trimmed);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { kind: "malformed" };
  }
  if (url.origin !== here.origin || url.pathname !== here.pathname) {
    return { kind: "other-build" };
  }
  return parseLobbyFragment(url.hash).kind === "invite"
    ? { kind: "link", fragment: url.hash }
    : { kind: "malformed" };
}

/** The fragment part a guild link carries its tag and cape in (#3167). */
export const GUILD_FRAGMENT_KEY = "guild";

/** What a page's fragment says about a guild to join. `rest` is the fragment with `guild=` taken out. */
export type GuildFragment =
  | { readonly kind: "none" }
  | { readonly kind: "invalid"; readonly rest: string }
  | {
      readonly kind: "guild";
      readonly tag: string;
      /** `null` for a link that carries only the tag: it clears the cape. */
      readonly cape: WireCape | null;
      readonly rest: string;
    };

/** One `guild=` value, `<TAG>` or `<TAG>.<main>.<trim>.<emblem>`, exactly; else `undefined`. */
function readGuild(value: string): { tag: string; cape: WireCape | null } | undefined {
  const [tag, ...cape] = value.split(".");
  if (tag === undefined || sanitizeGuildTag(tag) !== tag) {
    return undefined;
  }
  if (cape.length === 0) {
    return { tag, cape: null };
  }
  const [main, trim, emblem] = cape;
  const parsed = cape.length === 3 ? parseWireCape({ main, trim, emblem }) : undefined;
  return parsed === undefined ? undefined : { tag, cape: parsed };
}

/**
 * Read `guild=` out of `hash` (#3167). Every `guild=` part is consumed and
 * the first valid one wins; none valid, or a fragment
 * longer than any real link, is invalid.
 */
export function parseGuildFragment(hash: string): GuildFragment {
  const part = takeFragmentPart(hash, GUILD_FRAGMENT_KEY);
  if (part === undefined) {
    return { kind: "none" };
  }
  const guild =
    hash.length > MAX_PASTED_LINK_LENGTH
      ? undefined
      : part.values.map(readGuild).find((each) => each !== undefined);
  return guild === undefined
    ? { kind: "invalid", rest: part.rest }
    : { kind: "guild", ...guild, rest: part.rest };
}
