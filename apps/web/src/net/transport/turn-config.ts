import { STORAGE_NAMESPACE } from "../../storage/namespace.js";
import { takeFragmentPart } from "../fragment.js";

/**
 * A TURN relay the player brings (#972): the project hosts none (ADR-0022),
 * but a pair that cannot connect directly can go through one a friend
 * runs, shared as an invite link whose fragment carries the config.
 *
 * The fragment, not the query string: a browser never sends it, so no
 * server log and no `Referer` sees the credential. A link is hostile
 * input, so `validateTurnConfig` is strict and takes nothing it does not
 * name. The config stays on this device: never on the wire, never logged.
 */

export interface TurnConfig {
  readonly urls: readonly string[];
  readonly username: string;
  readonly credential: string;
}

/** The fragment key a relay invite link carries its config under. */
const FRAGMENT_KEY = "turn";
const MAX_URLS = 4;
const MAX_FIELD_LENGTH = 256;
const MAX_PORT = 65535;
/** The largest decoded fragment value read at all. */
const MAX_DECODED_BYTES = 4096;

/**
 * `turn:host[:port][?transport=udp|tcp]`, or `turns:`. A host is a name
 * or an address, IPv6 in brackets; `stun:` is Trystero's already.
 */
const TURN_URL =
  /^turns?:(\[[0-9a-fA-F:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::(\d{1,5}))?(?:\?transport=(?:udp|tcp))?$/;

/** What a stored relay that fails validation becomes: gone, with this said once. */
export const UNREADABLE_RELAY_NOTICE = "Saved relay was unreadable and was removed.";

/** `value` as a relay config, or `undefined` when it is not exactly one. */
export function validateTurnConfig(value: unknown): TurnConfig | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "credential,urls,username") {
    return undefined;
  }
  const { urls, username, credential } = value as Record<string, unknown>;
  if (!isTurnUrls(urls) || !isField(username) || !isField(credential)) {
    return undefined;
  }
  return { urls, username, credential };
}

function isTurnUrls(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_URLS) {
    return false;
  }
  const urls: readonly unknown[] = value;
  return urls.every(
    (url) => typeof url === "string" && url.length <= MAX_FIELD_LENGTH && isTurnUrl(url),
  );
}

function isTurnUrl(url: string): boolean {
  const match = TURN_URL.exec(url);
  const port = match?.[2];
  return match !== null && (port === undefined || Number(port) <= MAX_PORT);
}

function isField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
}

/** The host each URL names, deduplicated, as the player is shown it: never the credential. */
export function relayHosts(config: TurnConfig): string {
  const hosts = config.urls.map((url) => TURN_URL.exec(url)?.[1] ?? url);
  return [...new Set(hosts)].join(", ");
}

/** `turn=<base64url(JSON)>`, the fragment an invite link carries, without its `#`. */
export function encodeTurnFragment(config: TurnConfig): string {
  const json = JSON.stringify({
    urls: config.urls,
    username: config.username,
    credential: config.credential,
  });
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${FRAGMENT_KEY}=${base64url}`;
}

/** What a page's fragment says about a relay. `rest` is the fragment with `turn=` taken out. */
export type TurnFragment =
  | { readonly kind: "none" }
  | { readonly kind: "malformed"; readonly rest: string }
  | { readonly kind: "config"; readonly config: TurnConfig; readonly rest: string };

/**
 * Read `turn=` out of `hash` (`location.hash`, with or without its `#`).
 * Every `turn=` part is consumed, so no credential stays behind, and more
 * than one is malformed; the other `&`-separated parts are left in
 * `rest`, in order, without a leading `#`.
 */
export function parseTurnFragment(hash: string): TurnFragment {
  const part = takeFragmentPart(hash, FRAGMENT_KEY);
  const [value] = part?.values ?? [];
  if (part === undefined || value === undefined) {
    return { kind: "none" };
  }
  const { rest } = part;
  const config = part.values.length === 1 ? decode(value) : undefined;
  return config === undefined ? { kind: "malformed", rest } : { kind: "config", config, rest };
}

function decode(value: string): TurnConfig | undefined {
  // Base64 is 4 characters for 3 bytes: anything longer decodes past the limit.
  if (value.length > Math.ceil((MAX_DECODED_BYTES * 4) / 3) || !/^[A-Za-z0-9_-]*=*$/.test(value)) {
    return undefined;
  }
  try {
    const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return validateTurnConfig(JSON.parse(json));
  } catch {
    return undefined;
  }
}

const RELAY_KEY = `${STORAGE_NAMESPACE}.turn-relay`;

/** The relay for this visit when storage refuses it. */
let unstored: TurnConfig | undefined;

/**
 * The relay, read at each join so a change in Options counts from the next
 * one. A saved one that fails validation is removed, and `onRemoved` hears
 * of it: the app says so once, at boot.
 */
export function loadTurnConfig(onRemoved?: () => void): TurnConfig | undefined {
  let raw: string | null;
  try {
    raw = localStorage.getItem(RELAY_KEY);
  } catch {
    return unstored;
  }
  if (raw === null) {
    return undefined;
  }
  let config: TurnConfig | undefined;
  try {
    config = validateTurnConfig(JSON.parse(raw));
  } catch {
    config = undefined;
  }
  if (config === undefined) {
    forgetTurnConfig();
    onRemoved?.();
  }
  return config;
}

export function saveTurnConfig(config: TurnConfig): void {
  unstored = config;
  try {
    localStorage.setItem(RELAY_KEY, JSON.stringify(config));
  } catch {
    // Kept in memory: the relay works for this visit, it just is not remembered.
  }
}

export function forgetTurnConfig(): void {
  unstored = undefined;
  try {
    localStorage.removeItem(RELAY_KEY);
  } catch {
    // Nothing was stored to remove.
  }
}
