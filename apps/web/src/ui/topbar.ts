import { isGloballyMuted, onGlobalMute, setGlobalMute } from "../audio/global-mute.js";
import { attachFullscreenButton, fullscreenTarget } from "./fullscreen.js";
import { paintMuteButton } from "./hud.js";
import { settingsIcon } from "./icons.js";
import { attachJukeboxPopover } from "./jukebox.js";
import { iconButton } from "./kit.js";

/**
 * The top bar on the menu screens (#454): the brand, the status when it
 * has something to say, and the buttons a player wants from anywhere:
 * Options, music, mute and fullscreen. In a match it is hidden and the
 * HUD carries the same buttons.
 */

export type StatusState = "offline" | "online" | "error";

/** The part of an element the status needs. */
export interface StatusElement {
  textContent: string | null;
  hidden: HTMLElement["hidden"];
  readonly dataset: DOMStringMap;
}

/**
 * Say `text` in the bar. Idle is the empty string, which takes no space:
 * only connecting, a lobby's code and what went wrong are worth a word.
 */
export function paintStatus(status: StatusElement, text: string, state: StatusState): void {
  status.textContent = text;
  status.dataset.state = state;
  status.hidden = text === "";
}

export interface TopbarCallbacks {
  /** ⚙: Options, over whatever screen shows. */
  readonly onOptions: () => void;
}

/** Fill `actions` with the bar's buttons; they live as long as the page. */
export function mountTopbar(
  bar: HTMLElement,
  actions: HTMLElement,
  callbacks: TopbarCallbacks,
): void {
  const options = iconButton("topbar-options", "Options", settingsIcon());
  options.setAttribute("aria-haspopup", "dialog");
  options.addEventListener("click", callbacks.onOptions);

  const music = iconButton("topbar-music", "Music");
  music.setAttribute("aria-haspopup", "dialog");

  // The same mute all as the HUD's and Options → Sound (#424).
  const mute = iconButton("topbar-mute", "Mute sounds");
  paintMuteButton(mute, isGloballyMuted());
  onGlobalMute((muted) => {
    paintMuteButton(mute, muted);
  });
  mute.addEventListener("click", () => {
    setGlobalMute(!isGloballyMuted());
  });

  const fullscreen = iconButton("topbar-fullscreen", "Fullscreen");
  attachFullscreenButton(fullscreen, fullscreenTarget());

  actions.append(options, music, mute, fullscreen);
  attachJukeboxPopover(music, bar);
}
