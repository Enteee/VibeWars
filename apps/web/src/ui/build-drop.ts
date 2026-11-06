import { PROFESSIONS, getSkill } from "@vibewars/game-core";

import { SKILL_BAR_SLOTS, equippableSkills } from "../storage/build-validation.js";
import type { TeamCharacter } from "../storage/schema.js";

/**
 * The skill drop rules (#2565), one set for the Character Builder and the
 * Team Builder: where an equip goes, what a drag onto a bar slot does, and
 * why a drop is refused. Pure, and loaded in Node too, through
 * `team-builder.ts` (e2e): nothing here draws.
 *
 * A drop lands on one of `bars`, the bars a drag can reach: the Character
 * Builder's one, or every member's of a team.
 */

/** One slot of one of the bars, the bar by its place among them. */
export interface BarSlot {
  readonly member: number;
  readonly slot: number;
}

/** Where a skill drag started: a library entry, or a bar slot. */
export type SkillDrag =
  | { readonly from: "library"; readonly skillId: string }
  | { readonly from: "slot"; readonly member: number; readonly slot: number };

/** Serialised onto the drag event; parsed back on drop. */
export function encodeSkillDrag(drag: SkillDrag): string {
  return drag.from === "library"
    ? `library:${drag.skillId}`
    : `slot:${String(drag.member)}:${String(drag.slot)}`;
}

/** A whole number from `raw` in `[0, below)`, or `undefined`. */
function index(raw: string | undefined, below: number): number | undefined {
  // `raw !== ""` matters: `Number("")` is 0, so a bare "slot:" would
  // otherwise decode as a valid drag from slot 0.
  if (raw === undefined || raw === "") {
    return undefined;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value < below ? value : undefined;
}

/**
 * Parse a drag payload.
 *
 * Returns `undefined` for anything unrecognised: a drop can carry text
 * dragged from anywhere on the desktop, and that must do nothing rather
 * than throw or equip something nonsensical.
 */
export function decodeSkillDrag(raw: string): SkillDrag | undefined {
  const [kind, first, second, ...rest] = raw.split(":");
  if (kind === "library" && first !== undefined && first !== "" && second === undefined) {
    return { from: "library", skillId: first };
  }
  const member = index(first, Number.MAX_SAFE_INTEGER);
  const slot = index(second, SKILL_BAR_SLOTS);
  if (kind === "slot" && member !== undefined && slot !== undefined && rest.length === 0) {
    return { from: "slot", member, slot };
  }
  return undefined;
}

/**
 * Where an equip from the library goes (#564): the picked slot, whatever
 * is in it, else the first empty one. A full bar with none picked has no
 * place for it: the player picks the slot to give up, nothing is
 * overwritten silently.
 */
export function equipTarget(
  skillBar: readonly (string | null)[],
  selected: number | undefined,
): { readonly slot: number; readonly replaces: boolean } | undefined {
  if (selected !== undefined) {
    return { slot: selected, replaces: (skillBar[selected] ?? null) !== null };
  }
  const empty = skillBar.indexOf(null);
  return empty === -1 ? undefined : { slot: empty, replaces: false };
}

/**
 * The slot of the elite that `skillId` going into `slot` would displace from
 * the bar (#459), or -1. Only one elite per bar, and the new one wins:
 * the one already in `slot` is simply replaced, and an elite moving
 * between slots displaces nothing.
 */
export function displacedEliteSlot(
  skillBar: readonly (string | null)[],
  slot: number,
  skillId: string | null,
): number {
  if (skillId === null || getSkill(skillId)?.elite !== true) {
    return -1;
  }
  return skillBar.findIndex(
    (id, at) => at !== slot && id !== null && id !== skillId && getSkill(id)?.elite === true,
  );
}

/** A bar after an equip, and the elite it let go, if any (#459). */
export interface BarChange {
  readonly skillBar: readonly (string | null)[];
  readonly displaced: string | undefined;
}

/**
 * `skillBar` with `skillId` in `slot`, or `slot` emptied for `null`.
 * Equipping a skill already on the bar moves it rather than duplicating
 * it, which is what a player dragging a skill onto a new slot means; an
 * elite takes the place of the bar's other elite.
 */
export function equipOnBar(
  skillBar: readonly (string | null)[],
  slot: number,
  skillId: string | null,
): BarChange {
  const next = [...skillBar];
  if (skillId !== null) {
    const existing = next.indexOf(skillId);
    if (existing >= 0) {
      next[existing] = null;
    }
  }
  const displacedSlot = displacedEliteSlot(skillBar, slot, skillId);
  const displaced = skillBar[displacedSlot] ?? undefined;
  if (displaced !== undefined) {
    next[displacedSlot] = null;
  }
  next[slot] = skillId;
  return { skillBar: next, displaced };
}

/** What to tell the player when `skillId` took the elite `displaced`'s place (#459). */
export function eliteNotice(skillId: string, displaced: string | undefined): string | undefined {
  if (displaced === undefined) {
    return undefined;
  }
  const name = (id: string): string => getSkill(id)?.name ?? id;
  return `${name(skillId)} replaced ${name(displaced)}: only one elite skill per bar.`;
}

/** `member`'s professions as a player reads them: "Monk", "Warrior / Monk". */
function professionsOf(member: TeamCharacter): string {
  const { primaryProfession: primary, secondaryProfession: secondary } = member;
  return secondary === undefined
    ? PROFESSIONS[primary].name
    : `${PROFESSIONS[primary].name} / ${PROFESSIONS[secondary].name}`;
}

/**
 * Why `skillId` may not be equipped on `member`'s bar from the library
 * (#2225), or `undefined` when it may: not a skill, or one of another
 * profession. One already on the bar moves, and another elite takes the
 * old one's place: neither is a refusal.
 */
export function equipRefusal(member: TeamCharacter, skillId: string): string | undefined {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    return "Not a skill in the game";
  }
  if (!equippableSkills(member).some((each) => each.id === skillId)) {
    return `${professionsOf(member)} can't use ${skill.name}`;
  }
  return undefined;
}

/**
 * Why `skillId` may not go into `slot` of `member`'s bar from another
 * member's (#2227), or `undefined` when it may: by `equipRefusal`, the
 * skill already in `slot` counting as gone. Unlike a library drop, a copy
 * already on the bar or another elite elsewhere on it refuses it rather
 * than giving way.
 */
export function slotRefusal(
  member: TeamCharacter,
  slot: number,
  skillId: string,
): string | undefined {
  const refusal = equipRefusal(member, skillId);
  if (refusal !== undefined) {
    return refusal;
  }
  const skill = getSkill(skillId);
  const others = member.skillBar.filter((id, at): id is string => at !== slot && id !== null);
  if (skill === undefined || others.includes(skillId)) {
    return `${skill?.name ?? skillId} is already on ${member.name}'s bar`;
  }
  const elite = skill.elite ? others.find((id) => getSkill(id)?.elite === true) : undefined;
  if (elite !== undefined) {
    return `${member.name} already has an elite, ${getSkill(elite)?.name ?? elite}`;
  }
  return undefined;
}

/** A drop's outcome: the bars after it, and what to tell the player; or why it was refused. */
export type SkillDrop<C extends TeamCharacter> =
  | { readonly bars: readonly C[]; readonly notice: string | undefined }
  | { readonly refused: string };

/**
 * `bars` after `drag` is dropped on `to` (#2225, #2227). From the library,
 * an equip by `equipOnBar`. From a slot of the same bar, the two slots
 * trade places. From another member's bar, the skill moves there, trading
 * places with what it lands on, or with `copy` (the player held Shift) is
 * copied there, the source keeping it. Every bar it changes must stay
 * legal, else the reason, and nothing changes.
 */
export function dropSkill<C extends TeamCharacter>(
  bars: readonly C[],
  drag: SkillDrag,
  to: BarSlot,
  copy: boolean,
): SkillDrop<C> {
  const target = bars[to.member];
  if (target === undefined) {
    return { refused: "Nothing to drop on" };
  }
  const withBar = (member: C, skillBar: readonly (string | null)[]): C => ({
    ...member,
    skillBar,
  });
  const next = [...bars];
  if (drag.from === "library") {
    const refusal = equipRefusal(target, drag.skillId);
    if (refusal !== undefined) {
      return { refused: refusal };
    }
    const change = equipOnBar(target.skillBar, to.slot, drag.skillId);
    next[to.member] = withBar(target, change.skillBar);
    return { bars: next, notice: eliteNotice(drag.skillId, change.displaced) };
  }
  const source = bars[drag.member];
  const skillId = source?.skillBar[drag.slot] ?? null;
  if (source === undefined || skillId === null) {
    return { refused: "Nothing to drag" };
  }
  if (drag.member === to.member) {
    if (drag.slot === to.slot) {
      return { bars, notice: undefined };
    }
    // A bar cannot hold a skill twice, so Shift onto its own bar moves.
    const skillBar = [...source.skillBar];
    skillBar[drag.slot] = skillBar[to.slot] ?? null;
    skillBar[to.slot] = skillId;
    next[to.member] = withBar(source, skillBar);
    return { bars: next, notice: undefined };
  }
  const intoTarget = slotRefusal(target, to.slot, skillId);
  if (intoTarget !== undefined) {
    return { refused: intoTarget };
  }
  const displaced = target.skillBar[to.slot] ?? null;
  if (!copy && displaced !== null) {
    const intoSource = slotRefusal(source, drag.slot, displaced);
    if (intoSource !== undefined) {
      return { refused: intoSource };
    }
  }
  const targetBar = [...target.skillBar];
  targetBar[to.slot] = skillId;
  next[to.member] = withBar(target, targetBar);
  if (!copy) {
    const sourceBar = [...source.skillBar];
    sourceBar[drag.slot] = displaced;
    next[drag.member] = withBar(source, sourceBar);
  }
  return { bars: next, notice: undefined };
}
