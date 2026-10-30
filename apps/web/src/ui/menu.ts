import type { QueueMode } from "@vibewars/game-protocol";

import { capeLook } from "../render/cape-shape.js";
import type { Tally } from "../storage/match-record.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter } from "../storage/schema.js";
import { validateBuild } from "../storage/build-validation.js";
import { createCharacterFigure } from "./character-figure.js";
import { equippedCount, miniSkillBar, professionLabel } from "./character-preview.js";
import { button, emptyState, h, screenBar, selectableRow } from "./kit.js";
import { loadPlayerName, playerGuild } from "./player-section.js";

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
  /** Show Solo Play or Team Play (#1453); the menu has stored it. */
  readonly onSwitchTab: (tab: PlayTab) => void;
  /** Open the Record screen (#1404). */
  readonly onShowRecord: () => void;
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

/** The main screen's two tabs (#1453): your own character, or a team. */
export type PlayTab = "solo" | "team";

/** The tabs as the title bar reads them, Solo Play first. */
export const PLAY_TABS: readonly { readonly tab: PlayTab; readonly label: string }[] = [
  { tab: "solo", label: "Solo Play" },
  { tab: "team", label: "Team Play" },
];

const PLAY_TAB_STORAGE_KEY = `${STORAGE_NAMESPACE}.playTab`;

/** The tab last shown; Solo Play on a first start, and for anything else stored. */
export function loadPlayTab(): PlayTab {
  try {
    return localStorage.getItem(PLAY_TAB_STORAGE_KEY) === "team" ? "team" : "solo";
  } catch {
    // Same reasoning as the name.
    return "solo";
  }
}

export function savePlayTab(tab: PlayTab): void {
  try {
    localStorage.setItem(PLAY_TAB_STORAGE_KEY, tab);
  } catch {
    // Same reasoning as the name.
  }
}

/**
 * The switch after "VibeWars" in the title bar (#1453): `active` pressed,
 * the other stores itself and goes to `onSwitch`.
 */
export function playTabs(active: PlayTab, onSwitch: (tab: PlayTab) => void): HTMLElement {
  const group = h("div", "play-tabs");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Play");
  for (const { tab, label } of PLAY_TABS) {
    const choice = button(label, "play-tab", () => {
      if (tab !== active) {
        savePlayTab(tab);
        onSwitch(tab);
      }
    });
    choice.setAttribute("aria-pressed", String(tab === active));
    group.appendChild(choice);
  }
  return group;
}

/**
 * Solo Play's own buttons in the title bar (#1453): Record. Team Builds
 * are Team Play's, and Music is the ♪.
 */
export function soloPlayActions(
  callbacks: Pick<MenuCallbacks, "onShowRecord">,
): readonly { readonly label: string; readonly onPress: () => void }[] {
  return [{ label: "Record", onPress: callbacks.onShowRecord }];
}

/**
 * The join row, a code and Join, then "Connecting…" once a join has run
 * a while (#707): Solo Play's and Team Play's (#1453). `name` is read at
 * the press.
 */
export function joinControls(
  panel: HTMLElement,
  name: () => string,
  onJoin: (code: string, name: string) => void,
): HTMLElement[] {
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
    onJoin(codeInput.value, name());
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
  return [joinRow, connecting];
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
 * Render Solo Play (#579, #1453): your characters on the left, Play on
 * the right, and the Solo/Team Play switch and Record in the screen bar. Each
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
  // Options is the top bar's ⚙ (#1272), Music its ♪ (#1453).
  screenBar({
    crumbs: ["VibeWars"],
    status: [playTabs("solo", callbacks.onSwitchTab)],
    actions: soloPlayActions(callbacks).map(({ label, onPress }) => button(label, "", onPress)),
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
  // The cape your characters wear (#1422): only with a valid tag. Set in
  // Options, which re-renders the menu as it closes (#1513).
  const { guildCape } = playerGuild();
  const worn = guildCape === null ? undefined : capeLook(guildCape);
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
      dot: createCharacterFigure(character, worn),
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

  // Random Arena first (#854 B1): it needs no code and no friends.
  const arenaRow = h("div", "menu-row menu-random-arena");
  const queue = button("Random Arena", "primary", () => {
    callbacks.onRandomArena(randomArenaMode, loadPlayerName());
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
      callbacks.onCreateLobby(loadPlayerName());
    }),
  );
  play.appendChild(hostRow);

  play.append(...joinControls(panel, loadPlayerName, callbacks.onJoinLobby));
  columns.appendChild(play);

  root.appendChild(panel);
  if (rerolled) {
    root.querySelector<HTMLElement>(".roster-reroll")?.focus();
  }
}
