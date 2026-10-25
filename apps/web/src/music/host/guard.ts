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
