import type { StoredCharacter, StoredTeam } from "../storage/schema.js";

/**
 * The main menu and lobby screens (brief §21).
 *
 * Screens are plain DOM rendered into one container; `showScreen` swaps
 * which one is visible. There is no router and no framework — four
 * screens with no deep linking do not need one.
 */

export type ScreenName = "menu" | "characters" | "teams" | "lobby" | "match";

export interface MenuCallbacks {
  readonly onCreateLobby: (name: string) => void;
  readonly onJoinLobby: (code: string, name: string) => void;
  readonly onManageCharacters: () => void;
  readonly onManageTeams: () => void;
  readonly onQuickMatch: () => void;
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

const NAME_STORAGE_KEY = "vibewars.playerName";

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

const CHARACTER_STORAGE_KEY = "vibewars.activeCharacterId";

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

export function renderMenu(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-menu");

  panel.appendChild(h("h1", "screen-title", "vibewars"));
  panel.appendChild(
    h("p", "screen-subtitle", "A minimalist tactical PvP arena. Built for LAN parties."),
  );

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

  // --- which character you play ----------------------------------------
  // Without this the build editor is decoration: every player would join
  // with the server's house loadout no matter what they had built.
  const buildField = h("label", "field");
  buildField.appendChild(h("span", "field-label", "play as"));
  const buildSelect = document.createElement("select");
  buildSelect.className = "field-input";

  const houseOption = document.createElement("option");
  houseOption.value = "";
  houseOption.textContent =
    characters.length === 0 ? "default loadout" : "default loadout (no build)";
  buildSelect.appendChild(houseOption);

  for (const character of characters) {
    const option = document.createElement("option");
    option.value = character.id;
    const secondary = character.secondaryProfession;
    option.textContent =
      secondary === undefined
        ? `${character.name} (${character.primaryProfession})`
        : `${character.name} (${character.primaryProfession}/${secondary})`;
    buildSelect.appendChild(option);
  }

  // A character deleted since it was chosen falls back to the house
  // loadout rather than selecting nothing.
  const active = loadActiveCharacterId();
  buildSelect.value = characters.some((c) => c.id === active) ? (active ?? "") : "";

  buildSelect.addEventListener("change", () => {
    saveActiveCharacterId(buildSelect.value === "" ? undefined : buildSelect.value);
  });
  buildField.appendChild(buildSelect);
  panel.appendChild(buildField);

  const hostRow = h("div", "menu-row");
  hostRow.appendChild(
    button("host a lobby", "primary", () => {
      callbacks.onCreateLobby(nameInput.value);
    }),
  );
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
  joinRow.appendChild(codeInput);
  joinRow.appendChild(button("join", "primary", join));
  panel.appendChild(joinRow);

  const manageRow = h("div", "menu-row");
  manageRow.appendChild(button("characters", "", callbacks.onManageCharacters));
  manageRow.appendChild(button("teams", "", callbacks.onManageTeams));
  manageRow.appendChild(button("quick match", "", callbacks.onQuickMatch));
  panel.appendChild(manageRow);

  root.appendChild(panel);
}

/* -------------------------------------------------------------------------- */
/* Character / team list screens                                               */
/* -------------------------------------------------------------------------- */

export interface CharacterListCallbacks {
  readonly onNew: () => void;
  readonly onEdit: (id: string) => void;
  readonly onBack: () => void;
}

export function renderCharacterList(
  root: HTMLElement,
  characters: readonly StoredCharacter[],
  problems: readonly string[],
  callbacks: CharacterListCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen");
  panel.appendChild(h("h2", "screen-title", "characters"));

  // Storage problems are shown rather than swallowed: a user whose saved
  // build failed to load needs to know, not silently see it missing.
  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  if (characters.length === 0) {
    panel.appendChild(h("p", "screen-empty", "No characters yet."));
  }

  const list = h("div", "entity-list");
  for (const character of characters) {
    const row = h("div", "entity-row");
    row.appendChild(
      h(
        "span",
        "entity-name",
        `${character.name} — ${character.primaryProfession}${
          character.secondaryProfession !== undefined ? `/${character.secondaryProfession}` : ""
        }`,
      ),
    );
    row.appendChild(
      button("edit", "", () => {
        callbacks.onEdit(character.id);
      }),
    );
    list.appendChild(row);
  }
  panel.appendChild(list);

  const actions = h("div", "menu-row");
  actions.appendChild(button("new character", "primary", callbacks.onNew));
  actions.appendChild(button("back", "", callbacks.onBack));
  panel.appendChild(actions);

  root.appendChild(panel);
}

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
