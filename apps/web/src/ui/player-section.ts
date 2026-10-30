import { CAPE_COLOURS, CAPE_EMBLEMS, type WireCape } from "@vibewars/game-protocol";
import {
  sanitizeGuild,
  sanitizeGuildCape,
  sanitizeGuildTag,
  type Guild,
} from "@vibewars/game-session";

import { SELF_RIM, paintEmblem } from "../render/body-painter.js";
import {
  CAPE_PALETTE,
  emblemShape,
  type CapeColour,
  type CapeEmblem,
} from "../render/cape-shape.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { canvasPainter } from "./character-figure.js";
import { cssColour } from "./character-preview.js";
import { button, h } from "./kit.js";
import type { OptionsSection } from "./options-sections.js";

/**
 * The Player section of Options (#1513): the name, the guild tag (#1406)
 * and the guild cape (#1422), which are the player's, not one screen's.
 * Each is saved on every keystroke and pick; the screen under Options
 * re-renders as it closes, so the roster wears the cape just picked.
 */
export const playerSection: OptionsSection = {
  id: "player",
  title: "player",
  mount: mountPlayer,
};

/** Under the fields: a lobby or match already joined keeps what it joined with. */
export const PLAYER_APPLIES = "Applies from your next lobby.";

const NAME_STORAGE_KEY = `${STORAGE_NAMESPACE}.playerName`;

/** Remember the player's chosen name so they do not retype it every session. */
export function loadPlayerName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? "";
  } catch {
    // Private browsing can throw on localStorage access; a missing
    // remembered name is not worth failing the whole menu over.
    return "";
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
 * to wear it with; `null` for none, and for anything stored that is not
 * a cape.
 */
export function loadGuildCape(): WireCape | null {
  try {
    const stored = localStorage.getItem(GUILD_CAPE_STORAGE_KEY);
    return stored === null ? null : sanitizeGuildCape(JSON.parse(stored));
  } catch {
    // Unparseable, or the name's reasoning: no cape.
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
  return sanitizeGuild({ guildTag: loadGuildTag(), guildCape: loadGuildCape() });
}

/** Whether the cape designer shows for the tag `typed` (#1422): only a valid tag wears a cape. */
export function showsCapeDesigner(typed: string): boolean {
  return sanitizeGuildTag(typed) !== null;
}

/** One press in the cape designer (#1422). */
export type CapePick =
  | { readonly part: "main" | "trim"; readonly colour: CapeColour }
  | { readonly part: "emblem"; readonly emblem: CapeEmblem }
  | { readonly part: "none" };

/** What a first pick starts from: the study's sample of variant B (#1410). */
export const FIRST_CAPE: WireCape = { main: "violet", trim: "white", emblem: "diamond" };

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
      return { ...from, emblem: pick.emblem };
  }
}

/** Shown under the guild tag field while what is typed is no tag (#1406). */
export const GUILD_TAG_HINT = "2–4 letters or digits";

/** Whether `typed` should show as invalid: something, but not a tag. */
export function isInvalidGuildTag(typed: string): boolean {
  return typed.trim() !== "" && sanitizeGuildTag(typed) === null;
}

function mountPlayer(container: HTMLElement): () => void {
  const panel = h("div", "player-section");
  container.appendChild(panel);

  const nameField = h("label", "field");
  nameField.appendChild(h("span", "field-label", "Name"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.placeholder = "Player";
  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => {
    savePlayerName(nameInput.value);
  });
  nameField.appendChild(nameInput);
  // The guild tag beside it (#1406): `Ente [VIBE]` to everyone else.
  const tagField = h("label", "field player-guild-tag");
  tagField.appendChild(h("span", "field-label", "Guild tag"));
  const tagInput = document.createElement("input");
  tagInput.className = "field-input";
  tagInput.placeholder = "TAG";
  tagInput.maxLength = 4;
  tagInput.value = loadGuildTag();
  const tagHint = h("span", "field-hint", GUILD_TAG_HINT);
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

  // The cape designer under it (#1422), only while the tag is valid: the
  // cape is the guild's.
  let cape = loadGuildCape();
  const designer = capeDesigner((pick) => {
    cape = pickCape(cape, pick);
    saveGuildCape(cape);
    showCape();
  });
  const showCape = (): void => {
    designer.root.hidden = !showsCapeDesigner(tagInput.value);
    designer.show(cape);
  };
  showCape();
  panel.appendChild(designer.root);
  panel.appendChild(h("p", "player-applies", PLAYER_APPLIES));
  return () => {
    panel.remove();
  };
}

/** The emblem buttons' size, CSS px. */
const EMBLEM_BUTTON_PX = 20;

/**
 * The cape designer (#1422): a row of eight swatches each for the cape's
 * colour and its trim's, eight emblems, and *No cape*. `show` marks what
 * `cape` has picked; with none, only *No cape* is pressed.
 */
function capeDesigner(onPick: (pick: CapePick) => void): {
  readonly root: HTMLElement;
  readonly show: (cape: WireCape | null) => void;
} {
  const root = h("div", "player-cape");
  root.appendChild(h("span", "field-label", "Guild cape"));
  const pressed: {
    readonly button: HTMLButtonElement;
    readonly on: (cape: WireCape) => boolean;
  }[] = [];
  const swatchRow = (part: "main" | "trim", label: string): void => {
    const row = h("div", "player-cape-row");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    row.appendChild(h("span", "player-cape-row-label", label));
    for (const colour of CAPE_COLOURS) {
      const swatch = button("", "player-cape-swatch", () => {
        onPick({ part, colour });
      });
      swatch.style.setProperty("--swatch", cssColour(CAPE_PALETTE[colour]));
      swatch.setAttribute("aria-label", colour);
      swatch.title = colour;
      swatch.dataset.colour = colour;
      row.appendChild(swatch);
      pressed.push({ button: swatch, on: (cape) => cape[part] === colour });
    }
    root.appendChild(row);
  };
  swatchRow("main", "Cape");
  swatchRow("trim", "Trim");
  const emblems = h("div", "player-cape-row");
  emblems.setAttribute("role", "group");
  emblems.setAttribute("aria-label", "Emblem");
  emblems.appendChild(h("span", "player-cape-row-label", "Emblem"));
  for (const emblem of CAPE_EMBLEMS) {
    const choice = button("", "player-cape-emblem", () => {
      onPick({ part: "emblem", emblem });
    });
    choice.setAttribute("aria-label", emblem);
    choice.title = emblem;
    choice.dataset.emblem = emblem;
    choice.appendChild(emblemIcon(emblem));
    emblems.appendChild(choice);
    pressed.push({ button: choice, on: (cape) => cape.emblem === emblem });
  }
  root.appendChild(emblems);
  const none = button("No cape", "player-cape-none", () => {
    onPick({ part: "none" });
  });
  root.appendChild(none);
  return {
    root,
    show: (cape) => {
      for (const { button: each, on } of pressed) {
        each.setAttribute("aria-pressed", String(cape !== null && on(cape)));
      }
      none.setAttribute("aria-pressed", String(cape === null));
    },
  };
}

/**
 * `emblem` in `ink`, upright, sharp at the device's pixel ratio. An image of a
 * canvas, not the canvas: Options keeps no canvases of its own (#1422).
 */
function emblemIcon(emblem: CapeEmblem): HTMLImageElement {
  const ratio = window.devicePixelRatio;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(EMBLEM_BUTTON_PX * ratio);
  canvas.height = Math.round(EMBLEM_BUTTON_PX * ratio);
  const context = canvas.getContext("2d");
  if (context !== null) {
    context.scale(ratio, ratio);
    const half = EMBLEM_BUTTON_PX / 2;
    paintEmblem(
      canvasPainter(context),
      emblemShape(emblem, { x: half, y: half }, 0, EMBLEM_BUTTON_PX - 4),
      SELF_RIM,
    );
  }
  const image = document.createElement("img");
  image.src = canvas.toDataURL();
  image.alt = "";
  image.width = EMBLEM_BUTTON_PX;
  image.height = EMBLEM_BUTTON_PX;
  return image;
}
