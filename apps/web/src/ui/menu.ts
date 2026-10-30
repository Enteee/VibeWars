import { CAPE_COLOURS, CAPE_EMBLEMS, type QueueMode, type WireCape } from "@vibewars/game-protocol";
import {
  sanitizeGuild,
  sanitizeGuildCape,
  sanitizeGuildTag,
  type Guild,
} from "@vibewars/game-session";

import { SELF_RIM, paintEmblem } from "../render/body-painter.js";
import {
  CAPE_PALETTE,
  capeLook,
  emblemShape,
  type CapeColour,
  type CapeEmblem,
} from "../render/cape-shape.js";
import type { Tally } from "../storage/match-record.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { validateBuild } from "../storage/build-validation.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { canvasPainter, createCharacterFigure } from "./character-figure.js";
import { cssColour, equippedCount, miniSkillBar, professionLabel } from "./character-preview.js";
import { button, emptyState, h, listenForPaste, screenBar, selectableRow } from "./kit.js";

/**
 * The main menu and lobby screens (brief §21).
 *
 * Screens are plain DOM rendered into one container; `showScreen` swaps
 * which one is visible. There is no router and no framework — four
 * screens with no deep linking do not need one.
 */

export interface MenuCallbacks {
  /** Queue for a Random Arena of `mode` as `name` (#880), with the active character. */
  readonly onRandomArena: (mode: QueueMode, name: string) => void;
  readonly onCreateLobby: (name: string) => void;
  readonly onJoinLobby: (code: string, name: string) => void;
  readonly onManageTeams: () => void;
  /** Open the Record screen (#1404). */
  readonly onShowRecord: () => void;
  /** Open the jukebox (#372). */
  readonly onMusic: () => void;
  /** Open the build editor on a new character. */
  readonly onNewCharacter: () => void;
  readonly onEditCharacter: (id: string) => void;
  /** Save a fresh roll beside the rolled starter character `id` and edit that (#1147, #1457). */
  readonly onCloneStarter: (id: string) => void;
  /** Replace the rolled starter character `id` with another starter build (#853). */
  readonly onRerollCharacter: (id: string) => void;
  /** Called when the player picks who to play; re-renders the list. */
  readonly onSelectCharacter: (id: string) => void;
}

/**
 * How long a join runs before the menu says it is still connecting
 * (#707): a join may take up to 20 s, which should not look like a hang.
 */
export const CONNECTING_NOTICE_MS = 3000;

/** The Random Arena modes the menu offers (Q97), as their buttons read. */
export const RANDOM_ARENA_MODES: readonly { readonly mode: QueueMode; readonly label: string }[] = [
  { mode: "random-arena-4v4", label: "4v4" },
  { mode: "random-arena-2v2", label: "2v2" },
  { mode: "random-arena-1v1", label: "1v1" },
];

/** Why *Random Arena* is greyed out: a queue needs a character to show strangers. */
export const NO_CHARACTER_FOR_QUEUE = "Make a character first.";

/** The Random Arena mode picked this visit (#880): kept in memory, never stored. */
let randomArenaMode: QueueMode = "random-arena-4v4";

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

const CHARACTER_STORAGE_KEY = `${STORAGE_NAMESPACE}.activeCharacterId`;

/**
 * The character the player takes into their next match.
 *
 * Stored as an id rather than a copy of the build: the build has to be
 * read fresh at join time, or editing a character would leave matches
 * using whatever version happened to be cached when it was picked.
 */
export function loadActiveCharacterId(): string | undefined {
  try {
    return localStorage.getItem(CHARACTER_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveActiveCharacterId(id: string): void {
  try {
    localStorage.setItem(CHARACTER_STORAGE_KEY, id);
  } catch {
    // A convenience, not a requirement — same reasoning as the name.
  }
}

const STARTER_STORAGE_KEY = `${STORAGE_NAMESPACE}.starterCharacterId`;

/**
 * The character this browser's first start rolled (#853), set once it is
 * saved: set means "rolled already", and its row alone has Reroll.
 */
export function loadStarterCharacterId(): string | undefined {
  try {
    return localStorage.getItem(STARTER_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveStarterCharacterId(id: string): void {
  try {
    localStorage.setItem(STARTER_STORAGE_KEY, id);
  } catch {
    // Unset, the next start rolls again: a second character, not a failure.
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Same reasoning as above: this is a convenience, not a requirement.
  }
}

/**
 * "Elementalist / Monk · 5/8 skills", then its record (#1404) once it has
 * played: "· 12W 7L", with "1D" only when it has drawn.
 */
export function rosterSubtitle(character: StoredCharacter, tally?: Tally): string {
  const professions = professionLabel(character.primaryProfession, character.secondaryProfession);
  const skills = `${String(equippedCount(character))}/${String(character.skillBar.length)} skills`;
  if (tally === undefined) {
    return `${professions} · ${skills}`;
  }
  const draws = tally.draws > 0 ? ` ${String(tally.draws)}D` : "";
  return `${professions} · ${skills} · ${String(tally.wins)}W ${String(tally.losses)}L${draws}`;
}

/**
 * The roster's rows (#1425): `characters` in the repository's order,
 * newest saved first, with the random starter, `starterId`, after them
 * all, so a Reroll never moves it to the top. No starter, or one deleted,
 * leaves the order as it is.
 */
export function rosterOrder(
  characters: readonly StoredCharacter[],
  starterId: string | undefined,
): StoredCharacter[] {
  return [
    ...characters.filter((c) => c.id !== starterId),
    ...characters.filter((c) => c.id === starterId),
  ];
}

/**
 * Whether `character` can be chosen to play (#1290): an empty bar can, an
 * invalid build cannot. The editor saves nothing invalid, so only a rule
 * changed since the save makes one; it stays, to be edited.
 */
export function isPlayable(character: StoredCharacter): boolean {
  return validateBuild(character).length === 0;
}

/**
 * The tags after a roster row's name (#1426): "Random" on the rolled
 * starter character, so it reads as not yours at a glance, then "Invalid"
 * on a build the rules no longer allow (#1290).
 */
export function rosterTags(
  character: StoredCharacter,
  starter: string | undefined,
): ("Random" | "Invalid")[] {
  const tags: ("Random" | "Invalid")[] = [];
  if (character.id === starter) {
    tags.push("Random");
  }
  if (!isPlayable(character)) {
    tags.push("Invalid");
  }
  return tags;
}

/**
 * Render the main menu (#579): your characters on the left, Play on the
 * right, and Team Builds, Record, Options and Music in the screen bar. Each
 * character's record (#1404) follows its subtitle.
 */
export function renderMenu(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
  tallies: ReadonlyMap<string, Tally> = new Map(),
): void {
  // A Reroll redraws the menu under its own button (#1425): the new
  // row's Reroll takes the focus back.
  const rerolled = document.activeElement?.classList.contains("roster-reroll") === true;
  root.replaceChildren();
  const panel = h("div", "screen screen-menu");

  // No way back from here, so Esc has nothing to do but cancel (#578).
  // Options is the top bar's ⚙ (#1272).
  screenBar({
    crumbs: ["VibeWars"],
    actions: [
      button("Team Builds", "", callbacks.onManageTeams),
      button("Record", "", callbacks.onShowRecord),
      button("Music", "", callbacks.onMusic),
    ],
  });
  const columns = h("div", "menu-columns");
  panel.appendChild(columns);

  // --- your characters --------------------------------------------------
  // The roster lives here rather than behind a "characters" button: it is
  // the thing you pick before every match, so hiding it one click away
  // made the build editor feel optional when it is not.
  const roster = h("section", "roster");
  roster.appendChild(h("h2", "menu-column-title", "Play as"));

  for (const problem of characterProblems) {
    roster.appendChild(h("div", "screen-problem", problem));
  }

  const active = loadActiveCharacterId();
  // An invalid active character is no choice at all (#1290).
  const activeExists = characters.some((c) => c.id === active && isPlayable(c));
  const starter = loadStarterCharacterId();

  const list = h("div", "roster-list");
  /** The cape your characters wear (#1422): only with a valid tag. */
  const worn = (): ReturnType<typeof capeLook> | undefined => {
    const { guildCape } = playerGuild();
    return guildCape === null ? undefined : capeLook(guildCape);
  };
  /** Every roster row and whose figure it shows, to redraw as the cape changes. */
  const figured: { readonly row: HTMLElement; readonly character: StoredCharacter }[] = [];
  /** Choose who to play, and keep the focus on the row a key chose. */
  const choose = (id: string): void => {
    saveActiveCharacterId(id);
    callbacks.onSelectCharacter(id);
    root.querySelector<HTMLElement>(".roster .selectable-row.is-selected button")?.focus();
  };

  for (const character of rosterOrder(characters, starter)) {
    // The rolled character is never edited (#1147): Clone gives a fresh
    // roll to edit (#1457), and Reroll replaces it at once, unasked (#1146).
    const clone = button("Clone", "roster-clone", () => {
      // One copy per press: a double-click must not save two.
      clone.disabled = true;
      callbacks.onCloneStarter(character.id);
    });
    const actions =
      character.id === starter
        ? [
            clone,
            button("Reroll", "roster-reroll", () => {
              callbacks.onRerollCharacter(character.id);
            }),
          ]
        : [
            button("Edit", "roster-edit", () => {
              callbacks.onEditCharacter(character.id);
            }),
          ];
    const playable = isPlayable(character);
    const row = selectableRow({
      dot: createCharacterFigure(character, worn()),
      name: character.name,
      subtitle: rosterSubtitle(character, tallies.get(character.id)),
      miniBar: miniSkillBar(character),
      selected: character.id === active && playable,
      // Beside the row, not in it: editing never also chooses.
      actions,
      onSelect: () => {
        if (playable) {
          choose(character.id);
        }
      },
    });
    if (character.id === starter) {
      // Dashed, not only tagged: it differs by shape, not colour (#1426).
      row.classList.add("is-random");
    }
    if (!playable) {
      // Shown plainly, never chosen; Edit still fixes it (#1290).
      row.classList.add("is-invalid");
      row.querySelector(".selectable-row-choose")?.setAttribute("aria-disabled", "true");
    }
    row
      .querySelector(".selectable-row-name")
      ?.after(
        ...rosterTags(character, starter).map((tag) =>
          h("span", tag === "Random" ? "roster-random-tag" : "roster-invalid-tag", tag),
        ),
      );
    figured.push({ row, character });
    list.appendChild(row);
  }
  roster.appendChild(list);
  roster.appendChild(
    characters.length === 0
      ? emptyState("No characters yet.", "New character", callbacks.onNewCharacter)
      : button("New character", "", callbacks.onNewCharacter),
  );
  columns.appendChild(roster);

  // --- play -------------------------------------------------------------
  const play = h("section", "menu-play");
  play.appendChild(h("h2", "menu-column-title", "Play"));

  const nameField = h("label", "field");
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.setAttribute("aria-label", "Name");
  nameInput.placeholder = "Player";
  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => {
    savePlayerName(nameInput.value);
  });
  nameField.appendChild(nameInput);
  // The guild tag beside it (#1406): `Ente [VIBE]` to everyone else.
  const tagField = h("label", "field menu-guild-tag");
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
  const identityRow = h("div", "menu-identity");
  identityRow.appendChild(nameField);
  identityRow.appendChild(tagField);
  play.appendChild(identityRow);

  // The cape designer under it (#1422), only while the tag is valid: the
  // cape is the guild's. The roster's figures wear what it makes.
  let cape = loadGuildCape();
  const designer = capeDesigner((pick) => {
    cape = pickCape(cape, pick);
    saveGuildCape(cape);
    showCape();
  });
  const showCape = (): void => {
    designer.root.hidden = !showsCapeDesigner(tagInput.value);
    designer.show(cape);
    const look = worn();
    for (const { row, character } of figured) {
      row.querySelector(".character-figure")?.replaceWith(createCharacterFigure(character, look));
    }
  };
  designer.root.hidden = !showsCapeDesigner(tagInput.value);
  designer.show(cape);
  play.appendChild(designer.root);

  // Random Arena first (#854 B1): it needs no code and no friends.
  const arenaRow = h("div", "menu-row menu-random-arena");
  const queue = button("Random Arena", "primary", () => {
    callbacks.onRandomArena(randomArenaMode, nameInput.value);
  });
  queue.disabled = !activeExists;
  arenaRow.appendChild(queue);
  const modes = h("div", "random-arena-modes");
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Random Arena mode");
  const modeButtons = RANDOM_ARENA_MODES.map(({ mode, label }) => {
    const choice = button(label, "random-arena-mode", () => {
      randomArenaMode = mode;
      for (const [index, other] of modeButtons.entries()) {
        other.setAttribute("aria-pressed", String(RANDOM_ARENA_MODES[index]?.mode === mode));
      }
    });
    choice.setAttribute("aria-pressed", String(mode === randomArenaMode));
    modes.appendChild(choice);
    return choice;
  });
  arenaRow.appendChild(modes);
  if (!activeExists) {
    arenaRow.appendChild(h("span", "menu-random-arena-hint", NO_CHARACTER_FOR_QUEUE));
  }
  play.appendChild(arenaRow);

  // Why the last try failed, right above the buttons to try again with.
  if (connectionNotice !== undefined) {
    play.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }

  const hostRow = h("div", "menu-row");
  hostRow.appendChild(
    button("Host a lobby", "primary", () => {
      callbacks.onCreateLobby(nameInput.value);
    }),
  );
  play.appendChild(hostRow);

  const joinRow = h("div", "menu-row");
  const codeInput = document.createElement("input");
  codeInput.className = "field-input code-input";
  codeInput.placeholder = "CODE";
  codeInput.maxLength = 8;
  codeInput.setAttribute("aria-label", "Lobby code");
  codeInput.addEventListener("input", () => {
    // Codes are always upper case; doing it as they type avoids a
    // "why didn't my code work" moment.
    codeInput.value = codeInput.value.toUpperCase();
  });
  // Shown once a join has run a while; the lobby, or the menu again with
  // why it failed, replaces this screen when it ends.
  const connecting = h("p", "menu-connecting", "Connecting…");
  connecting.setAttribute("role", "status");
  connecting.hidden = true;
  const join = (): void => {
    callbacks.onJoinLobby(codeInput.value, nameInput.value);
    setTimeout(() => {
      if (panel.isConnected) {
        connecting.hidden = false;
      }
    }, CONNECTING_NOTICE_MS);
  };
  codeInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      join();
    }
  });
  joinRow.appendChild(codeInput);
  joinRow.appendChild(button("Join", "primary", join));
  play.appendChild(joinRow);
  play.appendChild(connecting);
  columns.appendChild(play);

  root.appendChild(panel);
  if (rerolled) {
    root.querySelector<HTMLElement>(".roster-reroll")?.focus();
  }
}

/* -------------------------------------------------------------------------- */
/* Character / team list screens                                               */
/* -------------------------------------------------------------------------- */

export interface TeamListCallbacks {
  readonly onNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onBack: () => void;
  /** A team code was pasted on the list (#577). */
  readonly onPasteTeam: (text: string) => void;
}

/** "1 member", "3 members". */
export function memberCount(count: number): string {
  return `${String(count)} ${count === 1 ? "member" : "members"}`;
}

/**
 * The team builds, one selectable row each (#581): a press opens it in
 * the team editor. Each row shows its member count and its members'
 * figures; an empty list says so where the rows would be, with "New team
 * build".
 */
export function renderTeamList(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  callbacks: TeamListCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen team-list");
  screenBar({
    crumbs: ["VibeWars", "Team Builds"],
    back: { label: "Back", onBack: callbacks.onBack },
    // An empty list holds the one "New team build" itself.
    actions: teams.length === 0 ? [] : [button("New team build", "primary", callbacks.onNew)],
  });

  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  if (teams.length === 0) {
    panel.appendChild(emptyState("No team builds yet.", "New team build", callbacks.onNew));
  }

  const list = h("div", "entity-list");
  for (const team of teams) {
    const dots = h("span", "team-list-dots");
    for (const member of team.members) {
      // A team is played by bots, and a bot wears no cape.
      dots.appendChild(createCharacterFigure(member.character, undefined));
    }
    list.appendChild(
      selectableRow({
        name: team.name,
        subtitle: memberCount(team.members.length),
        miniBar: dots,
        onSelect: () => {
          callbacks.onEdit(team.id);
        },
      }),
    );
  }
  panel.appendChild(list);

  root.appendChild(panel);

  // A team code pasted on the list opens that team (#577); a single build
  // code is not a team, and is ignored. The list has no dispose, so the
  // listener stops itself once the list is off screen.
  const stopPaste = listenForPaste((text) => {
    if (!panel.isConnected) {
      stopPaste();
      return false;
    }
    if (!looksLikeTeam(text)) {
      return false;
    }
    callbacks.onPasteTeam(text);
    return true;
  });
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
  const root = h("div", "menu-cape");
  root.appendChild(h("span", "field-label", "Guild cape"));
  const pressed: {
    readonly button: HTMLButtonElement;
    readonly on: (cape: WireCape) => boolean;
  }[] = [];
  const swatchRow = (part: "main" | "trim", label: string): void => {
    const row = h("div", "menu-cape-row");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", label);
    row.appendChild(h("span", "menu-cape-row-label", label));
    for (const colour of CAPE_COLOURS) {
      const swatch = button("", "menu-cape-swatch", () => {
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
  const emblems = h("div", "menu-cape-row");
  emblems.setAttribute("role", "group");
  emblems.setAttribute("aria-label", "Emblem");
  emblems.appendChild(h("span", "menu-cape-row-label", "Emblem"));
  for (const emblem of CAPE_EMBLEMS) {
    const choice = button("", "menu-cape-emblem", () => {
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
  const none = button("No cape", "menu-cape-none", () => {
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
 * canvas, not the canvas: the menu keeps no canvases of its own (#1422).
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
