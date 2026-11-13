import { isGloballyMuted, onGlobalMute, setGlobalMute } from "../audio/global-mute.js";
import { t } from "../i18n/index.js";
import { readPastedLobbyLink } from "../net/fragment.js";
import { attachFullscreenButton, fullscreenTarget } from "./fullscreen.js";
import { closeHelpOverlay, isHelpOverlayOpen } from "./help-screen.js";
import { paintMuteButton } from "./hud.js";
import { helpIcon, LOBBY_ICON, lobbyIcon, settingsIcon } from "./icons.js";
import { attachJukeboxPopover } from "./jukebox.js";
import { sharedTracks } from "../music/shared-tracks.js";
import {
  button,
  h,
  iconButton,
  setTopbarSlots,
  shareLine,
  type OwnIcon,
  type ShownBar,
} from "./kit.js";
import { copyInviteLink } from "./lobby-screen.js";
import { lobbyWindowBody, type RailParty } from "./lobby-window.js";
import { loadPlayerName } from "./player-section.js";
import { attachOptionsWindow } from "./options-screen.js";
import { queueButton, type QueueStatusInput } from "./queue-popover.js";
import { attachTopbarPopover, closeTopbarPopover } from "./topbar-popover.js";

/**
 * The top bar on the menu screens (#454, #1272): the shown screen's
 * breadcrumb, Back, status and own buttons (`screenBar`), the status when
 * it has something to say, and the buttons a player wants from anywhere:
 * Help, Options, Lobby, music, mute and fullscreen. In a match it is hidden and the
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
  /** ⚙'s Options window, over whatever screen shows, closed (#2386). */
  readonly onOptionsClosed: () => void;
  /**
   * Join the lobby `code` as `name` (#1525): an invite link opened (#2100).
   * Settles once the attempt has ended, whichever way (#3183).
   */
  readonly onJoin: (code: string, name: string) => Promise<void>;
  /** A guest's Leave (#1526): back to a fresh lobby of its own. */
  readonly onLeave: () => void;
  /** The host's Closed / Open toggle (#1682): let friends with the invite link join, or stop them. */
  readonly onSetOpen: (open: boolean) => void;
  /** The host's (x) by a member in the Lobby window (#2746): out, not to come back. */
  readonly onRemoveMember: (id: string) => void;
  /** The queue flyout's Leave Queue (#2743): out of whichever queue this tab is in. */
  readonly onLeaveQueue: () => void;
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

/** A host's invite link (#1553, #2100): its guests come too; Join goes, Esc does not. */
export function partyJoinsNotice(party: number): string {
  return t("topbar.partyJoins", { count: party });
}

/**
 * How long a join runs before the bar says it is still connecting
 * (#707): a join may take up to 20 s, which should not look like a hang.
 */
export const CONNECTING_NOTICE_MS = 3000;

/**
 * The lobby's controls, which the Lobby window mounts (#2385), and the
 * bar's word on the joins invite links ask for.
 */
export interface JoinControls {
  /** The bar's: "Connecting…" and a host's "your party joins too" (#1553). */
  readonly element: HTMLElement;
  /** The Lobby window's, on top: the lobby's label, Copy invite link, Join lobby, Closed / Open and Leave. */
  readonly controls: HTMLElement;
  /** The Lobby window shut: Join lobby's field goes with it, emptied (#2882). */
  readonly closeJoinField: () => void;
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
 * Closed / Open (#1682) and a guest's Leave (#1526), in the Lobby window
 * (#2385); in the bar, "Connecting…" once a join has run a while (#707),
 * until it ends (#3183).
 * The page has one. The key itself is never shown. `name` is read at the join.
 */
export function joinControls(
  name: () => string,
  onJoin: (code: string, name: string) => Promise<void>,
  onLeave: () => void,
  onSetOpen: (open: boolean) => void,
): JoinControls {
  const group = h("div", "topbar-join");
  const lobby = h("div", "topbar-lobby");
  lobby.hidden = true;
  // Whose lobby it is.
  const lobbyLabel = h("span", "lobby-code-label", t("topbar.ownLobby"));
  /** The lobby the bar names, whose invite link Copy copies. */
  let code = "";
  const share = shareLine(t("topbar.inviteLinkLabel"));
  const copy = button(t("topbar.copyInviteLink"), "lobby-copy", () => {
    void copyInviteLink(code, share);
  });
  const toggle = button("", "topbar-lobby-open", () => {
    onSetOpen(toggle.getAttribute("aria-pressed") !== "true");
  });
  // Decorative: the toggle's name says the state (#2382).
  const toggleGlyph = document.createElement("img");
  toggleGlyph.className = "topbar-lobby-open-glyph";
  toggleGlyph.alt = "";
  toggleGlyph.src = LOBBY_ICON.closed;
  const toggleLabel = h("span", "topbar-lobby-open-label", t("topbar.closed"));
  toggle.append(toggleGlyph, toggleLabel);
  const leave = button(t("topbar.leave"), "topbar-leave", onLeave);
  // Join lobby (#2882): a pasted link goes in through the page's own
  // `hashchange`, exactly as one pasted into the address bar does.
  const joinField = h("div", "lobby-join-field");
  const joinInput = document.createElement("input");
  joinInput.type = "text";
  joinInput.className = "field-input lobby-join-input";
  joinInput.placeholder = t("topbar.joinLobbyField");
  joinInput.setAttribute("aria-label", t("topbar.joinLobbyField"));
  joinInput.autocomplete = "off";
  joinInput.spellcheck = false;
  const joinMessage = h("p", "lobby-join-message");
  joinMessage.setAttribute("role", "alert");
  const sayJoinError = (message: string): void => {
    joinMessage.textContent = message;
    joinMessage.hidden = message === "";
    joinInput.setAttribute("aria-invalid", String(message !== ""));
  };
  const closeJoinField = (): void => {
    joinField.hidden = true;
    joinInput.value = "";
    sayJoinError("");
  };
  closeJoinField();
  const joinLobby = button(t("topbar.joinLobby"), "lobby-join-open", () => {
    joinField.hidden = false;
    joinInput.focus();
  });
  const putJoinFieldAway = (): void => {
    closeJoinField();
    joinLobby.focus();
  };
  const submitJoinField = (): void => {
    const pasted = readPastedLobbyLink(joinInput.value, location);
    if (pasted.kind === "link") {
      putJoinFieldAway();
      location.hash = pasted.fragment;
    } else {
      sayJoinError(
        t(pasted.kind === "other-build" ? "topbar.joinOtherBuild" : "topbar.joinNotALink"),
      );
    }
  };
  joinInput.addEventListener("keydown", (event: KeyboardEvent) => {
    // Typed here, so never a shortcut's; Esc takes the field, not the window.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      submitJoinField();
    } else if (event.key === "Escape") {
      event.preventDefault();
      putJoinFieldAway();
    }
  });
  const joinActions = h("div", "lobby-join-actions");
  joinActions.append(
    button(t("topbar.joinConfirm"), "lobby-join-confirm", submitJoinField),
    button(t("topbar.joinCancel"), "lobby-join-cancel", putJoinFieldAway),
  );
  joinField.append(joinInput, joinActions, joinMessage);
  lobby.append(lobbyLabel, copy, joinLobby, toggle, leave);
  const controls = h("div", "lobby-window-controls");
  controls.append(lobby, share.element, joinField);
  // Shown once a join has run a while; the lobby, or the menu again with
  // why it failed, puts it away when it ends.
  const connecting = h("span", "topbar-connecting", t("topbar.connecting"));
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
  /**
   * Bumped by every new bar and every join, so a join's timer knows it
   * has ended or been followed by another.
   */
  let shown = 0;
  const settle = (): void => {
    shown += 1;
    connecting.hidden = true;
  };
  const join = (invited: string): void => {
    dismiss();
    shown += 1;
    const pressed = shown;
    // An attempt that ends without a new bar (own lobby, a failure)
    // still ends its notice; a newer join's stays (#3183).
    void onJoin(invited, name()).finally(() => {
      if (pressed === shown) {
        settle();
      }
    });
    setTimeout(() => {
      if (pressed === shown) {
        connecting.hidden = false;
      }
    }, CONNECTING_NOTICE_MS);
  };
  confirm.append(
    confirmText,
    button(t("topbar.join"), "topbar-join-button", () => {
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
  group.append(connecting, confirm);
  return {
    element: group,
    controls,
    closeJoinField,
    settle,
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
      lobbyLabel.textContent = t(
        joining
          ? "topbar.joiningLobby"
          : shown?.isHost === false
            ? "topbar.joinedLobby"
            : "topbar.ownLobby",
      );
      lobby.classList.toggle("is-joining", joining);
      copy.hidden = joining;
      joinLobby.hidden = joining;
      if (joining) {
        closeJoinField();
      }
      share.hide();
      party = shown?.isHost === true ? shown.party : 0;
      if (party <= 1) {
        dismiss();
      }
      leave.hidden = shown?.isHost !== false || joining;
      toggle.hidden = shown?.isHost !== true;
      const open = shown?.open === true;
      toggleGlyph.src = open ? LOBBY_ICON.open : LOBBY_ICON.closed;
      // What the toggle says beside its glyph (#2382), its name, and its tooltip.
      toggleLabel.textContent = t(open ? "topbar.open" : "topbar.closed");
      // Its name says the state for a reader, whatever the word beside it (#1682).
      toggle.setAttribute("aria-label", t(open ? "topbar.openName" : "topbar.closedName"));
      toggle.title = t(open ? "topbar.openTooltip" : "topbar.closedTooltip");
      toggle.setAttribute("aria-pressed", String(open));
    },
  };
}

/**
 * The global icons for the bar's own screen (#1272): Help keeps its [?],
 * shown open, so a second press closes it (#2724); the beat editor hides
 * its ♪.
 */
export function paintOwnIcons(
  help: Pick<HTMLElement, "setAttribute">,
  music: Pick<HTMLElement, "hidden">,
  own: OwnIcon | undefined,
): void {
  help.setAttribute("aria-expanded", String(own === "help"));
  music.hidden = own === "music";
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

/** The Lobby button's name (#2385): with the head count once someone else is in. */
export function lobbyButtonName(members: number): string {
  return members > 1 ? t("topbar.lobbyPlayers", { count: members }) : t("topbar.lobby");
}

/**
 * Whether going from `last` to `next` is a join or a leave (#2385): the
 * badge pulses for one while the window is shut. A queue's tick is neither.
 */
export function partyChanged(last: RailParty | undefined, next: RailParty | undefined): boolean {
  const names = (party: RailParty | undefined): string =>
    (party?.members ?? []).map((member) => member.name).join("\n");
  return names(last) !== names(next);
}

/** The bar's Lobby (#2385): its button, and who it says is in the lobby. */
export interface LobbyButton {
  readonly element: HTMLButtonElement;
  readonly setParty: (party: RailParty | undefined) => void;
}

/**
 * The Lobby button, its window dropping into `parent` (#2385): a count on
 * the button once someone else is in, pulsing on a join or a leave while
 * the window is shut, and in the window the lobby's `controls` over the
 * people in it, repainted while open.
 */
export function lobbyButton(
  parent: HTMLElement,
  controls: HTMLElement,
  onRemoveMember: (id: string) => void,
  onClosed: () => void,
): LobbyButton {
  const element = iconButton("topbar-lobby-button", lobbyButtonName(1), lobbyIcon());
  element.title = t("topbar.lobby");
  const badge = h("span", "topbar-badge");
  badge.hidden = true;
  element.appendChild(badge);
  badge.addEventListener("animationend", () => {
    badge.classList.remove("is-pulsing");
  });
  let party: RailParty | undefined;
  /** The open window's repaint; none while it is shut. */
  let paintWindow: (() => void) | undefined;
  attachTopbarPopover(element, parent, () => {
    const panel = h("div", "screen lobby-window");
    panel.setAttribute("aria-label", t("topbar.lobby"));
    panel.tabIndex = -1;
    // Only the people repaint: a control keeps its focus through a join.
    const body = (): HTMLElement =>
      lobbyWindowBody(party, (member) => {
        onRemoveMember(member.id);
      });
    let people = body();
    panel.append(h("h3", "lobby-window-title", t("topbar.lobby")), controls, people);
    paintWindow = () => {
      const next = body();
      people.replaceWith(next);
      people = next;
    };
    return {
      element: panel,
      focus: panel,
      dispose() {
        paintWindow = undefined;
        onClosed();
      },
    };
  });
  return {
    element,
    setParty: (next) => {
      const changed = partyChanged(party, next);
      party = next;
      const members = next?.members.length ?? 0;
      badge.textContent = String(members);
      badge.hidden = members <= 1;
      element.setAttribute("aria-label", lobbyButtonName(members));
      if (paintWindow !== undefined) {
        paintWindow();
      } else if (changed && !badge.hidden) {
        badge.classList.add("is-pulsing");
      }
    },
  };
}

/**
 * A new bar shows: the bar's join status only where it asks for it, the
 * lobby's controls in the Lobby window on every screen (#2566).
 */
export function showJoin(join: JoinControls, shown: boolean): void {
  join.element.hidden = !shown;
  join.settle();
}

/** What `mountTopbar` hands back: the bar's say in whether it shows. */
export interface Topbar {
  /** The lobby the bar names (#1526); none while this tab is in none. */
  setLobby(lobby: BarLobby | undefined): void;
  /** Who is in that lobby (#2385): the Lobby button's badge and its window. */
  setParty(party: RailParty | undefined): void;
  /** The queue this tab is in (#2743): its icon and flyout; none hides them. */
  setQueue(queue: QueueStatusInput | undefined): void;
  /**
   * Join the lobby an invite link names (#2100): `false` on a bar that
   * cannot. Before the first menu, it waits for it.
   */
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
 * they live as long as the page. `signet` is the player key's, for Options (#3235).
 */
export function mountTopbar(bar: HTMLElement, callbacks: TopbarCallbacks, signet: number): Topbar {
  const actions = part(bar, ".topbar-actions");
  const tools = part(bar, ".topbar-tools");
  const screenActions = part(bar, ".topbar-screen-actions");
  const queueAction = part(bar, ".topbar-queue-action");

  const help = iconButton("topbar-help", t("topbar.help"), helpIcon());
  help.setAttribute("aria-haspopup", "dialog");
  help.setAttribute("aria-expanded", "false");
  // A second press closes Help, as one on ⚙ closes Options (#2724).
  help.addEventListener("click", () => {
    if (isHelpOverlayOpen()) {
      closeHelpOverlay();
      return;
    }
    closeTopbarPopover();
    callbacks.onHelp();
  });

  // Left of Help while in any queue (#2743).
  const queue = queueButton(bar, callbacks.onLeaveQueue);

  const options = iconButton("topbar-options", t("topbar.options"), settingsIcon());
  attachOptionsWindow(options, bar, signet, callbacks.onOptionsClosed);

  // The bar's join status, right before the global icons, on every menu
  // screen that asks for it; the lobby's own controls are the Lobby
  // window's, on every screen (#2566).
  const join = joinControls(
    loadPlayerName,
    callbacks.onJoin,
    callbacks.onLeave,
    callbacks.onSetOpen,
  );
  join.element.hidden = true;
  const lobby = lobbyButton(bar, join.controls, callbacks.onRemoveMember, join.closeJoinField);

  const music = iconButton("topbar-music", t("topbar.music"));
  // Tracks lobby members shared and this player has not seen (#2745).
  const musicBadge = h("span", "topbar-badge");
  musicBadge.hidden = true;
  music.appendChild(musicBadge);
  musicBadge.addEventListener("animationend", () => {
    musicBadge.classList.remove("is-pulsing");
  });
  let unheard = 0;
  sharedTracks.onChange(() => {
    const next = sharedTracks.unheard();
    musicBadge.textContent = String(next);
    musicBadge.hidden = next === 0;
    if (next > unheard) {
      musicBadge.classList.add("is-pulsing");
    }
    unheard = next;
  });

  // The same mute all as the HUD's and the ♪ popovers' (#424).
  const mute = iconButton("topbar-mute", t("topbar.muteSounds"));
  paintMuteButton(mute, isGloballyMuted());
  onGlobalMute((muted) => {
    paintMuteButton(mute, muted);
  });
  mute.addEventListener("click", () => {
    setGlobalMute(!isGloballyMuted());
  });

  const fullscreen = iconButton("topbar-fullscreen", t("fullscreen.enter"));
  attachFullscreenButton(fullscreen, fullscreenTarget());

  actions.append(queue.element, help, options, lobby.element, music, mute, fullscreen);
  queueAction.before(join.element);
  // An invite link the page opened with (#2100) waits for the first
  // screen with the bar's lobby on it: until then nothing could join.
  let joinShown = false;
  let early: string | undefined;
  attachJukeboxPopover(music, bar, false);

  // On a phone the screen's other buttons and the global icons fold into
  // ⋯ (styles.css); the screen's primary button and an editor's own ⋯ stay out.
  const more = button("⋯", "topbar-more", () => {
    setMore(!bar.classList.contains("is-more-open"));
  });
  more.setAttribute("aria-label", t("topbar.more"));
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
    queueAction,
    onShow: (shown) => {
      paintOwnIcons(help, music, shown.own);
      if (shown.own === "help") {
        closeTopbarPopover();
      }
      showJoin(join, shown.join);
      if (shown.join && !joinShown) {
        joinShown = true;
        if (early !== undefined) {
          join.invite(early);
          early = undefined;
        }
      }
      const hasMore = barHasMore(
        Array.from([...screenActions.children, ...queueAction.children], (node) =>
          node.classList.contains("primary"),
        ),
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
    setParty: lobby.setParty,
    setQueue: queue.setQueue,
    invite(code) {
      if (!joinShown) {
        early = code;
        return true;
      }
      return join.invite(code);
    },
    setInMatch(next) {
      inMatch = next;
      paintHidden();
    },
  };
}
