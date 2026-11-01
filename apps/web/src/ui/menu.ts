import type { QueueMode } from "@vibewars/game-protocol";

import { capeLook } from "../render/cape-shape.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import type { StoredCharacter } from "../storage/schema.js";
import { validateBuild } from "../storage/build-validation.js";
import { characterFigureCard, lookOfCharacter } from "./character-card.js";
import { equippedCount, professionLabel } from "./character-preview.js";
import { button, emptyState, h, playCard, screenBar } from "./kit.js";
import { loadPlayerName, playerGuild } from "./player-section.js";
import { isAlone } from "./party-strip.js";
import { railParty, railScreen, type RailEntry } from "./rail.js";

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

/** The Random Arena formats (Q97), as their tiles read, smallest first. */
export const RANDOM_ARENA_MODES: readonly { readonly mode: QueueMode; readonly label: string }[] = [
  { mode: "random-arena-1v1", label: "1v1" },
  { mode: "random-arena-2v2", label: "2v2" },
  { mode: "random-arena-4v4", label: "4v4" },
];

/** Why the Random Arena tiles are greyed out: a queue needs a character to show strangers. */
export const NO_CHARACTER_FOR_QUEUE = "Make a character first.";
/** Under the tiles while anyone else is in the lobby (#1526): a party queues in card 4. */
export const PARTY_CANNOT_QUEUE = "Leave the party, or play a Hosted Game";

/** What Random Arena is for, under its heading. */
export const RANDOM_ARENA_GOAL =
  "Pick a character, then queue: random allies and foes from the server.";

/** What Character Builder is for, under its heading. */
export const CHARACTER_BUILDER_GOAL = "Make, edit and reroll the characters you play.";

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

/** "Elementalist / Monk · 5/8 skills". */
export function rosterSubtitle(character: StoredCharacter): string {
  const professions = professionLabel(character.primaryProfession, character.secondaryProfession);
  const skills = `${String(equippedCount(character))}/${String(character.skillBar.length)} skills`;
  return `${professions} · ${skills}`;
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
      h("span", tag === "Random" ? "roster-random-tag" : "roster-invalid-tag", tag),
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
 * Render Random Arena (#880, #1525): your characters as cards, to pick who
 * to queue as and nothing more, and the three format tiles that queue.
 */
export function renderRandomArena(
  root: HTMLElement,
  callbacks: MenuCallbacks,
  characters: readonly StoredCharacter[] = [],
  characterProblems: readonly string[] = [],
  connectionNotice?: string,
): void {
  // No way back from here, so Esc has nothing to do but cancel (#578).
  // Options is the top bar's ⚙ (#1272), Music its ♪ (#1453).
  screenBar({ crumbs: ["VibeWars"], actions: [], join: true });
  const body = railScreen(root, "random-arena", RANDOM_ARENA_GOAL, callbacks.onSwitch);

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
  /** Choose who to play, and keep the focus on the card a key chose. */
  const choose = (id: string): void => {
    saveActiveCharacterId(id);
    callbacks.onSelectCharacter(id);
    root.querySelector<HTMLElement>(".play-card.is-selected .play-card-open")?.focus();
  };

  if (characters.length === 0) {
    body.appendChild(
      emptyState("No characters yet.", "Character Builder", () => {
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

  const tiles = h("div", "random-arena-tiles");
  tiles.setAttribute("role", "group");
  tiles.setAttribute("aria-label", "Find a match");
  // Only alone (#1526): queueing closes the lobby, and a party does not queue yet.
  const alone = isAlone(railParty());
  for (const { mode, label } of RANDOM_ARENA_MODES) {
    const tile = button(label, "random-arena-tile", () => {
      callbacks.onRandomArena(mode, loadPlayerName());
    });
    tile.disabled = !activeExists || !alone;
    tiles.appendChild(tile);
  }
  body.appendChild(tiles);
  if (!activeExists) {
    body.appendChild(h("p", "random-arena-hint", NO_CHARACTER_FOR_QUEUE));
  } else if (!alone) {
    body.appendChild(h("p", "random-arena-hint", PARTY_CANNOT_QUEUE));
  }
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
  const body = railScreen(root, "characters", CHARACTER_BUILDER_GOAL, callbacks.onSwitch);

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
    const clone = button("Clone", "roster-clone", () => {
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
                button("Reroll", "roster-reroll", () => {
                  callbacks.onRerollCharacter(character.id);
                }),
              ],
            }
          : { onOpen: edit, actions: [button("Edit", "roster-edit", edit)] },
      ),
    );
  }
  if (characters.length > 0) {
    cards.appendChild(button("New character", "play-card play-card-new", callbacks.onNewCharacter));
  }
  body.appendChild(cards);
  if (characters.length === 0) {
    body.appendChild(emptyState("No characters yet.", "New character", callbacks.onNewCharacter));
  }

  if (rerolled) {
    root.querySelector<HTMLElement>(".roster-reroll")?.focus();
  }
}
