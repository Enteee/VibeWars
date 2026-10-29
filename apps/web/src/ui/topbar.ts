import { isGloballyMuted, onGlobalMute, setGlobalMute } from "../audio/global-mute.js";
import { attachFullscreenButton, fullscreenTarget } from "./fullscreen.js";
import { paintMuteButton } from "./hud.js";
import { helpIcon, settingsIcon } from "./icons.js";
import { attachJukeboxPopover } from "./jukebox.js";
import { button, iconButton, setTopbarSlots } from "./kit.js";

/**
 * The top bar on the menu screens (#454, #1272): the shown screen's
 * breadcrumb, Back, status and own buttons (`screenBar`), the status when
 * it has something to say, and the buttons a player wants from anywhere:
 * Help, Options, music, mute and fullscreen. In a match it is hidden and the
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
  /** [?]: the player docs, Help, over whatever screen shows (#1257). */
  readonly onHelp: () => void;
  /** ⚙: Options, over whatever screen shows. */
  readonly onOptions: () => void;
}

/** What `mountTopbar` hands back: the bar's say in whether it shows. */
export interface Topbar {
  /**
   * In a match the bar is hidden and the HUD has its buttons (#454), but
   * an overlay opened from the HUD still shows its place and Close in it.
   */
  setInMatch(inMatch: boolean): void;
}

/** One of the bar's parts in index.html. */
function part(bar: HTMLElement, selector: string): HTMLElement {
  const node = bar.querySelector<HTMLElement>(selector);
  if (node === null) {
    throw new Error(`#topbar has no ${selector}`);
  }
  return node;
}

/**
 * Fill the bar's global icons and hand its slots to `screenBar` (#1272);
 * they live as long as the page.
 */
export function mountTopbar(bar: HTMLElement, callbacks: TopbarCallbacks): Topbar {
  const actions = part(bar, ".topbar-actions");
  const tools = part(bar, ".topbar-tools");
  const screenActions = part(bar, ".topbar-screen-actions");

  const help = iconButton("topbar-help", "Help", helpIcon());
  help.setAttribute("aria-haspopup", "dialog");
  help.addEventListener("click", callbacks.onHelp);

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

  actions.append(help, options, music, mute, fullscreen);
  attachJukeboxPopover(music, bar);

  // On a phone the screen's other buttons and the global icons fold into
  // ⋯ (styles.css), and only the screen's primary button stays out.
  const more = button("⋯", "topbar-more", () => {
    setMore(!bar.classList.contains("is-more-open"));
  });
  more.setAttribute("aria-label", "More");
  more.setAttribute("aria-haspopup", "true");
  bar.appendChild(more);
  const setMore = (open: boolean): void => {
    bar.classList.toggle("is-more-open", open);
    more.setAttribute("aria-expanded", String(open));
  };
  setMore(false);
  // A press anywhere but the ⋯ and its list puts it away; one on a button
  // in it does too, after the button has done its work.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target instanceof Node && !more.contains(target) && !tools.contains(target)) {
      setMore(false);
    }
  });
  tools.addEventListener("click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("button") !== null) {
      setMore(false);
    }
  });

  let shownPlace: string | undefined;
  let inMatch = false;
  let overlayShown = false;
  const paintHidden = (): void => {
    bar.hidden = inMatch && !overlayShown;
    bar.classList.toggle("is-over-match", inMatch && overlayShown);
  };

  setTopbarSlots({
    crumbs: part(bar, ".topbar-crumbs"),
    back: part(bar, ".topbar-back"),
    status: part(bar, ".topbar-status"),
    actions: screenActions,
    onShow: ({ place, own, overlay }) => {
      help.hidden = own === "help";
      options.hidden = own === "options";
      music.hidden = own === "music";
      // A screen that repaints in place, like a lobby on every join, keeps
      // the ⋯ open; going somewhere else puts it away.
      if (place !== shownPlace) {
        shownPlace = place;
        setMore(false);
      }
      // Only a screen with buttons beyond its primary one has a ⋯.
      bar.classList.toggle(
        "has-more",
        Array.from(screenActions.children).some((node) => !node.classList.contains("primary")),
      );
      overlayShown = overlay;
      paintHidden();
    },
    putAway: () => {
      if (!bar.classList.contains("is-more-open")) {
        return false;
      }
      setMore(false);
      more.focus();
      return true;
    },
  });

  return {
    setInMatch(next) {
      inMatch = next;
      paintHidden();
    },
  };
}
