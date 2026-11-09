import { t, type MessageKey } from "../i18n/index.js";
import { keySignet } from "../identity/key-signet.js";
import { signetParams, signetSvg } from "../identity/signet.js";
import { setHidden } from "./dom-write.js";
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
export function playerLabelText(
  name: string,
  guildTag: string | null | undefined,
  heroRank: number,
): string {
  const { tag } = playerLabel(name, guildTag);
  const rank = heroRankText(heroRank);
  return [name, tag, rank].filter((part) => part !== undefined).join(" ");
}

/**
 * Graphemes of a name the name plate draws (#2636): a bot carries its PvX
 * build's name, up to 40, which in the plate's monospace would span half
 * the screen. 24 holds "Wastrel's Collapse (A/E)".
 */
const NAMEPLATE_NAME_GRAPHEMES = 24;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Long names already cut: the plate asks again every frame for every actor. */
const cutNames = new Map<string, string>();

/** `name` cut to fit the name plate, ending in "…" when it was. */
export function nameplateName(name: string): string {
  // Never fewer code units than graphemes: a short name fits as it is.
  if (name.length <= NAMEPLATE_NAME_GRAPHEMES) {
    return name;
  }
  const known = cutNames.get(name);
  if (known !== undefined) {
    return known;
  }
  const graphemes = Array.from(graphemeSegmenter.segment(name), ({ segment }) => segment);
  const cut =
    graphemes.length <= NAMEPLATE_NAME_GRAPHEMES
      ? name
      : `${graphemes
          .slice(0, NAMEPLATE_NAME_GRAPHEMES - 1)
          .join("")
          .trimEnd()}…`;
  cutNames.set(name, cut);
  return cut;
}

/** A signet's size in the party window and the lobby roster (#2805), px. */
export const SIGNET_ROW_PX = 11;

const signetUrls = new Map<string, string>();

/**
 * `bits`' signet (#2805) as a `size` px SVG data URL, built once per
 * pair. An image of its own, so two copies never share a clip path id.
 */
export function signetUrl(bits: number, size: number): string {
  const key = `${String(bits)}/${String(size)}`;
  let url = signetUrls.get(key);
  if (url === undefined) {
    url = `data:image/svg+xml,${encodeURIComponent(signetSvg(signetParams(bits), size))}`;
    signetUrls.set(key, url);
  }
  return url;
}

/**
 * A player's signet (#2805), `size` px, just before their name: a
 * recognition aid, never a proof. Hidden, taking no room, for none.
 */
export function signetElement(bits: number | undefined, size: number): HTMLImageElement {
  const element = document.createElement("img");
  element.className = "signet";
  element.alt = "";
  element.width = size;
  element.height = size;
  setSignet(element, bits, size);
  return element;
}

/**
 * Show `bits` in an element `signetElement` made at `size`, passed in
 * because reading a rendered image's width forces a layout per row.
 */
export function setSignet(element: HTMLImageElement, bits: number | undefined, size: number): void {
  setHidden(element, bits === undefined);
  if (bits !== undefined) {
    const url = signetUrl(bits, size);
    if (element.src !== url) {
      element.src = url;
    }
  }
}

/** What it takes to sign a name: a bot's key is `null`. */
export interface KeyedPlayer {
  readonly name: string;
  readonly playerPubkey: string | null;
}

/** `player`'s signet (#2805); none for a bot, or someone no longer there. */
export function signetOf(player: KeyedPlayer | undefined): number | undefined {
  return player === undefined || player.playerPubkey === null
    ? undefined
    : keySignet(player.playerPubkey);
}

/** Stands in for the names while a sentence is translated: no name or message holds it. */
const NAMES_MARK = "\u0000";

/**
 * Sentence `key` as a `className` div, its `param` being `players`, each
 * name an element with its signet (#2820), comma separated.
 */
export function signedNamesLine(
  className: string,
  key: MessageKey,
  param: string,
  players: readonly KeyedPlayer[],
): HTMLElement {
  const [before = "", after = ""] = t(key, { [param]: NAMES_MARK }).split(NAMES_MARK);
  const line = h("div", className, before);
  players.forEach((player, index) => {
    if (index > 0) {
      line.append(", ");
    }
    const name = line.appendChild(playerLabelElement("signed-name", player.name, null, 0));
    const signet = signetOf(player);
    if (signet !== undefined) {
      name.prepend(signetElement(signet, SIGNET_ROW_PX));
    }
  });
  line.append(after);
  return line;
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

/** A hero rank as it is drawn (#2702), `★3`; `undefined` for none. */
export function heroRankText(heroRank: number): string | undefined {
  return heroRank > 0 ? `★${String(heroRank)}` : undefined;
}

/** The rank alone, for a row redrawn in place; empty and hidden for none. */
export function heroRankElement(): HTMLElement {
  const element = h("span", "hero-rank");
  element.hidden = true;
  return element;
}

/** Show `heroRank` in an element `heroRankElement` made. */
export function setHeroRank(element: HTMLElement, heroRank: number): void {
  const text = heroRankText(heroRank);
  element.textContent = text ?? "";
  element.title = text === undefined ? "" : t("player.heroRankBadge", { rank: heroRank });
  element.hidden = text === undefined;
}

/** The name, then its tag and rank, each in its own span, inside one of `className`. */
export function playerLabelElement(
  className: string,
  name: string,
  guildTag: string | null | undefined,
  heroRank: number,
): HTMLElement {
  const label = h("span", className);
  const nameElement = h("span", "player-label-name", name);
  // A name in another script reads in its own direction, whatever the page's (#2655).
  nameElement.dir = "auto";
  label.appendChild(nameElement);
  const { tag } = playerLabel(name, guildTag);
  if (tag !== undefined) {
    // A space between, so the label reads, and copies, as `Ente [VIBE]`.
    label.append(" ", h("span", "guild-tag", tag));
  }
  if (heroRank > 0) {
    const rank = heroRankElement();
    setHeroRank(rank, heroRank);
    label.append(" ", rank);
  }
  return label;
}
