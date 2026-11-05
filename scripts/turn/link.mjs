/**
 * Invite links (#974, #2240) in #972's format: the page URL plus
 * `#turn=<base64url(JSON)>`, no padding, where the JSON is
 * `{ urls, secret }`: the friend's own REST secret, which the game mints
 * logins from for itself and its lobbies. The game's own parser is
 * apps/web/src/net/transport/turn-config.ts; scripts/ does not import from
 * apps/web, so this carries its own encoder.
 */
import { tls } from "./settings.mjs";

/** The game's latest main, where #972's link reading lands first. */
export const DEFAULT_BASE = "https://enteee.github.io/VibeWars/next/";

/**
 * The host the links name: `host` when set, else the external IPv4's public
 * part.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string}
 */
export function linkHost(s) {
  if (s.host !== null) return s.host;
  const pub = s.externalIp?.split("/")[0];
  if (pub === undefined || pub === "") {
    throw new Error(
      "set vibewars.turn.host (or externalIp) in devenv.local.nix: the links need a public name",
    );
  }
  return pub;
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string[]}
 */
export function turnUrls(s) {
  const host = linkHost(s);
  const h = host.includes(":") ? `[${host}]` : host;
  const port = String(s.listeningPort);
  return [
    `turn:${h}:${port}?transport=udp`,
    `turn:${h}:${port}?transport=tcp`,
    ...(tls(s) ? [`turns:${h}:${String(s.tlsPort)}?transport=tcp`] : []),
  ];
}

/**
 * @param {{ urls: readonly string[], secret: string }} config
 * @returns {string}  the fragment, starting `#turn=`
 */
export function encodeTurnFragment(config) {
  const json = JSON.stringify({ urls: config.urls, secret: config.secret });
  return `#turn=${Buffer.from(json, "utf8").toString("base64url")}`;
}

/**
 * @param {string} base  the page; any fragment it has is replaced
 * @param {{ urls: readonly string[], secret: string }} config
 * @returns {string}
 */
export function inviteLink(base, config) {
  const url = new URL(base);
  url.hash = "";
  return `${url.toString().replace(/#$/, "")}${encodeTurnFragment(config)}`;
}
