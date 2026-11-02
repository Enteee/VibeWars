import { MAX_CHAT_GRAPHEMES, type ChatChannel } from "@vibewars/game-protocol";
import type { ChatLine } from "@vibewars/game-session";

import { isHelpOverlayOpen } from "./help-screen.js";
import { chatIcon } from "./icons.js";
import { button, h, iconButton } from "./kit.js";
import { isOptionsOverlayOpen } from "./options-screen.js";

/**
 * Chat (#479): the panel at the lower left, in the lobby, on the menu's
 * screens and through a match. It starts closed (#2018): only its lines,
 * which every click goes through, and a chat icon that opens it. Enter or
 * the icon opens the box, Enter sends and closes, Esc or the icon closes;
 * while the box has focus no key reaches the game. The host routes every
 * line; this only shows what arrives, as text, never as HTML.
 */

/** How many lines the panel keeps. */
export const CHAT_LINES_KEPT = 50;

/** Seconds a line shows while the chat is closed, before it fades out (#2018). */
export const CHAT_LINE_SHOWN_SECONDS = 8;

/** The prefixes that pick a channel, GW1's: `!` all, `#` team. */
const PREFIXES: Readonly<Record<string, ChatChannel>> = { "!": "all", "#": "team" };

/**
 * What typing `typed` sends: a prefix picks the channel, else `channel`.
 * `undefined` when there is nothing to say, or team chat for a spectator.
 */
export function chatToSend(
  typed: string,
  channel: ChatChannel,
  hasTeam: boolean,
): { readonly channel: ChatChannel; readonly text: string } | undefined {
  const prefixed = PREFIXES[typed.charAt(0)];
  const chosen = prefixed ?? channel;
  const text = (prefixed === undefined ? typed : typed.slice(1)).trim();
  if (text === "" || (chosen === "team" && !hasTeam)) {
    return undefined;
  }
  return { channel: chosen, text };
}

/** Whose a line is, for its colour: GW1's blue for your side, red for theirs. */
export type ChatSide = "self" | "ally" | "enemy" | "spectator";

export function chatSide(line: ChatLine, selfId: string, selfTeam: 0 | 1 | null): ChatSide {
  if (line.fromId === selfId) {
    return "self";
  }
  if (line.team === null) {
    return "spectator";
  }
  return selfTeam === null || line.team === selfTeam ? "ally" : "enemy";
}

/** A kept line, and when it arrived on `Date.now()`'s clock (#2018). */
export interface KeptLine {
  readonly line: ChatLine;
  readonly at: number;
}

/** The lines kept, newest last, and who this player muted for the session. */
export class ChatLog {
  readonly #lines: KeptLine[] = [];
  readonly #muted = new Set<string>();

  /** Keep `line`, arrived `at`; whether it shows, which a muted sender's does not. */
  public add(line: ChatLine, at: number): boolean {
    this.#lines.push({ line, at });
    this.#lines.splice(0, Math.max(0, this.#lines.length - CHAT_LINES_KEPT));
    return !this.#muted.has(line.fromId);
  }

  public mute(id: string, muted: boolean): void {
    if (muted) {
      this.#muted.add(id);
    } else {
      this.#muted.delete(id);
    }
  }

  public isMuted(id: string): boolean {
    return this.#muted.has(id);
  }

  /** The kept lines that show, oldest first. */
  public visible(): readonly KeptLine[] {
    return this.#lines.filter(({ line }) => !this.#muted.has(line.fromId));
  }
}

/** Whether a key press belongs to a control that has a use for Enter itself. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLAnchorElement ||
      target.isContentEditable)
  );
}

export interface ChatDeps {
  readonly selfId: string;
  /** This player's team now; `null` spectates, and has no team chat. */
  readonly selfTeam: () => 0 | 1 | null;
  readonly send: (channel: ChatChannel, text: string) => void;
}

export interface ChatPanel {
  readonly root: HTMLElement;
  add(line: ChatLine): void;
  /** A line of this client's own, such as being told to slow down. */
  notice(text: string): void;
  /** In a match, team chat is the default; elsewhere all. */
  setInMatch(inMatch: boolean): void;
  dispose(): void;
}

export function mountChat(deps: ChatDeps): ChatPanel {
  const log = new ChatLog();
  const root = h("section", "chat");
  root.setAttribute("aria-label", "chat");
  const lines = h("div", "chat-lines");
  lines.setAttribute("role", "log");
  lines.setAttribute("aria-live", "polite");
  const toggle = iconButton("chat-toggle", "Chat (Enter)", chatIcon());
  const form = h("div", "chat-form");
  let channel: ChatChannel = "all";
  const channelButton = button("", "chat-channel", () => {
    channel = channel === "all" ? "team" : "all";
    paintChannel();
    input.focus();
  });
  const input = document.createElement("input");
  input.className = "chat-input";
  input.type = "text";
  // One more for a channel prefix. maxLength counts UTF-16 units, not
  // graphemes, so a line of emoji stops near half that: a bound on size,
  // and the host cuts to whole graphemes itself.
  input.maxLength = MAX_CHAT_GRAPHEMES + 1;
  input.placeholder = "! all · # team";
  input.setAttribute("aria-label", "chat message");
  form.append(channelButton, input);
  const bar = h("div", "chat-bar");
  bar.append(toggle, form);
  root.append(lines, bar);

  const paintChannel = (): void => {
    if (deps.selfTeam() === null) {
      channel = "all";
    }
    channelButton.textContent = channel === "all" ? "All" : "Team";
    channelButton.dataset.channel = channel;
    channelButton.disabled = deps.selfTeam() === null;
    channelButton.setAttribute("aria-label", `channel: ${channel}, click to switch`);
  };
  paintChannel();

  const follow = (): void => {
    lines.scrollTop = lines.scrollHeight;
  };

  /**
   * Each shown line not yet faded, and when it arrived. One timer, for the
   * next line due, fades each once it has shown CHAT_LINE_SHOWN_SECONDS;
   * the panel hides faded lines only while it is closed.
   */
  const fresh = new Map<HTMLElement, number>();
  let fadeTimer: ReturnType<typeof setTimeout> | undefined;
  const fade = (): void => {
    clearTimeout(fadeTimer);
    const now = Date.now();
    let next: number | undefined;
    for (const [row, at] of fresh) {
      const left = at + CHAT_LINE_SHOWN_SECONDS * 1000 - now;
      if (left <= 0) {
        row.classList.add("is-faded");
        fresh.delete(row);
      } else {
        next = Math.min(next ?? left, left);
      }
    }
    if (next !== undefined) {
      fadeTimer = setTimeout(fade, next);
    }
  };

  /** `row`, arrived `at`, to fade in its turn. */
  const fading = (row: HTMLElement, at: number): HTMLElement => {
    fresh.set(row, at);
    return row;
  };

  const lineElement = ({ line, at }: KeptLine): HTMLElement => {
    const row = h("div", "chat-line");
    row.dataset.channel = line.channel;
    row.dataset.from = line.fromId;
    const tag = h("span", "chat-line-channel", line.channel === "team" ? "[Team]" : "[All]");
    const name = button(line.name, "chat-line-name", () => {
      if (line.fromId === deps.selfId) {
        return;
      }
      log.mute(line.fromId, true);
      repaint();
      notice(`You muted ${line.name} for this session.`, () => {
        log.mute(line.fromId, false);
        repaint();
      });
    });
    name.dataset.side = chatSide(line, deps.selfId, deps.selfTeam());
    name.title = line.fromId === deps.selfId ? "" : `Mute ${line.name}`;
    row.append(tag, " ", name, ": ", h("span", "chat-line-text", line.text));
    return fading(row, at);
  };

  /** Every kept line again, as after a mute: notices are this client's and go. */
  const repaint = (): void => {
    fresh.clear();
    lines.replaceChildren(...log.visible().map(lineElement));
    follow();
    fade();
  };

  const notice = (text: string, undo?: () => void): void => {
    const row = h("div", "chat-line chat-notice", text);
    if (undo !== undefined) {
      row.append(" ", button("Unmute", "chat-unmute", undo));
    }
    lines.append(fading(row, Date.now()));
    follow();
    fade();
  };

  // Closed, the panel is its lines and the icon, and every click but the
  // icon's goes through (#2018). Open, it has its box, and a name mutes.
  let open = false;
  const setOpen = (value: boolean): void => {
    open = value;
    root.classList.toggle("is-open", value);
    toggle.setAttribute("aria-expanded", String(value));
    if (value) {
      paintChannel();
      // Shown first: a box that is not displayed takes no focus.
      input.focus();
      follow();
    } else {
      input.value = "";
      input.blur();
    }
  };
  setOpen(false);
  toggle.addEventListener("click", () => {
    setOpen(!open);
  });

  input.addEventListener("keydown", (event: KeyboardEvent) => {
    // Typing is not playing: no key in the box moves, casts or targets.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      const said = chatToSend(input.value, channel, deps.selfTeam() !== null);
      if (said !== undefined) {
        deps.send(said.channel, said.text);
      }
      setOpen(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  });
  // A click on the open panel (the channel, a name, Unmute) keeps the box
  // focused, so the next key still types.
  root.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.target !== input) {
      event.preventDefault();
    }
  });

  // Enter opens the box from anywhere that has no use for Enter itself,
  // such as a bar slot that took it (#1526: chat is on every menu screen);
  // under the Options overlay, keys are its alone (#454).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      event.defaultPrevented ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isControl(event.target) ||
      isOptionsOverlayOpen() ||
      isHelpOverlayOpen() ||
      !root.isConnected
    ) {
      return;
    }
    event.preventDefault();
    setOpen(true);
  };
  window.addEventListener("keydown", onKeyDown);

  return {
    root,
    add(line) {
      const at = Date.now();
      if (log.add(line, at)) {
        lines.append(lineElement({ line, at }));
        while (lines.childElementCount > CHAT_LINES_KEPT) {
          lines.firstElementChild?.remove();
        }
        follow();
        fade();
      }
    },
    notice(text) {
      notice(text);
    },
    setInMatch(value) {
      channel = value ? "team" : "all";
      paintChannel();
    },
    dispose() {
      clearTimeout(fadeTimer);
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
