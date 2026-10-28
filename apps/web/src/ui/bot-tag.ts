import { h } from "./kit.js";

/**
 * The tag a lobby's bot wears wherever its name shows (#1194): its lobby
 * row, its name plate, its party-window row and the target frame, so
 * nobody takes it for a player.
 */
export const BOT_TAG = "BOT";

/** `BOT` for a bot, `undefined` for a player. */
export function botTag(player: { readonly bot: boolean }): string | undefined {
  return player.bot ? BOT_TAG : undefined;
}

/** A name with its bot's tag after it, for text that cannot hold an element: the name plate. */
export function taggedName(player: { readonly name: string; readonly bot: boolean }): string {
  const tag = botTag(player);
  return tag === undefined ? player.name : `${player.name} · ${tag}`;
}

/** The tag as a small pill; a frame that shows players too hides it for them. */
export function botTagElement(className: string): HTMLElement {
  return h("span", `bot-tag ${className}`, BOT_TAG);
}
