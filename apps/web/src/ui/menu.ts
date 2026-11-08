import type { QueueMode } from "@vibewars/game-protocol";

import { t } from "../i18n/index.js";
import { capeLook } from "../render/cape-shape.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter } from "../storage/schema.js";
import { validateBuild } from "../storage/build-validation.js";
import { characterFigureCard, lookOfCharacter } from "./character-card.js";
import { equippedCount, professionLabel } from "./character-preview.js";
import { button, emptyState, h, playCard, readyButton, screenBar } from "./kit.js";
import { loadPlayerName, playerGuild } from "./player-section.js";
import { isAlone } from "./lobby-window.js";
import { loadTeamSize, railParty, railScreen, type RailEntry, type TeamSize } from "./rail.js";

/**
 * The menu's character screens (brief §21, #1525): Random Arena, where
 * you pick who to queue as, and Character Builder, where you make them.
 *
 * Screens are plain DOM rendered into one container; `showScreen` swaps
 * which one is visible. There is no router and no framework.
 */

export interface MenuCallbacks {
  /** Queue for a Random Arena of `mode` as `name` (#880), with the active character. */
  readonly onRandomArena: (mode: QueueMode, name: string) => void;
  /** Show another rail entry (#1525); the rail has stored it. */
  readonly onSwitch: (entry: RailEntry) => void;
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

/** The Random Arena formats (Q97), smallest first: the queue each team size joins (#2022). */
export const RANDOM_ARENA_MODES: readonly {
  readonly size: TeamSize;
  readonly mode: QueueMode;
  readonly label: string;
}[] = [
  { size: 1, mode: "random-arena-1v1", label: "1v1" },
  { size: 2, mode: "random-arena-2v2", label: "2v2" },
  { size: 4, mode: "random-arena-4v4", label: "4v4" },
];

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

export function clearStarterCharacterId(): void {
  try {
    localStorage.removeItem(STARTER_STORAGE_KEY);
  } catch {
    // Still set, the stale id matches no row: as before #2717, not a crash.
  }
}

/** "Elementalist / Monk · 5/8 skills". */
export function rosterSubtitle(character: StoredCharacter): string {
  return t("character.skillsLine", {
    professions: professionLabel(character.primaryProfession, character.secondaryProfession),
    equipped: equippedCount(character),
    slots: character.skillBar.length,
  });
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
 * The tags after a roster row's name (#1426): "random" on the rolled
 * starter character, so it reads as not yours at a glance, then "invalid"
 * on a build the rules no longer allow (#1290).
 */
export function rosterTags(
  character: StoredCharacter,
  starter: string | undefined,
): ("random" | "invalid")[] {
  const tags: ("random" | "invalid")[] = [];
  if (character.id === starter) {
    tags.push("random");
  }
  if (!isPlayable(character)) {
    tags.push("invalid");
  }
  return tags;
}

/** The cards' shared parts: who, as the arena draws them, then their line and bar. */
interface CharacterCardParts {
  readonly character: StoredCharacter;
  readonly starter: string | undefined;
  readonly worn: ReturnType<typeof capeLook> | undefined;
}

/** A character's card, marked Random and Invalid as its tags say (#1290, #1426). */
function characterCard(
  { character, starter, worn }: CharacterCardParts,
  options: Pick<Parameters<typeof playCard>[0], "onOpen" | "pressed" | "actions">,
): HTMLElement {
  const card = playCard({
    name: character.name,
    tags: rosterTags(character, starter).map((tag) =>
      tag === "random"
        ? h("span", "roster-random-tag", t("menu.randomTag"))
        : h("span", "roster-invalid-tag", t("menu.invalidTag")),
    ),
    content: [
      characterFigureCard(lookOfCharacter(character, worn), {
        size: "card",
        line: rosterSubtitle(character),
      }),
    ],
    ...options,
  });
  card.classList.add("character-card");
  if (character.id === starter) {
    // Dashed, not only tagged: it differs by shape, not colour (#1426).
    card.classList.add("is-random");
  }
  if (!isPlayable(character)) {
    card.classList.add("is-invalid");
  }
  return card;
}

/** The cape your characters wear (#1422): only with a valid tag, set in Options (#1513). */
function wornCape(): ReturnType<typeof capeLook> | undefined {
  const { guildCape } = playerGuild();
  return guildCape === null ? undefined : capeLook(guildCape);
}

/**
 * Why Random Arena's Ready cannot queue (#2022), or `undefined` when it
 * can: a character to show strangers, alone (#1526). Its size is always
 * one it plays (#2141).
 */
export function randomArenaProblem(hasCharacter: boolean, alone: boolean): string | undefined {
  if (!hasCharacter) {
    return t("menu.noCharacterForQueue");
  }
  if (!alone) {
    return t("menu.partyCannotQueue");
  }
  return undefined;
}

/**
 * Render Random Arena (#880, #1525): your characters as cards, to pick who
 * to queue as and nothing more, and Ready in the bar, which queues at the
 * sidebar's team size (#2022).
 */
export function renderRandomArena(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
  /** In a queue (#2743): its character stays, and Ready cannot queue again. */
  queued = false,
): void {
  // No way back from here, so Esc has nothing to do but cancel (#578).
  // Options is the top bar's ⚙ (#1272), Music its ♪ (#1453).
  const ready = readyButton(false, () => {
    const queue = RANDOM_ARENA_MODES.find(({ size }) => size === loadTeamSize("random-arena"));
    if (queue !== undefined) {
      callbacks.onRandomArena(queue.mode, loadPlayerName());
    }
  });
  screenBar({ crumbs: ["VibeWars"], actions: [ready], join: true });
  const body = railScreen(root, "random-arena", callbacks.onSwitch);

  // Why the last try failed, under the bar it was tried from.
  if (connectionNotice !== undefined) {
    body.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }
  for (const problem of characterProblems) {
    body.appendChild(h("div", "screen-problem", problem));
  }

  const active = loadActiveCharacterId();
  // An invalid active character is no choice at all (#1290).
  const activeExists = characters.some((c) => c.id === active && isPlayable(c));
  const starter = loadStarterCharacterId();
  const worn = wornCape();
  const hint = h("p", "random-arena-hint");
  /** Choose who to play, and keep the focus on the card a key chose. */
  const choose = (id: string): void => {
    if (queued) {
      hint.textContent = t("menu.leaveQueueToChange");
      hint.hidden = false;
      return;
    }
    saveActiveCharacterId(id);
    callbacks.onSelectCharacter(id);
    root.querySelector<HTMLElement>(".play-card.is-selected .play-card-open")?.focus();
  };

  if (characters.length === 0) {
    body.appendChild(
      emptyState(t("menu.noCharacters"), t("menu.characterBuilder"), () => {
        callbacks.onSwitch("characters");
      }),
    );
  } else {
    const cards = h("div", "play-cards");
    for (const character of rosterOrder(characters, starter)) {
      const playable = isPlayable(character);
      const card = characterCard(
        { character, starter, worn },
        {
          pressed: character.id === active && playable,
          onOpen: () => {
            if (playable) {
              choose(character.id);
            }
          },
        },
      );
      if (!playable) {
        // Shown plainly, never chosen; Character Builder fixes it (#1290).
        card.querySelector(".play-card-open")?.setAttribute("aria-disabled", "true");
      }
      cards.appendChild(card);
    }
    body.appendChild(cards);
  }

  // Only alone (#1526): queueing closes the lobby, and a party does not queue yet.
  const alone = isAlone(railParty());
  body.appendChild(hint);
  const problem = queued ? t("queue.busy") : randomArenaProblem(activeExists, alone);
  ready.disabled = problem !== undefined;
  ready.title = problem ?? "";
  hint.textContent = problem ?? "";
  hint.hidden = problem === undefined;
}

/**
 * Render Character Builder (#1525): your characters as cards with what
 * makes and changes them, what Solo Play's rows had: Edit, or
 * Clone and Reroll on the random starter, and New character.
 */
export function renderCharacterBuilder(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
): void {
  // A Reroll redraws the screen under its own button (#1425): the new
  // card's Reroll takes the focus back.
  const rerolled = document.activeElement?.classList.contains("roster-reroll") === true;
  screenBar({ crumbs: ["VibeWars"], actions: [], join: true });
  const body = railScreen(root, "characters", callbacks.onSwitch);

  if (connectionNotice !== undefined) {
    body.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }
  for (const problem of characterProblems) {
    body.appendChild(h("div", "screen-problem", problem));
  }

  const starter = loadStarterCharacterId();
  const worn = wornCape();
  const cards = h("div", "play-cards");
  for (const character of rosterOrder(characters, starter)) {
    const edit = (): void => {
      callbacks.onEditCharacter(character.id);
    };
    // The rolled character is never edited (#1147): Clone gives a copy of
    // it to edit (#2038), and Reroll replaces it at once, unasked (#1146).
    const clone = button(t("menu.clone"), "roster-clone", () => {
      // One copy per press: a double-click must not save two.
      clone.disabled = true;
      callbacks.onCloneStarter(character.id);
    });
    cards.appendChild(
      characterCard(
        { character, starter, worn },
        character.id === starter
          ? {
              actions: [
                clone,
                button(t("menu.reroll"), "roster-reroll", () => {
                  callbacks.onRerollCharacter(character.id);
                }),
              ],
            }
          : { onOpen: edit, actions: [button(t("menu.edit"), "roster-edit", edit)] },
      ),
    );
  }
  if (characters.length > 0) {
    cards.appendChild(
      button(t("menu.newCharacter"), "play-card play-card-new", callbacks.onNewCharacter),
    );
  }
  body.appendChild(cards);
  if (characters.length === 0) {
    body.appendChild(
      emptyState(t("menu.noCharacters"), t("menu.newCharacter"), callbacks.onNewCharacter),
    );
  }

  if (rerolled) {
    root.querySelector<HTMLElement>(".roster-reroll")?.focus();
  }
}
