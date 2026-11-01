import {
  getSkill,
  isOffhandId,
  isProfessionId,
  isWeaponId,
  type ProfessionId,
} from "@vibewars/game-core";
import type { WireProposalBuild } from "@vibewars/game-protocol";

import type { CapeLook } from "../render/cape-shape.js";
import type { TeamCharacter } from "../storage/schema.js";
import {
  characterAppearance,
  createCharacterFigure,
  type CharacterAppearance,
} from "./character-figure.js";
import { miniSkillBar, professionLabel } from "./character-preview.js";
import { h, playCard } from "./kit.js";

/**
 * The one character card (#1864): everywhere a character is shown, a
 * roster card, a Team Build's member, a lobby proposal's, it is this
 * figure holding its weapons, with its skills, so they always look the
 * same.
 */

/** What a character card draws: who, what they hold, their bar and cape. */
export interface FigureLook {
  readonly primary: ProfessionId;
  readonly secondary: ProfessionId | undefined;
  /** Both `undefined`: the bare body, for a build whose weapons are not known here. */
  readonly appearance: CharacterAppearance;
  readonly skillBar: TeamCharacter["skillBar"];
  readonly cape: CapeLook | undefined;
}

/** A stored character's look: an invalid build is the bare body (#1250). */
export function lookOfCharacter(character: TeamCharacter, cape: CapeLook | undefined): FigureLook {
  return {
    primary: character.primaryProfession,
    secondary: character.secondaryProfession,
    appearance: characterAppearance(character),
    skillBar: character.skillBar,
    cape,
  };
}

/**
 * A lobby member's look from the wire (#1811): what the host sent it
 * holding, no cape, as other players' are not on the wire. No build yet,
 * or a house seat, is the bare body with an empty bar; a weapon or skill
 * this client does not know is none, an empty slot. `undefined`: a
 * profession this client does not know, which has no figure.
 */
export function lookOfWire(
  member: { readonly primary: string; readonly secondary: string | null },
  build: WireProposalBuild | undefined,
): FigureLook | undefined {
  if (!isProfessionId(member.primary)) {
    return undefined;
  }
  const mainHand = build?.mainHand ?? null;
  const offHand = build?.offHand ?? null;
  const weaponId = mainHand !== null && isWeaponId(mainHand) ? mainHand : undefined;
  return {
    primary: member.primary,
    secondary:
      member.secondary !== null && isProfessionId(member.secondary) ? member.secondary : undefined,
    // An off-hand without the hand that holds it is no build the host sends.
    appearance: {
      weaponId,
      offhandId:
        weaponId !== undefined && offHand !== null && isOffhandId(offHand) ? offHand : undefined,
    },
    skillBar: (build?.skills ?? []).map((id) =>
      id !== null && getSkill(id) !== undefined ? id : null,
    ),
    cape: undefined,
  };
}

/**
 * How big a character card is. `"card"`: the roster's, the figure at
 * `FIGURE_SIZE` over its line and bar. `"row"`: a team's member, one
 * line, a smaller figure, then the bar.
 */
export type CharacterCardSize = "card" | "row";

/** A row's figure, a share of `FIGURE_SIZE`: small enough for a line, big enough that the weapon reads. */
const ROW_FIGURE_SCALE = 0.75;

export interface CharacterFigureCardOptions {
  readonly size: CharacterCardSize;
  /** A card's line under the figure; the professions when omitted. A row has none. */
  readonly line?: string;
  /** A row's title and label, as "Ser Bash, Warrior"; the card never draws a name. */
  readonly label?: string;
}

/** `look` as a card or a row; it draws no name, which a caller puts outside. */
export function characterFigureCard(
  look: FigureLook,
  options: CharacterFigureCardOptions,
): HTMLElement {
  const professions = professionLabel(look.primary, look.secondary);
  if (options.size === "card") {
    const card = h("span", "character-card-body");
    card.appendChild(createCharacterFigure(look));
    card.appendChild(h("span", "play-card-line", options.line ?? professions));
    card.appendChild(miniSkillBar(look));
    return card;
  }
  const row = h("span", "character-card-row");
  const label = options.label ?? professions;
  row.title = label;
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", label);
  row.appendChild(createCharacterFigure(look, ROW_FIGURE_SCALE));
  row.appendChild(miniSkillBar(look));
  return row;
}

/** A profession this client does not know (#1811): its "?" alone, in a row's place. */
function unknownMember(label: string): HTMLElement {
  const dot = h("span", "character-dot is-house", "?");
  dot.title = label;
  return dot;
}

/** One member of a team card: its look, `undefined` for an unknown profession. */
export interface TeamFigureMember {
  readonly look: FigureLook | undefined;
  /** Its title and label only, as "Ser Bash, Warrior". */
  readonly label: string;
}

export interface TeamFigureCardOptions {
  /** The team's name, or its proposer and crown in the lobby. */
  readonly title: HTMLElement | string;
  /** A row each, in order. */
  readonly members: readonly TeamFigureMember[];
  /** Under the members: the lobby's voter tokens and count, "Your vote ✓". */
  readonly footer?: readonly HTMLElement[];
  /** After the title: the random starter team's Random (#2036). */
  readonly tags?: readonly HTMLElement[];
  /** In its corner: Team Play's Edit. */
  readonly actions?: readonly HTMLElement[];
  readonly onOpen?: () => void;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  /** The press's name: "Ann's team build". */
  readonly label?: string;
}

/**
 * The one Team card (#1864): a Team Build with its characters, a row
 * each, on Team Play, in the Team Lobby and wherever a team is picked.
 */
export function teamFigureCard({
  title,
  members: shown,
  footer = [],
  ...card
}: TeamFigureCardOptions): HTMLElement {
  const members = h("span", "play-card-members");
  for (const { look, label } of shown) {
    const member =
      look === undefined ? unknownMember(label) : characterFigureCard(look, { size: "row", label });
    member.className += " play-card-member";
    members.appendChild(member);
  }
  return playCard({ name: title, content: [members, ...footer], ...card });
}
