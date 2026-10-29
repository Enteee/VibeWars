import { h } from "./kit.js";

/**
 * A player's name with their guild tag after it (#1406), `Ente [VIBE]`,
 * as the lobby, the name plate, the party window, the summary and the
 * versus splash draw it. Bots, creatures and dummies have no tag; chat,
 * toasts and the combat log keep the bare name.
 */
export interface PlayerLabel {
  readonly name: string;
  /** `[VIBE]`; `undefined` for none. */
  readonly tag: string | undefined;
}

/** `guildTag` is the snapshot's (`undefined` for none) or the wire's (`null`). */
export function playerLabel(name: string, guildTag: string | null | undefined): PlayerLabel {
  return { name, tag: guildTag === null || guildTag === undefined ? undefined : `[${guildTag}]` };
}

/** The label as one string, for text that cannot hold an element: the name plate. */
export function playerLabelText(name: string, guildTag: string | null | undefined): string {
  const { tag } = playerLabel(name, guildTag);
  return tag === undefined ? name : `${name} ${tag}`;
}

/**
 * The tag alone, for a row redrawn in place (the party window), muted
 * and never cut short with its name; empty and hidden for none.
 */
export function guildTagElement(): HTMLElement {
  const element = h("span", "guild-tag");
  element.hidden = true;
  return element;
}

/** Show `guildTag` in an element `guildTagElement` made. */
export function setGuildTag(element: HTMLElement, guildTag: string | null | undefined): void {
  const { tag } = playerLabel("", guildTag);
  element.textContent = tag ?? "";
  element.hidden = tag === undefined;
}

/** The name, then its tag, each in its own span, inside one of `className`. */
export function playerLabelElement(
  className: string,
  name: string,
  guildTag: string | null | undefined,
): HTMLElement {
  const label = h("span", className);
  label.appendChild(h("span", "player-label-name", name));
  const { tag } = playerLabel(name, guildTag);
  if (tag !== undefined) {
    // A space between, so the label reads, and copies, as `Ente [VIBE]`.
    label.append(" ", h("span", "guild-tag", tag));
  }
  return label;
}
