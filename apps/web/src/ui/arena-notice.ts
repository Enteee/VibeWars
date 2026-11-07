import { t } from "../i18n/index.js";

/**
 * What the player reads where the arena would be, in the Training Ground
 * and in a match alike, when the browser has no WebGL (#655). Without it
 * the arena just isn't there, which reads as a broken game.
 */
export function noWebGlNotice(): HTMLElement {
  const notice = document.createElement("p");
  notice.className = "arena-notice";
  notice.setAttribute("role", "status");
  notice.textContent = t("arenaNotice.noWebGl");
  return notice;
}

/** Where the arena will be while a watcher's delay fills (#480). */
export function watchingNotice(delaySeconds: number): HTMLElement {
  const notice = document.createElement("p");
  notice.className = "arena-notice";
  notice.setAttribute("role", "status");
  notice.textContent = t("arenaNotice.watching", { seconds: delaySeconds });
  return notice;
}
