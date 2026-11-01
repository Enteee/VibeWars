import { hmac } from "@noble/hashes/hmac.js";
import { sha1 } from "@noble/hashes/legacy.js";

import { STORAGE_NAMESPACE } from "../../storage/namespace.js";

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
  const host = match?.[1];
  const port = match?.[2];
  return (
    host !== undefined && isPublicHost(host) && (port === undefined || Number(port) <= MAX_PORT)
  );
}

/**
 * Whether `host` may be a relay at all (#2091): a relay is hostile input,
 * from a link or a lobby, and one on the player's own machine or network
 * would turn TURN into a probe of it. Literals in a private, loopback,
 * link-local or CGNAT range are refused, IPv4 and IPv6 alike, and so are
 * the names that are local by definition. A public name that resolves
 * privately cannot be told from here: that is the relay operator's
 * `denied-peer-ip` (ADR-0048).
 */
function isPublicHost(host: string): boolean {
  if (host.startsWith("[")) {
    const groups = ipv6Groups(host.slice(1, -1));
    return groups !== undefined && isPublicIpv6(groups);
  }
  const name = host.toLowerCase();
  const labels = name.split(".");
  // A numeric last label is an address, however it is spelled ("127.1",
  // "0x7f.0.0.1"): only the plain dotted quad is read as one, and checked.
  if (/^(?:0x[0-9a-f]*|\d+)$/.test(labels[labels.length - 1] ?? "")) {
    const octets = ipv4Octets(name);
    return octets !== undefined && isPublicIpv4(octets);
  }
  return name !== "localhost" && !name.endsWith(".localhost") && !name.endsWith(".local");
}

/** `a.b.c.d`, each 0–255 without a leading zero, as four octets. */
function ipv4Octets(text: string): readonly number[] | undefined {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^(?:0|[1-9]\d{0,2})$/.test(part))) {
    return undefined;
  }
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : undefined;
}

/** Not in 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12 or 192.168/16. */
function isPublicIpv4([a = 0, b = 0]: readonly number[]): boolean {
  return !(
    a === 0 ||
    a === 10 ||
    (a === 100 && b >= 64 && b < 128) ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b < 32) ||
    (a === 192 && b === 168)
  );
}

/** An IPv6 address as its eight 16-bit groups, `::` and a dotted IPv4 tail expanded. */
function ipv6Groups(text: string): readonly number[] | undefined {
  const halves = text.split("::");
  if (halves.length > 2) {
    return undefined;
  }
  const parse = (half: string): number[] | undefined => {
    if (half === "") {
      return [];
    }
    const groups: number[] = [];
    const parts = half.split(":");
    for (const [i, part] of parts.entries()) {
      const octets = i === parts.length - 1 && part.includes(".") ? ipv4Octets(part) : undefined;
      if (octets !== undefined) {
        const [a = 0, b = 0, c = 0, d = 0] = octets;
        groups.push((a << 8) | b, (c << 8) | d);
      } else if (/^[0-9a-f]{1,4}$/i.test(part)) {
        groups.push(parseInt(part, 16));
      } else {
        return undefined;
      }
    }
    return groups;
  };
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if (head === undefined || tail === undefined) {
    return undefined;
  }
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) {
    return undefined;
  }
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/**
 * Not `::`, `::1`, ULA fc00::/7 or link-local fe80::/10; and the IPv4 a
 * v4-mapped `::ffff:` or NAT64 `64:ff9b::/96` address carries is checked
 * as IPv4.
 */
function isPublicIpv6(groups: readonly number[]): boolean {
  const [g0 = 0, g1 = 0, , , , g5 = 0, g6 = 0, g7 = 0] = groups;
  const embedded = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];
  const zeroUpTo = (end: number): boolean => groups.slice(0, end).every((group) => group === 0);
  if (zeroUpTo(7) && g7 <= 1) {
    return false;
  }
  if (zeroUpTo(5) && g5 === 0xffff) {
    return isPublicIpv4(embedded);
  }
  if (g0 === 0x64 && g1 === 0xff9b && groups.slice(2, 6).every((group) => group === 0)) {
    return isPublicIpv4(embedded);
  }
  return (g0 & 0xfe00) !== 0xfc00 && (g0 & 0xffc0) !== 0xfe80;
}

function isField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_FIELD_LENGTH;
}

/** The host each URL names, deduplicated, as the player is shown it: never the credential. */
export function relayHosts(config: TurnConfig): string {
  const hosts = config.urls.map((url) => TURN_URL.exec(url)?.[1] ?? url);
  return [...new Set(hosts)].join(", ");
}

/**
 * A relay the player runs with coturn's `use-auth-secret` (#2091, the TURN
 * REST scheme): its shared secret mints credentials that expire on their
 * own, so one can be handed to a lobby. The secret never leaves this
 * device; only what `mintTurnCredential` makes of it does.
 */
export interface SharedRelay {
  readonly urls: readonly string[];
  readonly secret: string;
}

/** `value` as a shared relay, or `undefined` when it is not exactly one: the same URL rules. */
export function validateSharedRelay(value: unknown): SharedRelay | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  if (Object.keys(value).sort().join(",") !== "secret,urls") {
    return undefined;
  }
  const { urls, secret } = value as Record<string, unknown>;
  return isTurnUrls(urls) && isField(secret) ? { urls, secret } : undefined;
}

/** How long a minted credential lets its holder relay: anyone in the lobby, so not long. */
export const TURN_CREDENTIAL_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * A credential for `shared` that expires `TURN_CREDENTIAL_TTL_MS` after
 * `nowMs`, as coturn's REST scheme checks it: the username is
 * `<expiry unix seconds>:<tag>`, the credential base64(HMAC-SHA1(secret,
 * username)). `tag` names the lobby in the relay's logs, so its operator
 * can tell one from another and block it.
 */
export function mintTurnCredential(shared: SharedRelay, tag: string, nowMs: number): TurnConfig {
  const expiry = Math.floor((nowMs + TURN_CREDENTIAL_TTL_MS) / 1000);
  const username = `${String(expiry)}:${tag}`;
  const mac = hmac(
    sha1,
    new TextEncoder().encode(shared.secret),
    new TextEncoder().encode(username),
  );
  return {
    urls: [...shared.urls],
    username,
    credential: btoa(String.fromCharCode(...mac)),
  };
}

/** When a minted credential expires, in ms since the epoch; `undefined` for any other username. */
export function credentialExpiry(config: TurnConfig): number | undefined {
  const match = /^(\d{1,12}):/.exec(config.username);
  return match?.[1] === undefined ? undefined : Number(match[1]) * 1000;
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
  const parts = (hash.startsWith("#") ? hash.slice(1) : hash).split("&");
  const isTurn = (part: string): boolean => part.startsWith(`${FRAGMENT_KEY}=`);
  const values = parts.filter(isTurn).map((part) => part.slice(FRAGMENT_KEY.length + 1));
  const [value] = values;
  if (value === undefined) {
    return { kind: "none" };
  }
  const rest = parts.filter((part) => !isTurn(part)).join("&");
  const config = values.length === 1 ? decode(value) : undefined;
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

/**
 * One relay record in `localStorage` under `key`, read at each join so a
 * change in Options counts from the next one. A saved one that fails
 * `validate` is removed, and `onRemoved` hears of it: the app says so
 * once, at boot. When storage refuses it, it is kept for this visit.
 */
function storedRelay<T>(key: string, validate: (value: unknown) => T | undefined) {
  let unstored: T | undefined;
  const forget = (): void => {
    unstored = undefined;
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing was stored to remove.
    }
  };
  return {
    load: (onRemoved?: () => void): T | undefined => {
      let raw: string | null;
      try {
        raw = localStorage.getItem(key);
      } catch {
        return unstored;
      }
      if (raw === null) {
        return undefined;
      }
      let value: T | undefined;
      try {
        value = validate(JSON.parse(raw));
      } catch {
        value = undefined;
      }
      if (value === undefined) {
        forget();
        onRemoved?.();
      }
      return value;
    },
    save: (value: T): void => {
      unstored = value;
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Kept in memory: the relay works for this visit, it just is not remembered.
      }
    },
    forget,
  };
}

const relay = storedRelay(`${STORAGE_NAMESPACE}.turn-relay`, validateTurnConfig);

/** The player's own relay (#972). */
export const loadTurnConfig = relay.load;
export const saveTurnConfig = relay.save;
export const forgetTurnConfig = relay.forget;

const sharedRelay = storedRelay(`${STORAGE_NAMESPACE}.turn-shared-relay`, validateSharedRelay);

/** The player's REST-secret relay (#2091), which their lobbies may be offered. */
export const loadSharedRelay = sharedRelay.load;
export const saveSharedRelay = sharedRelay.save;
export const forgetSharedRelay = sharedRelay.forget;

const SHARING_KEY = `${STORAGE_NAMESPACE}.turn-share`;

/** Whether this player's coded lobbies offer their shared relay (#2091): off unless ticked. */
export function loadRelaySharing(): boolean {
  try {
    return localStorage.getItem(SHARING_KEY) === "on";
  } catch {
    return false;
  }
}

export function saveRelaySharing(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(SHARING_KEY, "on");
    } else {
      localStorage.removeItem(SHARING_KEY);
    }
  } catch {
    // Not remembered: the box is unticked again next visit, which shares nothing.
  }
}
