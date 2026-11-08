/**
 * Whether the music host may run here (ADR-0028, decision 1).
 *
 * The host runs player-written Strudel, which is arbitrary JavaScript.
 * That is safe only inside the game's `<iframe sandbox="allow-scripts">`,
 * where the host's origin is opaque (`"null"`). `music-host.html` is also
 * an ordinary page on the game's origin: opened top-level with
 * `window.open`, or framed without a sandbox, it would run a posted
 * pattern with the game's storage. So the host runs only when it is both
 * sandboxed and framed.
 *
 * This reads nothing the opener controls: never `document.referrer`, the
 * URL or a query parameter.
 */
export function mayRun(origin: string, self: object, parent: object): boolean {
  return origin === "null" && parent !== self;
}

/**
 * The WebRTC constructors (#2745): a pattern could open a peer connection
 * and send what it likes past `connect-src`, which WebRTC ignores. Music
 * never needs them.
 */
export const WEBRTC_GLOBALS = [
  "RTCPeerConnection",
  "webkitRTCPeerConnection",
  "RTCDataChannel",
  "RTCSessionDescription",
] as const;

/**
 * Delete `WEBRTC_GLOBALS` from `global`: whether none is reachable after.
 * The host runs only if so, a shared track being someone else's code.
 */
export function withoutWebRtc(global: object): boolean {
  for (const name of WEBRTC_GLOBALS) {
    Reflect.deleteProperty(global, name);
  }
  return WEBRTC_GLOBALS.every((name) => !(name in global));
}
