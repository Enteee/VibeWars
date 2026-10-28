import type { QueueMode } from "@vibewars/game-protocol";

import { SOURCE_URL } from "../source.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter, StoredTeam } from "../storage/schema.js";
import { validateBuild } from "../storage/build-validation.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import {
  createCharacterDot,
  equippedCount,
  miniSkillBar,
  professionLabel,
} from "./character-preview.js";
import {
  button,
  emptyState,
  h,
  inlineConfirm,
  listenForPaste,
  screenBar,
  selectableRow,
} from "./kit.js";

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
  /** Queue for a Random Arena of `mode` as `name` (#880), with the active character. */
  readonly onRandomArena: (mode: QueueMode, name: string) => void;
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

/** Reroll's question for the rolled character `name` (#853). */
export function rerollQuestion(name: string): string {
  return `Replace ${name} with another random build?`;
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Same reasoning as above: this is a convenience, not a requirement.
  }
}

/** "Elementalist / Monk · 5/8 skills", and says so when the build is illegal. */
export function rosterSubtitle(character: StoredCharacter): string {
  const professions = professionLabel(character.primaryProfession, character.secondaryProfession);
  const skills = `${String(equippedCount(character))}/${String(character.skillBar.length)} skills`;
  const invalid = validateBuild(character).length > 0 ? " · invalid build" : "";
  return `${professions} · ${skills}${invalid}`;
}

/**
 * Render the main menu (#579): your characters on the left, Play on the
 * right, and Teams, Options and Music in the screen bar.
 */
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
    screenBar({
      title: [h("h1", "screen-title", "VibeWars")],
      actions: [
        button("Teams", "", callbacks.onManageTeams),
        button("Options", "", callbacks.onOptions),
        button("Music", "", callbacks.onMusic),
      ],
    }).element,
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
  const activeExists = characters.some((c) => c.id === active);
  const starter = loadStarterCharacterId();

  const list = h("div", "roster-list");
  /** Choose who to play, and keep the focus on the row a key chose. */
  const choose = (id: string): void => {
    saveActiveCharacterId(id);
    callbacks.onSelectCharacter(id);
    root.querySelector<HTMLElement>(".roster .selectable-row.is-selected button")?.focus();
  };

  for (const character of characters) {
    const actions = [
      button("Edit", "roster-edit", () => {
        callbacks.onEditCharacter(character.id);
      }),
    ];
    if (character.id === starter) {
      // Asked first: rerolling throws away whatever was edited on it.
      const reroll = button("Reroll", "roster-reroll", () => {
        inlineConfirm(reroll, rerollQuestion(character.name), "Reroll", () => {
          callbacks.onRerollCharacter(character.id);
        });
      });
      actions.push(reroll);
    }
    list.appendChild(
      selectableRow({
        dot: createCharacterDot(character),
        name: character.name,
        subtitle: rosterSubtitle(character),
        miniBar: miniSkillBar(character),
        selected: character.id === active,
        // Beside the row, not in it: editing never also chooses.
        actions,
        onSelect: () => {
          choose(character.id);
        },
      }),
    );
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
  nameField.appendChild(h("span", "field-label", "Your name (other players see it)"));
  const nameInput = document.createElement("input");
  nameInput.className = "field-input";
  nameInput.placeholder = "Player";
  nameInput.value = loadPlayerName();
  nameInput.addEventListener("input", () => {
    savePlayerName(nameInput.value);
  });
  nameField.appendChild(nameInput);
  play.appendChild(nameField);

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
  // Under host and join, so it is read before either (#541, SECURITY.md).
  play.appendChild(h("p", "menu-peer-notice", PEER_IP_NOTICE));
  columns.appendChild(play);

  root.appendChild(panel);
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
 * The teams, one selectable row each (#581): a press opens it in the team
 * editor. Each row shows its member count and its members' dots; an
 * empty list says so where the rows would be, with "New team".
 */
export function renderTeamList(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  characters: readonly StoredCharacter[],
  problems: readonly string[],
  callbacks: TeamListCallbacks,
): void {
  root.replaceChildren();
  const panel = h("div", "screen team-list");
  panel.appendChild(
    screenBar({
      back: { label: "Back", onBack: callbacks.onBack },
      title: [h("h2", "screen-title", "Teams")],
      // An empty list holds the one "New team" itself.
      actions: teams.length === 0 ? [] : [button("New team", "primary", callbacks.onNew)],
    }).element,
  );

  for (const problem of problems) {
    panel.appendChild(h("div", "screen-problem", problem));
  }

  if (teams.length === 0) {
    panel.appendChild(emptyState("No teams yet.", "New team", callbacks.onNew));
  }

  const list = h("div", "entity-list");
  for (const team of teams) {
    // A member whose character is gone has no dot; the editor shows it.
    const dots = h("span", "team-list-dots");
    for (const member of team.members) {
      const character = characters.find((c) => c.id === member.characterId);
      if (character !== undefined) {
        dots.appendChild(createCharacterDot(character));
      }
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
