import { MAX_CHAT_GRAPHEMES, type ChatChannel } from "@vibewars/game-protocol";
import type { ChatLine } from "@vibewars/game-session";

import { button, h } from "./kit.js";

/**
 * Chat (#479): the panel at the lower left, in the lobby and through its
 * match. Enter opens the box, Enter sends, Esc cancels; while the box has
 * focus no key reaches the game. The host routes every line; this only
 * shows what arrives, as text, never as HTML.
 */

/** How many lines the panel keeps. */
export const CHAT_LINES_KEPT = 50;

/** Seconds without a line before the panel fades in a match. */
export const CHAT_IDLE_SECONDS = 10;

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

/** The lines kept, newest last, and who this player muted for the session. */
export class ChatLog {
  readonly #lines: ChatLine[] = [];
  readonly #muted = new Set<string>();

  /** Keep `line`; whether it shows, which a muted sender's does not. */
  public add(line: ChatLine): boolean {
    this.#lines.push(line);
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
  public visible(): readonly ChatLine[] {
    return this.#lines.filter((line) => !this.#muted.has(line.fromId));
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
  /** In a match: team chat by default, and the panel fades when idle. */
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
  input.placeholder = "Enter to chat · ! all · # team";
  input.setAttribute("aria-label", "chat message");
  form.append(channelButton, input);
  root.append(lines, form);

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

  let inMatch = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  /** Lit while something is new or the box is open; in a match it fades after a while. */
  const wake = (): void => {
    root.classList.remove("is-idle");
    clearTimeout(idleTimer);
    if (inMatch && document.activeElement !== input) {
      idleTimer = setTimeout(() => {
        root.classList.add("is-idle");
      }, CHAT_IDLE_SECONDS * 1000);
    }
  };

  const follow = (): void => {
    lines.scrollTop = lines.scrollHeight;
  };

  const lineElement = (line: ChatLine): HTMLElement => {
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
    return row;
  };

  /** Every kept line again, as after a mute: notices are this client's and go. */
  const repaint = (): void => {
    lines.replaceChildren(...log.visible().map(lineElement));
    follow();
  };

  const notice = (text: string, undo?: () => void): void => {
    const row = h("div", "chat-line chat-notice", text);
    if (undo !== undefined) {
      row.append(" ", button("Unmute", "chat-unmute", undo));
    }
    lines.append(row);
    follow();
    wake();
  };

  const close = (): void => {
    input.value = "";
    input.blur();
  };

  input.addEventListener("keydown", (event: KeyboardEvent) => {
    // Typing is not playing: no key in the box moves, casts or targets.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      const said = chatToSend(input.value, channel, deps.selfTeam() !== null);
      if (said !== undefined) {
        deps.send(said.channel, said.text);
      }
      close();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  input.addEventListener("focus", wake);
  input.addEventListener("blur", wake);

  // Enter opens the box from anywhere that has no use for Enter itself.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== "Enter" ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isControl(event.target) ||
      !root.isConnected
    ) {
      return;
    }
    event.preventDefault();
    paintChannel();
    input.focus();
  };
  window.addEventListener("keydown", onKeyDown);

  return {
    root,
    add(line) {
      if (log.add(line)) {
        lines.append(lineElement(line));
        while (lines.childElementCount > CHAT_LINES_KEPT) {
          lines.firstElementChild?.remove();
        }
        follow();
        wake();
      }
    },
    notice(text) {
      notice(text);
    },
    setInMatch(value) {
      inMatch = value;
      channel = value ? "team" : "all";
      paintChannel();
      wake();
    },
    dispose() {
      clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}
