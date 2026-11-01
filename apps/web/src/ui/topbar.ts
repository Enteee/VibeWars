import { isGloballyMuted, onGlobalMute, setGlobalMute } from "../audio/global-mute.js";
import { attachFullscreenButton, fullscreenTarget } from "./fullscreen.js";
import { paintMuteButton } from "./hud.js";
import { helpIcon, settingsIcon } from "./icons.js";
import { attachJukeboxPopover } from "./jukebox.js";
import { button, h, iconButton, setTopbarSlots, shareLine, type ShownBar } from "./kit.js";
import { copyInviteLink } from "./lobby-screen.js";
import { loadPlayerName } from "./player-section.js";

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
  /** Join the lobby `code` as `name` (#1525): an invite link opened (#2100). */
  readonly onJoin: (code: string, name: string) => void;
  /** A guest's Leave (#1526): back to a fresh lobby of its own. */
  readonly onLeave: () => void;
  /** The host's Closed / Open toggle (#1682): let friends with the invite link join, or stop them. */
  readonly onSetOpen: (open: boolean) => void;
}

/** The lobby the bar names (#1526): this tab's own, or the one it joined. */
export interface BarLobby {
  readonly code: string;
  readonly isHost: boolean;
  /** Whether friends with the invite link may join (#1682). */
  readonly open: boolean;
  /** The players in it, this one too; never bots. A host's guests follow it (#1553). */
  readonly party: number;
  /** On the way there behind its host (#1553): greyed, and "Joining…". */
  readonly joining: boolean;
}

/** Whose lobby it is. */
export const OWN_LOBBY_LABEL = "Your lobby";
export const JOINED_LOBBY_LABEL = "Lobby";
export const JOINING_LOBBY_LABEL = "Joining…";

/** A host's invite link (#1553, #2100): its guests come too; Join goes, Esc does not. */
export function partyJoinsNotice(party: number): string {
  return `Your party of ${String(party)} joins with you.`;
}

/**
 * The host's toggle (#1682): its lock, what it says beside it while the
 * bar has the room, its name, and its tooltip, each way.
 */
export const CLOSED_GLYPH = "🔒";
export const OPEN_GLYPH = "🔓";
export const CLOSED_LABEL = "Closed";
export const OPEN_LABEL = "Open";
export const CLOSED_NAME = "Lobby closed";
export const OPEN_NAME = "Lobby open";
export const CLOSED_TOOLTIP = "Friends with your invite link can't join until you open the lobby.";
export const OPEN_TOOLTIP = "Anyone with your invite link can join.";

/**
 * How long a join runs before the bar says it is still connecting
 * (#707): a join may take up to 20 s, which should not look like a hang.
 */
export const CONNECTING_NOTICE_MS = 3000;

/** The bar's lobby, its Copy invite link, and the joins invite links ask for. */
export interface JoinControls {
  readonly element: HTMLElement;
  /** A new bar shows: a join it was waiting on has ended, either way. */
  readonly settle: () => void;
  /**
   * Join the lobby an invite link names (#2100), as `onJoin`; a host
   * with guests is asked first (#1553). Nothing on a bar without these
   * controls, a lobby's or a match's: `false` then.
   */
  readonly invite: (code: string) => boolean;
  /**
   * Name the lobby this tab is in, with Copy invite link, the Closed /
   * Open toggle for its host and Leave for a guest; none while there is none.
   */
  readonly setLobby: (lobby: BarLobby | undefined) => void;
}

/**
 * The lobby this tab is in, its Copy invite link (#2100), its host's
 * Closed / Open (#1682) and a guest's Leave (#1526), then "Connecting…"
 * once a join has run a while (#707). The page has one, in the title bar.
 * The key itself is never shown. `name` is read at the join.
 */
export function joinControls(
  name: () => string,
  onJoin: (code: string, name: string) => void,
  onLeave: () => void,
  onSetOpen: (open: boolean) => void,
): JoinControls {
  const group = h("div", "topbar-join");
  const lobby = h("div", "topbar-lobby");
  lobby.hidden = true;
  const lobbyLabel = h("span", "lobby-code-label", OWN_LOBBY_LABEL);
  /** The lobby the bar names, whose invite link Copy copies. */
  let code = "";
  const share = shareLine("lobby invite link");
  const copy = button("Copy invite link", "lobby-copy", () => {
    void copyInviteLink(code, share);
  });
  const toggle = button("", "topbar-lobby-open", () => {
    onSetOpen(toggle.getAttribute("aria-pressed") !== "true");
  });
  const toggleGlyph = h("span", "topbar-lobby-open-glyph", CLOSED_GLYPH);
  const toggleLabel = h("span", "topbar-lobby-open-label", CLOSED_LABEL);
  toggle.append(toggleGlyph, toggleLabel);
  const leave = button("Leave", "topbar-leave", onLeave);
  lobby.append(lobbyLabel, copy, toggle, leave);
  // Shown once a join has run a while; the lobby, or the menu again with
  // why it failed, puts it away when it ends.
  const connecting = h("span", "topbar-connecting", "Connecting…");
  connecting.setAttribute("role", "status");
  connecting.hidden = true;
  // A host with guests is asked once (#1553): they follow it.
  const confirm = h("span", "topbar-join-confirm");
  confirm.setAttribute("role", "status");
  const confirmText = h("span", "topbar-join-confirm-text");
  /** The invite a host with guests was asked about. */
  let pending: string | undefined;
  const dismiss = (): void => {
    pending = undefined;
    confirm.hidden = true;
  };
  dismiss();
  /** The host's party, when this tab hosts one; 0 for a guest. */
  let party = 0;
  /** Bumped by every new bar, so a join's timer knows it has ended. */
  let shown = 0;
  const join = (invited: string): void => {
    dismiss();
    onJoin(invited, name());
    const pressed = shown;
    setTimeout(() => {
      if (pressed === shown) {
        connecting.hidden = false;
      }
    }, CONNECTING_NOTICE_MS);
  };
  confirm.append(
    confirmText,
    button("Join", "topbar-join-button", () => {
      if (pending !== undefined) {
        join(pending);
      }
    }),
  );
  group.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      dismiss();
    }
  });
  group.append(lobby, share.element, connecting, confirm);
  return {
    element: group,
    settle: () => {
      shown += 1;
      connecting.hidden = true;
    },
    invite: (invited) => {
      if (group.hidden) {
        return false;
      }
      if (party > 1) {
        pending = invited;
        confirmText.textContent = partyJoinsNotice(party);
        confirm.hidden = false;
      } else {
        join(invited);
      }
      return true;
    },
    setLobby: (shown) => {
      lobby.hidden = shown === undefined;
      code = shown?.code ?? "";
      const joining = shown?.joining === true;
      lobbyLabel.textContent = joining
        ? JOINING_LOBBY_LABEL
        : shown?.isHost === false
          ? JOINED_LOBBY_LABEL
          : OWN_LOBBY_LABEL;
      lobby.classList.toggle("is-joining", joining);
      copy.hidden = joining;
      share.hide();
      party = shown?.isHost === true ? shown.party : 0;
      if (party <= 1) {
        dismiss();
      }
      leave.hidden = shown?.isHost !== false || joining;
      toggle.hidden = shown?.isHost !== true;
      const open = shown?.open === true;
      toggleGlyph.textContent = open ? OPEN_GLYPH : CLOSED_GLYPH;
      toggleLabel.textContent = open ? OPEN_LABEL : CLOSED_LABEL;
      // Its name whether or not the bar has room for the word (#1682).
      toggle.setAttribute("aria-label", open ? OPEN_NAME : CLOSED_NAME);
      toggle.title = open ? OPEN_TOOLTIP : CLOSED_TOOLTIP;
      toggle.setAttribute("aria-pressed", String(open));
    },
  };
}

/**
 * Whether the bar has a ⋯: a screen with buttons beyond its primary one, or
 * one showing the join controls, which fold into it on a phone (#2053).
 * `primaries` holds, per screen button, whether it is the primary one.
 */
export function barHasMore(primaries: readonly boolean[], join: boolean): boolean {
  return join || primaries.some((primary) => !primary);
}

/**
 * Whether showing `next` puts the ⋯ away (#1305): going to another place,
 * or an overlay opening or closing over it, does, and so does a bar with
 * nothing left in it. A screen that repaints in place, like a lobby on every
 * join, keeps it open.
 */
export function putsMoreAway(
  last: ShownBar | undefined,
  next: ShownBar,
  hasMore: boolean,
): boolean {
  return (
    !hasMore || last?.place !== next.place || last.own !== next.own || last.overlay !== next.overlay
  );
}

/** What `mountTopbar` hands back: the bar's say in whether it shows. */
export interface Topbar {
  /** The lobby the bar names (#1526); none while this tab is in none. */
  setLobby(lobby: BarLobby | undefined): void;
  /** Join the lobby an invite link names (#2100): `false` on a bar that cannot. */
  invite(code: string): boolean;
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
  // Right before the global icons, on every menu screen that asks for it.
  const join = joinControls(
    loadPlayerName,
    callbacks.onJoin,
    callbacks.onLeave,
    callbacks.onSetOpen,
  );
  join.element.hidden = true;
  actions.before(join.element);
  attachJukeboxPopover(music, bar);

  // On a phone the screen's other buttons and the global icons fold into
  // ⋯ (styles.css); the screen's primary button and an editor's own ⋯ stay out.
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

  let lastShown: ShownBar | undefined;
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
    onShow: (shown) => {
      help.hidden = shown.own === "help";
      options.hidden = shown.own === "options";
      music.hidden = shown.own === "music";
      join.element.hidden = !shown.join;
      join.settle();
      const hasMore = barHasMore(
        Array.from(screenActions.children, (node) => node.classList.contains("primary")),
        shown.join,
      );
      bar.classList.toggle("has-more", hasMore);
      if (putsMoreAway(lastShown, shown, hasMore)) {
        setMore(false);
      }
      lastShown = shown;
      overlayShown = shown.overlay;
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
    setLobby: join.setLobby,
    invite: join.invite,
    setInMatch(next) {
      inMatch = next;
      paintHidden();
    },
  };
}
