import { randomPlayerName } from "@vibewars/game-core";
import { packEmblem, unpackEmblem, type WireCape } from "@vibewars/game-protocol";
import {
  sanitizeGuild,
  sanitizeGuildCape,
  sanitizeGuildTag,
  type Guild,
} from "@vibewars/game-session";

import { t } from "../i18n/index.js";
import { GUILD_FRAGMENT_KEY } from "../net/fragment.js";
import { EMBLEM_PRESET_NAMES, capeLook, presetEmblem } from "../render/cape-shape.js";
import { heroRankOf, loadFame } from "../storage/fame.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { cssColour } from "./character-preview.js";
import {
  EMBLEM_NAMES,
  emblemEditor,
  emblemIcon,
  inputHex,
  type EmblemPick,
} from "./emblem-editor.js";
import { button, h, shareLine, toast, type ShareLine } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";
import { SIGNET_HEADING_PX, signetElement } from "./player-label.js";

/**
 * The Player section of Options (#1513): the name, the guild tag (#1406)
 * and the guild cape (#1422), which are the player's, not one screen's.
 * Each is saved on every keystroke and pick; the screen under Options
 * re-renders as it closes, so the roster wears the cape just picked.
 * `signet` is the player key's (#3235), left of the name.
 */
export function playerSection(signet: number): OptionsSection {
  return {
    id: "player",
    get title() {
      return t("options.player");
    },
    mount: (container) => mountPlayer(container, signet),
  };
}

const NAME_STORAGE_KEY = `${STORAGE_NAMESPACE}.playerName`;

/**
 * A name generated for a browser that cannot keep one, once a page load,
 * so that two loads in a row compare equal.
 */
let unsavedName: string | undefined;

/**
 * Remember the player's chosen name so they do not retype it every session.
 * A first visit, with no name stored at all, gets a generated one (#2653),
 * stored like a typed one; a name emptied on purpose stays empty.
 */
export function loadPlayerName(): string {
  try {
    const stored = localStorage.getItem(NAME_STORAGE_KEY);
    if (stored !== null) {
      return stored;
    }
    const name = randomPlayerName(Math.random);
    localStorage.setItem(NAME_STORAGE_KEY, name);
    return name;
  } catch {
    // Private browsing can throw on localStorage access; a remembered
    // name is not worth failing the whole menu over.
    unsavedName ??= randomPlayerName(Math.random);
    return unsavedName;
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Same reasoning as the load: this is a convenience, not a requirement.
  }
}

const GUILD_TAG_STORAGE_KEY = `${STORAGE_NAMESPACE}.guildTag`;

/** The guild tag as the player last typed it (#1406), valid or not; empty for none. */
export function loadGuildTag(): string {
  try {
    return localStorage.getItem(GUILD_TAG_STORAGE_KEY) ?? "";
  } catch {
    // Same reasoning as the name.
    return "";
  }
}

export function saveGuildTag(tag: string): void {
  try {
    localStorage.setItem(GUILD_TAG_STORAGE_KEY, tag);
  } catch {
    // Same reasoning as the name.
  }
}

/** The remembered guild tag if it is a valid one (#1406); `null` plays untagged. */
export function playerGuildTag(): string | null {
  return sanitizeGuildTag(loadGuildTag());
}

const GUILD_CAPE_STORAGE_KEY = `${STORAGE_NAMESPACE}.guildCape`;

/**
 * The cape last designed (#1422), kept even while there is no valid tag
 * to wear it with; `null` for none. One stored that is not a cape, such
 * as one from before the emblem was a grid (#3554), is replaced by
 * `FIRST_CAPE`: no migration (ADR-0016).
 */
export function loadGuildCape(): WireCape | null {
  try {
    const stored = localStorage.getItem(GUILD_CAPE_STORAGE_KEY);
    if (stored === null) {
      return null;
    }
    const cape = storedCape(stored);
    if (cape === null) {
      saveGuildCape(FIRST_CAPE);
      return FIRST_CAPE;
    }
    return cape;
  } catch {
    // The name's reasoning: no cape.
    return null;
  }
}

/** `stored` as a cape, or `null` if it is not JSON or not a cape. */
function storedCape(stored: string): WireCape | null {
  try {
    return sanitizeGuildCape(JSON.parse(stored));
  } catch {
    return null;
  }
}

export function saveGuildCape(cape: WireCape | null): void {
  try {
    if (cape === null) {
      localStorage.removeItem(GUILD_CAPE_STORAGE_KEY);
    } else {
      localStorage.setItem(GUILD_CAPE_STORAGE_KEY, JSON.stringify(cape));
    }
  } catch {
    // Same reasoning as the name.
  }
}

/** The remembered tag if it is a valid one, and the cape with it (#1406, #1422). */
export function playerGuild(): Guild {
  return sanitizeGuild({
    guildTag: loadGuildTag(),
    heroRank: heroRankOf(loadFame().total),
    guildCape: loadGuildCape(),
  });
}

/** Whether `a` is what the player typed in `b`: a rank is earned, so it is no rename (#2702). */
export function sameTypedGuild(a: Guild | undefined, b: Guild): boolean {
  return a?.guildTag === b.guildTag && JSON.stringify(a.guildCape) === JSON.stringify(b.guildCape);
}

/** Whether the cape designer shows for the tag `typed` (#1422): only a valid tag wears a cape. */
export function showsCapeDesigner(typed: string): boolean {
  return sanitizeGuildTag(typed) !== null;
}

/**
 * The guild link to `tag` and `cape` (#3167): this page's own origin and
 * path, with `#guild=<TAG>.<main>.<trim>.<emblem>.<colours>`, the emblem's
 * colours run together (#3628), or `#guild=<TAG>` with no cape.
 * `parseGuildFragment` reads it back.
 */
export function guildLink(
  tag: string,
  cape: WireCape | null,
  where: Pick<Location, "origin" | "pathname"> = location,
): string {
  const parts =
    cape === null ? [tag] : [tag, cape.main, cape.trim, cape.emblem, cape.emblemColours.join("")];
  return `${where.origin}${where.pathname}#${GUILD_FRAGMENT_KEY}=${parts.join(".")}`;
}

/**
 * Copy `url`, a guild link (#3167), and say so. A refused clipboard shows
 * it selected in `share` instead, to copy by hand, as an invite link does.
 */
async function copyGuildLink(url: string, share: ShareLine): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast(t("kit.copied"));
  } catch {
    share.show(url);
    toast(t("player.guildLinkByHand"));
  }
}

/** One press in the cape designer (#1422). */
export type CapePick =
  | { readonly part: "main" | "trim"; readonly colour: string }
  | ({ readonly part: "emblem" } & EmblemPick)
  | { readonly part: "none" };

/** What a first pick starts from: the study's sample of variant B (#1410), violet, white trim. */
export const FIRST_CAPE: WireCape = {
  main: "a078e0",
  trim: "f2f2f2",
  emblemColours: ["f2f2f2"],
  emblem: packEmblem(presetEmblem("diamond")),
};

/** The cape after `pick`; a pick on no cape starts from `FIRST_CAPE`. */
export function pickCape(cape: WireCape | null, pick: CapePick): WireCape | null {
  const from = cape ?? FIRST_CAPE;
  switch (pick.part) {
    case "none":
      return null;
    case "main":
      return { ...from, main: pick.colour };
    case "trim":
      return { ...from, trim: pick.colour };
    case "emblem":
      return { ...from, emblem: pick.emblem, emblemColours: pick.emblemColours };
  }
}

/** Whether `typed` should show as invalid: something, but not a tag. */
export function isInvalidGuildTag(typed: string): boolean {
  return typed.trim() !== "" && sanitizeGuildTag(typed) === null;
}

function mountPlayer(container: HTMLElement, signet: number): () => void {
  const panel = h("div", "player-section");
  container.appendChild(panel);

  const nameField = h("label", "field");
  nameField.appendChild(h("span", "field-label", t("player.name")));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.placeholder = t("player.namePlaceholder");
  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => {
    savePlayerName(nameInput.value);
  });
  // The key's signet left of it (#3235): the name can change, it cannot.
  const nameRow = h("span", "player-name-row");
  nameRow.append(signetElement(signet, SIGNET_HEADING_PX), nameInput);
  nameField.appendChild(nameRow);
  // The guild tag beside it (#1406): `Ente [VIBE]` to everyone else.
  const tagField = h("label", "field player-guild-tag");
  tagField.appendChild(h("span", "field-label", t("player.guildTag")));
  const tagInput = document.createElement("input");
  tagInput.className = "field-input";
  tagInput.placeholder = t("player.guildTagPlaceholder");
  tagInput.maxLength = 4;
  tagInput.value = loadGuildTag();
  const tagHint = h("span", "field-hint", t("player.guildTagHint"));
  const showTagValidity = (): void => {
    const invalid = isInvalidGuildTag(tagInput.value);
    tagInput.setAttribute("aria-invalid", String(invalid));
    tagHint.hidden = !invalid;
  };
  showTagValidity();
  tagInput.addEventListener("input", () => {
    saveGuildTag(tagInput.value);
    showTagValidity();
    showCape();
  });
  tagField.appendChild(tagInput);
  tagField.appendChild(tagHint);
  const identityRow = h("div", "player-identity");
  identityRow.appendChild(nameField);
  identityRow.appendChild(tagField);
  panel.appendChild(identityRow);
  const { total } = loadFame();
  panel.appendChild(
    h("p", "player-fame", t("player.fameAndRank", { fame: total, rank: heroRankOf(total) })),
  );

  // The cape designer under it (#1422), only while the tag is valid: the
  // cape is the guild's.
  let cape = loadGuildCape();
  const designer = capeDesigner((pick) => {
    cape = pickCape(cape, pick);
    saveGuildCape(cape);
    showCape();
  });
  // Its link beside it (#3167), while the tag is valid: one click copies
  // the tag and cape into another player's Options.
  const link = shareLine(t("player.guildLink"));
  const copy = button(t("player.copyGuildLink"), "player-guild-copy", () => {
    const tag = sanitizeGuildTag(tagInput.value);
    if (tag !== null) {
      void copyGuildLink(guildLink(tag, cape), link);
    }
  });
  const showCape = (): void => {
    const valid = showsCapeDesigner(tagInput.value);
    designer.root.hidden = !valid;
    copy.hidden = !valid;
    link.hide();
    designer.show(cape);
  };
  showCape();
  panel.appendChild(designer.root);
  panel.append(copy, link.element);
  return () => {
    panel.remove();
  };
}

/** The guild link banner's emblem size, CSS px. */
const BANNER_EMBLEM_PX = 20;

/**
 * The cape designer (#1422, #3628): a colour picker each for the cape's
 * cloth and its trim, any colour, the emblem editor always under them,
 * and *No cape*. Each pick, and each finished stroke or tool action in
 * the editor, is a pick. `show` puts `cape` in the pickers; with none,
 * only *No cape* is pressed.
 */
function capeDesigner(onPick: (pick: CapePick) => void): {
  readonly root: HTMLElement;
  readonly show: (cape: WireCape | null) => void;
} {
  const root = h("div", "player-cape");
  root.appendChild(h("span", "field-label", t("player.guildCape")));
  const picks = h("div", "player-cape-picks");
  root.appendChild(picks);
  const colourRow = (part: "main" | "trim", label: string, name: string): HTMLInputElement => {
    const row = h("label", "player-cape-row");
    row.appendChild(h("span", "player-cape-row-label", label));
    const input = document.createElement("input");
    input.type = "color";
    input.className = "player-cape-colour";
    input.dataset.part = part;
    input.setAttribute("aria-label", name);
    input.title = name;
    input.addEventListener("input", () => {
      onPick({ part, colour: inputHex(input.value) });
    });
    row.appendChild(input);
    picks.appendChild(row);
    return input;
  };
  const main = colourRow("main", t("player.cape"), t("player.capeColour"));
  const trim = colourRow("trim", t("player.trim"), t("player.trimColour"));
  const editor = emblemEditor(FIRST_CAPE, (emblem) => {
    onPick({ part: "emblem", ...emblem });
  });
  const none = button(t("player.noCape"), "player-cape-none", () => {
    onPick({ part: "none" });
  });
  picks.append(none);
  root.appendChild(editor.root);
  return {
    root,
    show: (cape) => {
      const worn = cape ?? FIRST_CAPE;
      main.value = `#${worn.main}`;
      trim.value = `#${worn.trim}`;
      editor.show(worn);
      none.setAttribute("aria-pressed", String(cape === null));
    },
  };
}

/**
 * `cape` as a small banner (#3167): its colour, its trim round it, and its
 * emblem, for a guild link's question, as a match draws them (#3628).
 */
export function capePreview(cape: WireCape): HTMLElement {
  const look = capeLook(cape);
  const banner = h("span", "guild-cape-preview");
  banner.style.setProperty("--cape-main", cssColour(look.main));
  banner.style.setProperty("--cape-trim", cssColour(look.trim));
  banner.setAttribute("role", "img");
  const pixels = unpackEmblem(cape.emblem, cape.emblemColours.length);
  const preset =
    cape.emblemColours.length === 1
      ? EMBLEM_PRESET_NAMES.find((name) => presetEmblem(name).join() === pixels?.join())
      : undefined;
  banner.setAttribute(
    "aria-label",
    preset === undefined
      ? t("player.guildCape")
      : `${t("player.guildCape")}, ${t(EMBLEM_NAMES[preset])}`,
  );
  banner.appendChild(emblemIcon(cape.emblem, look.palette, BANNER_EMBLEM_PX));
  return banner;
}
