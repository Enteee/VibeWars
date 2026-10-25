import { SOURCE_URL } from "../source.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { createCharacterDot, equippedCount, professionLabel } from "./character-preview.js";

/**
 * The main menu and lobby screens (brief §21).
 *
 * Screens are plain DOM rendered into one container; `showScreen` swaps
 * which one is visible. There is no router and no framework — four
 * screens with no deep linking do not need one.
 */

export interface MenuCallbacks {
  readonly onCreateLobby: (name: string) => void;
  readonly onJoinLobby: (code: string, name: string) => void;
  readonly onManageTeams: () => void;
  /** Open the Options screen (#423). */
  readonly onOptions: () => void;
  /** Open the jukebox (#372). */
  readonly onMusic: () => void;
  readonly onQuickMatch: (name: string) => void;
  /** Open the build editor on a new character. */
  readonly onNewCharacter: () => void;
  readonly onEditCharacter: (id: string) => void;
  /** Called when the player picks who to play; re-renders the list. */
  readonly onSelectCharacter: (id: string | undefined) => void;
}

function h(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== undefined) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = label;
  node.addEventListener("click", onClick);
  return node;
}

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

export function saveActiveCharacterId(id: string | undefined): void {
  try {
    if (id === undefined) {
      localStorage.removeItem(CHARACTER_STORAGE_KEY);
    } else {
      localStorage.setItem(CHARACTER_STORAGE_KEY, id);
    }
  } catch {
    // A convenience, not a requirement — same reasoning as the name.
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Same reasoning as above: this is a convenience, not a requirement.
  }
}

/** Shown under the online controls of a build with no server behind it. */
export const OFFLINE_HINT = "Online play isn't available in this build yet.";

/**
 * Render the main menu.
 *
 * `onlinePlay` is `ONLINE_PLAY` from `net/online.ts`, passed in rather
 * than imported so the offline menu can be exercised without stubbing the
 * build environment. When it is false, every control that would open a
 * connection (host, join, Quick Match) is rendered disabled.
 */
export function renderMenu(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  onlinePlay: boolean,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-menu");

  panel.appendChild(h("h1", "screen-title", "VibeWars"));
  const subtitle = h(
    "p",
    "screen-subtitle",
    "A minimalist tactical PvP arena. Built for LAN parties. ",
  );
  // The AGPL's network clause: whoever plays it is offered the source.
  const source = h("a", "screen-source", "source");
  source.setAttribute("href", SOURCE_URL);
  // A new tab, so reading the source never leaves the game.
  source.setAttribute("target", "_blank");
  source.setAttribute("rel", "noopener");
  subtitle.appendChild(source);
  panel.appendChild(subtitle);
  if (connectionNotice !== undefined) {
    panel.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }

  const nameField = h("label", "field");
  nameField.appendChild(h("span", "field-label", "your name"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.placeholder = "player";
  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => {
    savePlayerName(nameInput.value);
  });
  nameField.appendChild(nameInput);
  panel.appendChild(nameField);

  // --- your characters --------------------------------------------------
  // The roster lives here rather than behind a "characters" button: it is
  // the thing you pick before every match, so hiding it one click away
  // made the build editor feel optional when it is not.
  const roster = h("div", "roster");
  roster.appendChild(h("span", "field-label", "play as"));

  for (const problem of characterProblems) {
    roster.appendChild(h("div", "screen-problem", problem));
  }

  const active = loadActiveCharacterId();
  const activeExists = characters.some((c) => c.id === active);

  const list = h("div", "roster-list");

  // The house loadout is a roster entry too, so "what am I playing?" has
  // exactly one answer visible in one place.
  const houseRow = h("div", "roster-row");
  if (!activeExists) {
    houseRow.classList.add("is-active");
  }
  const houseDot = h("span", "character-dot is-house", "?");
  houseRow.appendChild(houseDot);
  const houseText = h("div", "roster-text");
  houseText.appendChild(h("span", "roster-name", "Default loadout"));
  houseText.appendChild(h("span", "roster-sub", "Eight ready-made skills, no build needed"));
  houseRow.appendChild(houseText);
  houseRow.addEventListener("click", () => {
    saveActiveCharacterId(undefined);
    callbacks.onSelectCharacter(undefined);
  });
  list.appendChild(houseRow);

  for (const character of characters) {
    const row = h("div", "roster-row");
    if (character.id === active) {
      row.classList.add("is-active");
    }
    row.appendChild(createCharacterDot(character));

    const text = h("div", "roster-text");
    text.appendChild(h("span", "roster-name", character.name));
    const equipped = equippedCount(character);
    text.appendChild(
      h(
        "span",
        "roster-sub",
        `${professionLabel(character.primaryProfession, character.secondaryProfession)} · ` +
          `${String(equipped)}/${String(character.skillBar.length)} skills`,
      ),
    );
    row.appendChild(text);

    row.addEventListener("click", () => {
      saveActiveCharacterId(character.id);
      callbacks.onSelectCharacter(character.id);
    });

    const edit = button("edit", "roster-edit", () => {
      callbacks.onEditCharacter(character.id);
    });
    // Editing must not also select; the row's own click would otherwise
    // fire and change who you are playing as a side effect.
    edit.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    row.appendChild(edit);

    list.appendChild(row);
  }
  roster.appendChild(list);
  roster.appendChild(button("new character", "", callbacks.onNewCharacter));
  panel.appendChild(roster);

  const hostRow = h("div", "menu-row");
  const host = button("host a lobby", "primary", () => {
    callbacks.onCreateLobby(nameInput.value);
  });
  host.disabled = !onlinePlay;
  hostRow.appendChild(host);
  panel.appendChild(hostRow);

  const joinRow = h("div", "menu-row");
  const codeInput = document.createElement("input");
  codeInput.className = "field-input code-input";
  codeInput.placeholder = "CODE";
  codeInput.maxLength = 8;
  codeInput.addEventListener("input", () => {
    // Codes are always upper case; doing it as they type avoids a
    // "why didn't my code work" moment.
    codeInput.value = codeInput.value.toUpperCase();
  });
  const join = (): void => {
    callbacks.onJoinLobby(codeInput.value, nameInput.value);
  };
  codeInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      join();
    }
  });
  const joinButton = button("join", "primary", join);
  // The code field too: Enter in it calls `join` without the button.
  codeInput.disabled = !onlinePlay;
  joinButton.disabled = !onlinePlay;
  joinRow.appendChild(codeInput);
  joinRow.appendChild(joinButton);
  panel.appendChild(joinRow);

  const manageRow = h("div", "menu-row");
  manageRow.appendChild(button("teams", "", callbacks.onManageTeams));
  manageRow.appendChild(button("options", "", callbacks.onOptions));
  manageRow.appendChild(button("music", "", callbacks.onMusic));
  const quickMatch = button("quick match", "", () => {
    callbacks.onQuickMatch(nameInput.value);
  });
  quickMatch.disabled = !onlinePlay;
  manageRow.appendChild(quickMatch);
  panel.appendChild(manageRow);

  if (!onlinePlay) {
    panel.appendChild(h("p", "screen-empty menu-offline-hint", OFFLINE_HINT));
  }

  root.appendChild(panel);
}

/* -------------------------------------------------------------------------- */
/* Character / team list screens                                               */
/* -------------------------------------------------------------------------- */

export interface TeamListCallbacks {
  readonly onNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onBack: () => void;
}

export function renderTeamList(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  callbacks: TeamListCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen");
  panel.appendChild(h("h2", "screen-title", "teams"));

  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  if (teams.length === 0) {
    panel.appendChild(h("p", "screen-empty", "No teams yet."));
  }

  const list = h("div", "entity-list");
  for (const team of teams) {
    const row = h("div", "entity-row");
    row.appendChild(
      h("span", "entity-name", `${team.name} (${String(team.members.length)} members)`),
    );
    row.appendChild(
      button("edit", "", () => {
        callbacks.onEdit(team.id);
      }),
    );
    list.appendChild(row);
  }
  panel.appendChild(list);

  const actions = h("div", "menu-row");
  actions.appendChild(button("new team", "primary", callbacks.onNew));
  actions.appendChild(button("back", "", callbacks.onBack));
  panel.appendChild(actions);

  root.appendChild(panel);
}
