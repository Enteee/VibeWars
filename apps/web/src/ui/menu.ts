import { SOURCE_URL } from "../source.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { createCharacterDot, equippedCount, professionLabel } from "./character-preview.js";
import { button, h, screenBar } from "./kit.js";

/** What every peer in a lobby learns about you (#541): WebRTC connects you directly. */
export const PEER_IP_NOTICE =
  "Online play connects you straight to the other players, so they can see your IP address.";

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
  /** Open the build editor on a new character. */
  readonly onNewCharacter: () => void;
  readonly onEditCharacter: (id: string) => void;
  /** Called when the player picks who to play; re-renders the list. */
  readonly onSelectCharacter: (id: string | undefined) => void;
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

/** Render the main menu. */
export function renderMenu(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
): void {
  root.replaceChildren();
  const panel = h("div", "screen screen-menu");

  // No way back from here, so Esc has nothing to do but cancel (#578).
  panel.appendChild(
    screenBar({ title: [h("h1", "screen-title", "VibeWars")], actions: [] }).element,
  );
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
  nameField.appendChild(h("span", "field-label", "Your name"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.placeholder = "Player";
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
  roster.appendChild(h("span", "field-label", "Play as"));

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

    const edit = button("Edit", "roster-edit", () => {
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
  roster.appendChild(button("New character", "", callbacks.onNewCharacter));
  panel.appendChild(roster);

  const hostRow = h("div", "menu-row");
  const host = button("Host a lobby", "primary", () => {
    callbacks.onCreateLobby(nameInput.value);
  });
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
  const joinButton = button("Join", "primary", join);
  joinRow.appendChild(codeInput);
  joinRow.appendChild(joinButton);
  panel.appendChild(joinRow);
  // Under host and join, so it is read before either (#541, SECURITY.md).
  panel.appendChild(h("p", "menu-peer-notice", PEER_IP_NOTICE));

  const manageRow = h("div", "menu-row");
  manageRow.appendChild(button("Teams", "", callbacks.onManageTeams));
  manageRow.appendChild(button("Options", "", callbacks.onOptions));
  manageRow.appendChild(button("Music", "", callbacks.onMusic));
  panel.appendChild(manageRow);

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
  panel.appendChild(
    screenBar({
      back: { label: "Back", onBack: callbacks.onBack },
      title: [h("h2", "screen-title", "Teams")],
      actions: [button("New team", "primary", callbacks.onNew)],
    }).element,
  );

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
      button("Edit", "", () => {
        callbacks.onEdit(team.id);
      }),
    );
    list.appendChild(row);
  }
  panel.appendChild(list);

  root.appendChild(panel);
}
