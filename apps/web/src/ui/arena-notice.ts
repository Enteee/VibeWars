/**
 * What the player reads where the arena would be, in the Training Ground
 * and in a match alike, when the browser has no WebGL (#655). Without it
 * the arena just isn't there, which reads as a broken game.
 */
export const NO_WEBGL_NOTICE =
  "The arena needs WebGL, and this browser has it turned off. Turn on hardware acceleration, or try another browser.";

export function noWebGlNotice(): HTMLElement {
  const notice = document.createElement("p");
  notice.className = "arena-notice";
  notice.setAttribute("role", "status");
  notice.textContent = NO_WEBGL_NOTICE;
  return notice;
}
