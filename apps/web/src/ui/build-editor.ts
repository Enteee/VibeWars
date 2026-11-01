import {
  describePrimaryAttribute,
  describeSkill,
  MAX_ATTRIBUTE_RANK,
  MINIMAL_GW_INSPIRED_PVP_V1,
  PROFESSIONS,
  skillProfessionName,
  accessibleAttributeIds,
  ALL_OFFHANDS,
  ALL_WEAPONS,
  ARMOR_SLOTS,
  WEAPON_SETS,
  allowsOffhand,
  cumulativeCostForRank,
  defaultBuildEquipment,
  defaultEquipmentFor,
  getAttribute,
  getOffhand,
  getSkill,
  getWeapon,
  getWeaponMod,
  IMPLEMENTED_SKILLS,
  neededWeaponText,
  reconcileEquipment,
  runeDisplayName,
  totalCost,
  weaponReachable,
  wieldsFor,
  type BuildEquipment,
  type ItemUpgrades,
  type ModSlot,
  type OffhandId,
  type ProfessionId,
  type Skill,
  type SkillDescription,
  type SkillType,
  type WeaponId,
  type WeaponSet,
  type WeaponSetIndex,
} from "@vibewars/game-core";
import type { CorpusSkill } from "@vibewars/game-data/corpus";

import { loadLayoutLabeller, type KeyLabeller } from "../input/key-labels.js";
import {
  SKILL_ACTIONS,
  actionForCode,
  actionLabel,
  codeLabel,
  isShortcut,
} from "../input/keymap.js";
import { loadKeymap } from "../input/keymap-preference.js";
import { NoWebGlError } from "../render/arena-viewport.js";
import {
  exportBuild,
  importBuild,
  looksLikeBuild,
  type ImportResult,
} from "../storage/build-transfer.js";
import { SKILL_BAR_SLOTS, equippableSkills, validateBuild } from "../storage/build-validation.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import {
  decodeTemplate,
  encodeTemplate,
  looksLikeTemplate,
  missingSkillsNote,
} from "../storage/gw1-template.js";
import { looksLikeTeam } from "../storage/team-transfer.js";
import { noWebGlNotice } from "./arena-notice.js";
import { characterRanks } from "./character-ranks.js";
import {
  canEquipOffhand,
  clearWeaponSet,
  clearArmorUpgrades,
  applyGearDrop,
  decodeGearDrag,
  droppedModNotes,
  encodeGearDrag,
  headgearChoices,
  modChoices,
  modSlotsOf,
  offhandAttributeChoices,
  setHeadgearAttribute,
  setOffhand,
  setRequirementAttribute,
  setUpgrade,
  setWeapon,
  summariseGear,
  weaponAttributeChoices,
  type GearDragSource,
  type GearDropTarget,
} from "./gear-editor.js";
import {
  gearIconImg,
  offhandIcon,
  professionIcon,
  SKILL_TYPE_NAME,
  skillIconHtml,
  skillTypeBadgeHtml,
  weaponIcon,
  type GearIcon,
} from "./icons.js";
import { loadShowCorpus, saveShowCorpus } from "./corpus-preference.js";
import {
  corpusByAccess,
  corpusCostText,
  filterCorpus,
  filterEliteSkills,
  filterSkillsByText,
  filterSkillsByType,
  groupSkillsByAttribute,
  lockedSkills,
  missingFromCatalog,
  skillTypesOf,
} from "./skill-library.js";
import {
  appendParts,
  createSkillTooltip,
  renderSkillDescription,
  type SkillTooltip,
} from "./skill-tooltip.js";
import {
  button,
  h,
  inlineConfirm,
  listenForPaste,
  loadLine,
  moreMenu,
  problemsChip,
  screenBar,
  shareLine,
  syncList,
  TAKES_TYPING,
  toast,
  type ChipProblem,
  type InlineConfirm,
} from "./kit.js";
import { mountPaperDoll, type PaperDoll } from "./paper-doll.js";
import { createTrainingPanel, type TrainingPanel } from "./training-panel.js";

/**
 * The character/build editor (brief §17).
 *
 * Plain DOM, mounted once; each region updates in place (ADR-0030).
 */

export interface BuildEditorCallbacks {
  /** Store it; the editor then says so and leaves through `onClose` (#1902). */
  readonly onSave: (character: StoredCharacter) => Promise<void>;
  readonly onDelete: (id: string) => void;
  readonly onDuplicate: (character: StoredCharacter) => void;
  readonly onClose: () => void;
}

export function newCharacter(id: string): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id,
    name: "New Character",
    primaryProfession: "warrior",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: SKILL_BAR_SLOTS }, () => null),
    equipment: defaultBuildEquipment("warrior"),
    updatedAt: Date.now(),
  };
}

/** Attribute points left to spend, given the ruleset's budget. */
export function remainingPoints(character: StoredCharacter): number {
  const spent = totalCost(
    character.attributes.map((a) => ({ attributeId: a.attributeId, rank: a.rank })),
  );
  return MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget - spent;
}

/**
 * Whether one more rank in `attributeId` is affordable.
 *
 * Exposed (and tested) separately from the DOM so the "can I raise this?"
 * rule is verifiable without a browser — the same reason the renderer's
 * pure helpers live apart from the Phaser scene.
 */
export function canRaise(character: StoredCharacter, attributeId: string): boolean {
  const current = character.attributes.find((a) => a.attributeId === attributeId)?.rank ?? 0;
  if (current >= MAX_ATTRIBUTE_RANK) {
    return false;
  }
  const delta = cumulativeCostForRank(current + 1) - cumulativeCostForRank(current);
  return remainingPoints(character) >= delta;
}

export function setRank(
  character: StoredCharacter,
  attributeId: string,
  rank: number,
): StoredCharacter {
  const others = character.attributes.filter((a) => a.attributeId !== attributeId);
  const attributes = rank > 0 ? [...others, { attributeId, rank }] : others;
  return { ...character, attributes, updatedAt: Date.now() };
}

/** Points the next rank of `attributeId` costs, or `undefined` at the cap. */
export function nextRankCost(character: StoredCharacter, attributeId: string): number | undefined {
  const rank = rankOf(character, attributeId);
  return rank >= MAX_ATTRIBUTE_RANK
    ? undefined
    : cumulativeCostForRank(rank + 1) - cumulativeCostForRank(rank);
}

/**
 * The rank clicking pip `pip` (1 to 12) asks for: that rank, except the
 * current top pip, which lowers by one so a rank can go back to zero.
 */
export function pipTarget(character: StoredCharacter, attributeId: string, pip: number): number {
  return pip === rankOf(character, attributeId) ? pip - 1 : pip;
}

/**
 * What moving `attributeId` to `rank` would cost (negative: refund) and
 * the points it would leave, which are below zero when it is unaffordable.
 */
export function rankChange(
  character: StoredCharacter,
  attributeId: string,
  rank: number,
): { readonly cost: number; readonly left: number } {
  const cost = cumulativeCostForRank(rank) - cumulativeCostForRank(rankOf(character, attributeId));
  return { cost, left: remainingPoints(character) - cost };
}

/**
 * Move `attributeId` to `rank`, or refuse with the points it is short by.
 * Lowering is always allowed, past a weapon requirement too: the gear and
 * the problems say what that breaks.
 */
export function trySetRank(
  character: StoredCharacter,
  attributeId: string,
  rank: number,
): { readonly character: StoredCharacter } | { readonly needs: number } {
  const clamped = Math.max(0, Math.min(MAX_ATTRIBUTE_RANK, rank));
  const { left } = rankChange(character, attributeId, clamped);
  if (left < 0 && clamped > rankOf(character, attributeId)) {
    return { needs: -left };
  }
  return { character: setRank(character, attributeId, clamped) };
}

/** One budget bar segment: the points one attribute's ranks cost. */
export interface BudgetSegment {
  readonly attributeId: string;
  readonly points: number;
}

/** The spent budget split by attribute, in the order the rows are listed. */
export function budgetSegments(character: StoredCharacter): BudgetSegment[] {
  return accessibleAttributeIds(character.primaryProfession, character.secondaryProfession)
    .map((attributeId) => ({ attributeId, rank: rankOf(character, attributeId) }))
    .filter((a) => a.rank > 0)
    .map((a) => ({ attributeId: a.attributeId, points: cumulativeCostForRank(a.rank) }));
}

/**
 * Change profession, dropping anything the new combination can no longer
 * access.
 *
 * Silently keeping now-inaccessible attribute ranks or skills would mean
 * saving a build that fails validation on load — better to drop them at
 * the moment of the change, when the player can see it happen.
 */
export function setProfessions(
  character: StoredCharacter,
  primary: ProfessionId,
  secondary: ProfessionId | undefined,
): StoredCharacter {
  const effectiveSecondary = secondary === primary ? undefined : secondary;
  const accessible = new Set(accessibleAttributeIds(primary, effectiveSecondary));

  const next: StoredCharacter = {
    ...character,
    primaryProfession: primary,
    secondaryProfession: effectiveSecondary,
    attributes: character.attributes.filter((a) => accessible.has(a.attributeId)),
    updatedAt: Date.now(),
  };

  const stillEquippable = new Set(equippableSkills(next).map((s) => s.id));
  return {
    ...next,
    skillBar: next.skillBar.map((id) => (id !== null && stillEquippable.has(id) ? id : null)),
    // Gear follows the same drop-what-is-no-longer-reachable rule as
    // attributes and skills, and a weapon nothing can govern any more
    // becomes the new primary's default (#614).
    equipment: fitWeapon(
      reconcileEquipment(next.equipment, {
        primaryProfession: primary,
        secondaryProfession: effectiveSecondary,
        accessibleAttributeIds: accessible,
      }),
      primary,
      accessible,
    ),
  };
}

/** One cell of a profession picker's grid (#568). */
export interface ProfessionChoice {
  /** `undefined` is the secondary's "(none)". */
  readonly id: ProfessionId | undefined;
  readonly name: string;
  /** The attributes it brings, by name; a primary's own attribute starred. */
  readonly attributes: readonly string[];
  /** How many of the bar's skills stay if it is picked, of how many there are. */
  readonly keeps: number;
  readonly of: number;
  readonly current: boolean;
}

const filled = (bar: StoredCharacter["skillBar"]): number => bar.filter((id) => id !== null).length;

/**
 * The cells of the `which` profession picker (#568): every profession
 * but the other picker's (the same twice is not offered), the
 * secondary's "(none)" first, each with what it brings and what it keeps.
 * "Keeps" runs `setProfessions` on a copy and counts the bar: one rule
 * for what a change drops, not two.
 */
export function professionChoices(
  character: StoredCharacter,
  which: "primary" | "secondary",
): ProfessionChoice[] {
  const of = filled(character.skillBar);
  const choice = (id: ProfessionId | undefined): ProfessionChoice => {
    const next =
      which === "primary"
        ? id === undefined
          ? character
          : setProfessions(character, id, character.secondaryProfession)
        : setProfessions(character, character.primaryProfession, id);
    const attributes =
      id === undefined
        ? []
        : PROFESSIONS[id].attributes
            // A secondary brings everything but its primary attribute.
            .filter((attribute) => which === "primary" || !attribute.isPrimary)
            .map((attribute) => `${attribute.name}${attribute.isPrimary ? " ★" : ""}`);
    return {
      id,
      name: id === undefined ? "(none)" : PROFESSIONS[id].name,
      attributes,
      keeps: filled(next.skillBar),
      of,
      current:
        (which === "primary" ? character.primaryProfession : character.secondaryProfession) === id,
    };
  };
  const other = which === "primary" ? character.secondaryProfession : character.primaryProfession;
  const ids = (Object.keys(PROFESSIONS) as ProfessionId[]).filter((id) => id !== other);
  return [...(which === "secondary" ? [choice(undefined)] : []), ...ids.map(choice)];
}

/**
 * What a profession change from `before` to `after` dropped (#569), one
 * line each, in the order the editor shows them: attribute ranks with
 * the points they give back, skills taken off the bar, then gear that
 * was swapped or removed. Empty when nothing was dropped.
 */
export function describeProfessionChange(
  before: StoredCharacter,
  after: StoredCharacter,
): string[] {
  const ranks = before.attributes
    .filter((a) => a.rank > rankOf(after, a.attributeId))
    .map((a) => {
      const name = getAttribute(a.attributeId)?.name ?? a.attributeId;
      const back =
        cumulativeCostForRank(a.rank) - cumulativeCostForRank(rankOf(after, a.attributeId));
      return `${name} ${String(a.rank)} (${String(back)} points back)`;
    });
  const skills = before.skillBar
    .filter((id, slot): id is string => id !== null && after.skillBar[slot] !== id)
    .map((id) => `${getSkill(id)?.name ?? id} from the bar`);

  const was = before.equipment.weaponSets[0];
  const now = after.equipment.weaponSets[0];
  const gear: string[] = [];
  const weaponName = (id: string): string => getWeapon(id)?.name ?? id;
  if (was.mainHand.weaponId !== now.mainHand.weaponId) {
    gear.push(`${weaponName(was.mainHand.weaponId)} → ${weaponName(now.mainHand.weaponId)}`);
  }
  if (was.offHand !== null && was.offHand.offhandId !== now.offHand?.offhandId) {
    const name = (id: string): string => getOffhand(id)?.name ?? id;
    gear.push(
      now.offHand === null
        ? name(was.offHand.offhandId)
        : `${name(was.offHand.offhandId)} → ${name(now.offHand.offhandId)}`,
    );
  }
  // Sets 2-4 are emptied, not swapped (#489).
  before.equipment.weaponSets.forEach((set, index) => {
    if (index > 0 && set !== null && after.equipment.weaponSets[index] === null) {
      gear.push(`Set ${String(index + 1)}: ${weaponName(set.mainHand.weaponId)} removed`);
    }
  });
  for (const slot of ARMOR_SLOTS) {
    const rune = before.equipment.armor[slot].rune;
    if (rune !== null && after.equipment.armor[slot].rune === null) {
      gear.push(runeDisplayName(rune));
    }
  }
  // Moved, not removed, when it left both professions (#1140).
  const headWas = before.equipment.armor.head.headgearAttributeId;
  const headNow = after.equipment.armor.head.headgearAttributeId;
  if (headWas !== null && headNow !== null && headWas !== headNow) {
    const name = (id: string): string => getAttribute(id)?.name ?? id;
    gear.push(`Headgear: ${name(headWas)} → ${name(headNow)}`);
  }
  return [...ranks, ...skills, ...gear];
}

/**
 * `equipment` with its weapon swapped for `primary`'s default when no
 * attribute in `accessible` can govern it (#614): a Warrior's Sword on
 * an Assassin becomes Daggers, so Dagger Mastery works at once. A weapon
 * still reachable stays, because it is a choice. The off hand stays if
 * the new weapon leaves a hand free and it survived reconciling, and is
 * the default's otherwise. Sets 2-4 have no default: one whose weapon
 * nothing can govern is emptied (#489).
 */
function fitWeapon(
  equipment: BuildEquipment,
  primary: ProfessionId,
  accessible: ReadonlySet<string>,
): BuildEquipment {
  const reachable = (set: WeaponSet): boolean => {
    const weapon = getWeapon(set.mainHand.weaponId);
    return weapon === undefined || weaponReachable(weapon.requirement, accessible);
  };
  // Sets 2-4 may be empty, so one whose weapon nothing governs empties (#489).
  const fit = (set: WeaponSet | null): WeaponSet | null =>
    set !== null && reachable(set) ? set : null;
  const [set1, two, three, four] = equipment.weaponSets;
  const [set2, set3, set4] = [fit(two), fit(three), fit(four)];
  if (reachable(set1)) {
    return { ...equipment, weaponSets: [set1, set2, set3, set4] };
  }
  const [fallback] = defaultEquipmentFor(primary).weaponSets;
  const fallbackWeapon = getWeapon(fallback.mainHand.weaponId);
  const keepOffhand =
    set1.offHand !== null && fallbackWeapon !== undefined && allowsOffhand(fallbackWeapon);
  return {
    ...equipment,
    weaponSets: [
      { mainHand: fallback.mainHand, offHand: keepOffhand ? set1.offHand : fallback.offHand },
      set2,
      set3,
      set4,
    ],
  };
}

/** Every carried set's main hand, set 1 first (#489). */
function carriedWeapons(character: StoredCharacter): readonly WeaponId[] {
  return character.equipment.weaponSets.flatMap((set) =>
    set === null ? [] : [set.mainHand.weaponId],
  );
}

/**
 * Why an attack skill on the bar will not work with any of `weaponIds`,
 * set 1 first (#417, #489): "Needs an axe" on its slot, "Needs an axe —
 * your weapon is a sword" when hovered, naming set 1's. `undefined` when
 * some set wields it, or for a skill that is no attack. The bar still
 * saves: GW1 lets you carry one for a weapon you swap to.
 */
export function weaponWarning(
  skill: Skill,
  weaponIds: readonly WeaponId[],
): { readonly badge: string; readonly title: string } | undefined {
  const needed = skill.attack?.weapon;
  if (needed === undefined || weaponIds.some((id) => wieldsFor(id, needed))) {
    return undefined;
  }
  const [first] = weaponIds;
  const held = first === undefined ? undefined : getWeapon(first);
  const yours =
    held === undefined || held.id === "unarmed"
      ? "you have no weapon"
      : `your weapon is ${withArticle(held.name.toLowerCase())}`;
  const badge = `Needs ${neededWeaponText(needed)}`;
  return { badge, title: `${badge} — ${yours}` };
}

/** "a sword", "an axe", "daggers". */
function withArticle(name: string): string {
  if (name.endsWith("s")) {
    return name;
  }
  return /^[aeiou]/.test(name) ? `an ${name}` : `a ${name}`;
}

/**
 * The slot of the elite that equipping `skillId` into `slot` pushes off
 * the bar (#459), or -1. Only one elite per bar, and the new one wins:
 * the one already in `slot` is simply replaced, and an elite moving
 * between slots displaces nothing.
 */
export function displacedEliteSlot(
  character: StoredCharacter,
  slot: number,
  skillId: string | null,
): number {
  if (skillId === null || getSkill(skillId)?.elite !== true) {
    return -1;
  }
  return character.skillBar.findIndex(
    (id, index) => index !== slot && id !== null && id !== skillId && getSkill(id)?.elite === true,
  );
}

export function setSkill(
  character: StoredCharacter,
  slot: number,
  skillId: string | null,
): StoredCharacter {
  const skillBar = [...character.skillBar];
  // Equipping a skill already on the bar moves it rather than duplicating
  // it, which is what a player dragging a skill onto a new slot means.
  if (skillId !== null) {
    const existing = skillBar.indexOf(skillId);
    if (existing >= 0) {
      skillBar[existing] = null;
    }
  }
  const displaced = displacedEliteSlot(character, slot, skillId);
  if (displaced >= 0) {
    skillBar[displaced] = null;
  }
  skillBar[slot] = skillId;
  return { ...character, skillBar, updatedAt: Date.now() };
}

/** A change to the bar, and what to tell the player about it, if anything (#459). */
export interface SkillChange {
  readonly character: StoredCharacter;
  readonly notice: string | undefined;
}

/**
 * `setSkill`, with what to tell the player when an elite took another
 * elite's place (#459); `undefined` when nothing needs saying.
 */
export function equipSkill(character: StoredCharacter, slot: number, skillId: string): SkillChange {
  const displaced = character.skillBar[displacedEliteSlot(character, slot, skillId)];
  const next = setSkill(character, slot, skillId);
  if (displaced === undefined || displaced === null) {
    return { character: next, notice: undefined };
  }
  const name = (id: string): string => getSkill(id)?.name ?? id;
  return {
    character: next,
    notice: `${name(skillId)} replaced ${name(displaced)}: only one elite skill per bar.`,
  };
}

/**
 * Exchange two bar slots.
 *
 * Distinct from `setSkill`, which *moves* a skill and clears wherever it
 * came from — correct when equipping from the library, but it would
 * silently delete a skill when a player drags one slot onto another to
 * reorder their bar.
 */
export function swapSkillSlots(character: StoredCharacter, a: number, b: number): StoredCharacter {
  if (a === b) {
    return character;
  }
  const skillBar = [...character.skillBar];
  const first = skillBar[a] ?? null;
  const second = skillBar[b] ?? null;
  skillBar[a] = second;
  skillBar[b] = first;
  return { ...character, skillBar, updatedAt: Date.now() };
}

/** Where a drag started: a library entry, or an existing bar slot. */
export type SkillDragSource =
  | { readonly from: "library"; readonly skillId: string }
  | { readonly from: "slot"; readonly slot: number };

/** Serialised onto the drag event; parsed back on drop. */
export function encodeDragSource(source: SkillDragSource): string {
  return source.from === "library" ? `library:${source.skillId}` : `slot:${String(source.slot)}`;
}

/**
 * Parse a drag payload.
 *
 * Returns `undefined` for anything unrecognised: a drop can carry text
 * dragged from anywhere on the desktop, and that must do nothing rather
 * than throw or equip something nonsensical.
 */
export function decodeDragSource(raw: string): SkillDragSource | undefined {
  const [kind, value] = raw.split(":");
  if (kind === "library" && value !== undefined && value !== "") {
    return { from: "library", skillId: value };
  }
  // `value !== ""` matters: `Number("")` is 0, so a bare "slot:" would
  // otherwise decode as a valid drag from slot 0.
  if (kind === "slot" && value !== undefined && value !== "") {
    const slot = Number(value);
    if (Number.isInteger(slot) && slot >= 0 && slot < SKILL_BAR_SLOTS) {
      return { from: "slot", slot };
    }
  }
  return undefined;
}

/** Apply a completed drag onto `targetSlot`, with `equipSkill`'s notice. */
export function applySkillDrop(
  character: StoredCharacter,
  source: SkillDragSource,
  targetSlot: number,
): SkillChange {
  return source.from === "library"
    ? equipSkill(character, targetSlot, source.skillId)
    : { character: swapSkillSlots(character, source.slot, targetSlot), notice: undefined };
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

/** `value` as JSON with its keys sorted, so two equal builds compare equal. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    typeof inner === "object" && inner !== null && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/**
 * Whether `current` differs from the character as it was opened (#566).
 * When it was last touched is no edit, and neither is the order the
 * attribute ranks were set in.
 */
export function isUnsaved(opened: StoredCharacter, current: StoredCharacter): boolean {
  const comparable = (character: StoredCharacter) => ({
    ...character,
    updatedAt: 0,
    attributes: [...character.attributes].sort((a, b) =>
      a.attributeId.localeCompare(b.attributeId),
    ),
  });
  return canonical(comparable(opened)) !== canonical(comparable(current));
}

/** The part of the editor a problem is about, which its line jumps to. */
export type ProblemCause =
  | { readonly kind: "name" }
  | { readonly kind: "professions" }
  | { readonly kind: "attributes" }
  | { readonly kind: "bar" }
  | { readonly kind: "slot"; readonly slot: number }
  | { readonly kind: "gear"; readonly field: string };

/** One line of the problems chip, before it knows the page (#566). */
export interface EditorProblem {
  readonly text: string;
  readonly blocking: boolean;
  readonly cause: ProblemCause;
}

/** A code read for the editor (#2004): the build it holds, or why not, in words. */
export type LoadedCode =
  | {
      readonly ok: true;
      readonly character: StoredCharacter;
      /** A GW1 code's skills this game lacks, which arrive as empty slots (#494). */
      readonly missingSkills: readonly number[];
    }
  | {
      readonly ok: false;
      readonly reason: "empty" | "team" | "not-a-code" | "invalid";
      readonly problems: readonly string[];
    };

/**
 * The build in `text` (#2004), for a paste on the editor and for Load GW1
 * code alike, as a character `id` saved at `now`: a VibeWars build line
 * (#572) or a GW1 template code (#494), trimmed. A team code holds builds
 * too, so it is told apart first (#577).
 */
export function loadCode(text: string, id: string, now: number): LoadedCode {
  const code = text.trim();
  if (code === "") {
    return { ok: false, reason: "empty", problems: ["Paste a code first."] };
  }
  if (looksLikeTeam(code)) {
    return {
      ok: false,
      reason: "team",
      problems: ["That is a team code. Load it on Team Builder."],
    };
  }
  let result: ImportResult;
  let missing: readonly number[] = [];
  if (looksLikeBuild(code)) {
    result = importBuild(code, id, now);
  } else if (looksLikeTemplate(code)) {
    const decoded = decodeTemplate(code, id, now);
    result = decoded;
    missing = decoded.ok ? decoded.missingSkills : [];
  } else {
    return { ok: false, reason: "not-a-code", problems: ["That is not a GW1 template code."] };
  }
  return result.ok
    ? { ok: true, character: result.character, missingSkills: missing }
    : { ok: false, reason: "invalid", problems: result.problems };
}

/** Put a loaded build in the editor, unsaved: the player sees what arrived and chooses to keep it. */
function loadInto(context: EditorContext, loaded: Extract<LoadedCode, { ok: true }>): void {
  context.commit(loaded.character);
  toast(`Imported ${loaded.character.name}${missingSkillsNote(loaded.missingSkills)}`);
}

/** A message as a sentence: capitalised, with a full stop. */
function sentence(message: string): string {
  const capitalised = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

/** A skill icon on a bar slot, and in a library row, px (#727, art-direction sizes). */
const SLOT_ICON_PX = 48;
const LIBRARY_ICON_PX = 24;

const SLOT_FIELD = /^skillBar\[(\d+)\]$/;
/** A gear problem in weapon set i (#489): `equipment.weaponSets[i]…`. */
const SET_FIELD = /^equipment\.weaponSets\[(\d)\]/;
/** Every weapon set, in tab order (#489). */
const WEAPON_SET_INDICES: readonly WeaponSetIndex[] = [0, 1, 2, 3];
const DUPLICATE = " appears more than once on the bar";

/**
 * What stops this build saving, as plain sentences that say where (#566):
 * `validateBuild`'s problems, with no `field:` prefix, then the hints
 * that never block, unspent points and empty slots.
 */
export function editorProblems(character: StoredCharacter): EditorProblem[] {
  const blocking = validateBuild(character).map((problem): EditorProblem => {
    const slotMatch = SLOT_FIELD.exec(problem.field);
    if (slotMatch !== null) {
      const slot = Number(slotMatch[1]);
      const duplicate = problem.message.endsWith(DUPLICATE)
        ? problem.message.slice(0, -DUPLICATE.length)
        : undefined;
      const text =
        duplicate === undefined
          ? `Slot ${String(slot + 1)}: ${sentence(problem.message)}`
          : `${getSkill(duplicate)?.name ?? duplicate} is on the bar more than once.`;
      return { text, blocking: true, cause: { kind: "slot", slot } };
    }
    if (problem.field.startsWith("equipment")) {
      return {
        text: sentence(problem.message),
        blocking: true,
        cause: { kind: "gear", field: problem.field },
      };
    }
    if (problem.field === "character" && problem.message === "name must not be empty") {
      return { text: "Give the character a name.", blocking: true, cause: { kind: "name" } };
    }
    if (problem.field === "character" && problem.message.startsWith("secondary profession")) {
      return { text: sentence(problem.message), blocking: true, cause: { kind: "professions" } };
    }
    if (problem.field === "character") {
      return { text: sentence(problem.message), blocking: true, cause: { kind: "attributes" } };
    }
    return { text: sentence(problem.message), blocking: true, cause: { kind: "bar" } };
  });

  const hints: EditorProblem[] = [];
  const unspent = remainingPoints(character);
  if (unspent > 0) {
    hints.push({
      text: `${String(unspent)} attribute point${unspent === 1 ? "" : "s"} unspent.`,
      blocking: false,
      cause: { kind: "attributes" },
    });
  }
  const empty = character.skillBar.filter((id) => id === null).length;
  if (empty > 0) {
    hints.push({
      text: `${String(empty)} empty skill slot${empty === 1 ? "" : "s"}.`,
      blocking: false,
      cause: { kind: "bar" },
    });
  }
  return [...blocking, ...hints];
}

/** The `data-cause` a problem's cause carries on the page. */
function causeKey(cause: ProblemCause): string {
  switch (cause.kind) {
    case "slot":
      return `slot-${String(cause.slot)}`;
    case "gear":
      return cause.field;
    default:
      return cause.kind;
  }
}

/** How long a jumped-to cause stays highlighted. */
const FLAG_MS = 1600;

/** Scroll to the element `cause` is about, highlight it a moment, and focus it if it takes focus. */
function showCause(scope: ParentNode, cause: ProblemCause): void {
  const key = causeKey(cause);
  // Another weapon set's problem: its tab is picked first, so its slot shows (#489).
  const set = SET_FIELD.exec(key);
  if (set !== null) {
    scope
      .querySelector<HTMLElement>(`[data-cause="equipment.weaponSets[${set[1] ?? ""}]"]`)
      ?.click();
  }
  // An armor piece's problem without a mark of its own falls back to the gear.
  const target =
    scope.querySelector<HTMLElement>(`[data-cause="${key}"]`) ??
    (cause.kind === "gear" ? scope.querySelector<HTMLElement>('[data-cause="equipment"]') : null);
  if (target === null) {
    return;
  }
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  target.classList.add("is-flagged");
  setTimeout(() => {
    target.classList.remove("is-flagged");
  }, FLAG_MS);
  if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
    target.focus({ preventScroll: true });
  }
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                   */
/* -------------------------------------------------------------------------- */

/** What every region of the editor shares. */
interface EditorContext {
  /** The character as it stands, the name typed so far included. */
  readonly current: () => StoredCharacter;
  /** Make `next` the character, and have every region show it. */
  readonly commit: (next: StoredCharacter) => void;
  /** `commit` new professions, toasting what they dropped with an Undo (#569). */
  readonly changeProfessions: (primary: ProfessionId, secondary: ProfessionId | undefined) => void;
  /** `commit` a change to the bar, showing its notice until the next change (#459). */
  readonly equip: (change: SkillChange) => void;
  /** What the last change has to tell the player. */
  readonly notice: () => string | undefined;
  /** One tooltip for the whole editor. */
  readonly tooltip: SkillTooltip;
  /**
   * Show the tooltip at `anchor`, with what `describe` says now; a change
   * to the character redraws it in place from `describe` again (#1932).
   */
  readonly showTip: (anchor: HTMLElement, describe: () => SkillDescription | undefined) => void;
  /** The bar slot picked for the next equip (#564), if any. */
  readonly selected: () => number | undefined;
  /** Pick a bar slot, or none; every region shows it. */
  readonly select: (slot: number | undefined) => void;
  /** The weapon set the gear panel shows and edits (#489); screen state, never stored. */
  readonly weaponSet: () => WeaponSetIndex;
  /** Show and edit another weapon set; every region shows it. */
  readonly selectWeaponSet: (set: WeaponSetIndex) => void;
  /** Open a library tab, scrolled to one of its groups if given (#570). */
  readonly showLibrary: (tab: LibraryTab, group?: string) => void;
  /** Equip `skillId` to `slot`, as `equip` does; the pick, used, is let go. */
  readonly equipTo: (skillId: string, slot: number) => void;
  /** A bar slot's key, from the player's keymap, as the arena's bar labels it. */
  readonly slotLabel: (slot: number) => string;
}

/** A part of the editor, built once, that shows whatever character it is given. */
interface Region {
  update(character: StoredCharacter): void;
}

export interface BuildEditorView {
  /** Leave for `then`, as Esc does: unsaved edits ask first (#1268). */
  leave(then: () => void): void;
  /** Tear down the tooltip and the Training Ground; call when leaving the editor. */
  dispose(): void;
}

/**
 * Mount the editor into `root`, once per open (ADR-0030). Every change
 * goes through one `commit`, which updates each region in place, so the
 * library keeps its scroll, the pressed control keeps focus, and a drag
 * or a hover survives a change made elsewhere. Reopening starts afresh:
 * the skills tab, an empty search.
 */
/** What the editor's tooltip shows a skill for: where, and how to describe it again. */
export interface TippedSkill {
  readonly anchor: Pick<HTMLElement, "isConnected">;
  readonly describe: () => SkillDescription | undefined;
}

/**
 * After a change to the character, an open tooltip follows it at its new
 * numbers (#1932), unless its anchor is gone or its slot emptied: then it
 * hides. What it shows afterwards, if anything.
 */
export function followTip(
  tooltip: Pick<SkillTooltip, "update" | "hide">,
  tipped: TippedSkill | undefined,
): TippedSkill | undefined {
  const described = tipped?.anchor.isConnected === true ? tipped.describe() : undefined;
  if (described === undefined) {
    tooltip.hide();
    return undefined;
  }
  tooltip.update(described);
  return tipped;
}

export function mountBuildEditor(
  root: HTMLElement,
  initial: StoredCharacter,
  callbacks: BuildEditorCallbacks,
): BuildEditorView {
  let character = initial;
  const tooltip = createSkillTooltip();
  const regions: Region[] = [];

  root.replaceChildren();
  const layout = h("div", "editor-layout");
  root.appendChild(layout);

  // The Training Ground arena (#2 §6), created once per editor: a Phaser
  // game must never be rebuilt on a `+` click, or it loses its WebGL
  // context and leaks.
  let training: TrainingPanel | undefined;
  try {
    training = createTrainingPanel();
  } catch (error) {
    console.warn("[web] training ground unavailable", error);
    // No WebGL: the arena's column says so (#655). Mounted once, so it
    // stays through every edit.
    if (error instanceof NoWebGlError) {
      layout.classList.add("has-training");
      const column = h("section", "training");
      column.appendChild(noWebGlNotice());
      layout.appendChild(column);
    }
  }

  const update = (): void => {
    for (const region of regions) {
      region.update(character);
    }
    training?.setBuild(character);
  };

  let notice: string | undefined;
  let selected: number | undefined;
  let weaponSet: WeaponSetIndex = 0;
  // Read once per open, as the arena's bar does; labels by code until the
  // browser says what the layout is.
  const keymap = loadKeymap();
  let keyLabel: KeyLabeller = codeLabel;
  let disposed = false;
  void loadLayoutLabeller().then((label) => {
    if (label !== undefined && !disposed) {
      keyLabel = label;
      update();
    }
  });

  // The Undo of the last profession change (#569): one step, and gone
  // with the next edit of any kind.
  let dismissUndo: (() => void) | undefined;
  const dropUndo = (): void => {
    dismissUndo?.();
    dismissUndo = undefined;
  };

  // What the tooltip last showed a description of, to redraw on a change.
  let tipped: TippedSkill | undefined;
  const commit = (next: StoredCharacter, said: string | undefined): void => {
    dropUndo();
    // Another profession is another bar to build: the pick goes.
    if (
      next.primaryProfession !== character.primaryProfession ||
      next.secondaryProfession !== character.secondaryProfession
    ) {
      selected = undefined;
    }
    character = next;
    notice = said;
    update();
    tipped = followTip(tooltip, tipped);
    training?.refocus();
  };

  const context: EditorContext = {
    current: () => character,
    commit: (next) => {
      commit(next, undefined);
    },
    changeProfessions: (primary, secondary) => {
      const before = character;
      const after = setProfessions(before, primary, secondary);
      commit(after, undefined);
      const removed = describeProfessionChange(before, after);
      if (removed.length > 0) {
        dismissUndo = toast(`Removed: ${removed.join(", ")}`, {
          undo: () => {
            commit(before, undefined);
          },
        });
      }
    },
    equip: (change) => {
      commit(change.character, change.notice);
    },
    notice: () => notice,
    tooltip,
    showTip: (anchor, describe) => {
      const described = describe();
      if (described !== undefined) {
        tipped = { anchor, describe };
        tooltip.show(anchor, described);
      }
    },
    selected: () => selected,
    select: (slot) => {
      selected = slot;
      update();
    },
    weaponSet: () => weaponSet,
    selectWeaponSet: (set) => {
      weaponSet = set;
      update();
    },
    showLibrary: (tab, group) => {
      library.show(tab, group);
    },
    equipTo: (skillId, slot) => {
      selected = undefined;
      const change = equipSkill(character, slot, skillId);
      commit(change.character, change.notice);
    },
    slotLabel: (slot) => {
      const action = SKILL_ACTIONS[slot];
      return action === undefined ? "" : actionLabel(keymap, action, keyLabel);
    },
  };

  const paperDoll = mountPaperDoll(context);
  // Spans every column, the Training Ground's included (#566).
  const bar = mountCommandBar(context, paperDoll, initial, callbacks, (name) => {
    // Typing changes nothing another region shows but the bar's own
    // marker: the arena hears about the new name directly.
    dropUndo();
    character = { ...character, name };
    training?.setDisplayName(name);
    bar.update(character);
  });
  if (training !== undefined) {
    layout.classList.add("has-training");
    training.attach(layout);
    training.setDisplayName(character.name);
  }

  const panel = h("div", "editor");
  layout.appendChild(panel);
  // Under the arena, or with none at the top of the middle column (#571).
  const stats = mountStats();
  (training?.statsSlot ?? panel).appendChild(stats.element);
  const library = mountLibrary(layout, context);
  regions.push(
    bar,
    stats,
    mountAttributes(panel, context),
    mountSkillBar(panel, context),
    mountGear(panel, context, paperDoll),
    library,
  );
  update();

  // A skill key over a library skill, hovered or focused, equips it to
  // that key's slot (#564). Not while typing, nor while the arena has the
  // keyboard, nor while the bar asks something. Esc is the bar's (#578).
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat) {
      return;
    }
    const target = event.target;
    if (
      isShortcut(event) ||
      bar.isOpen() ||
      (target instanceof Element && target.closest(`${TAKES_TYPING}, .training`) !== null)
    ) {
      return;
    }
    const action = actionForCode(keymap, event.code);
    const slot = action === undefined ? -1 : SKILL_ACTIONS.indexOf(action);
    const focused = document.activeElement?.closest<HTMLElement>(".skill-box");
    const box = focused ?? layout.querySelector<HTMLElement>(".skill-box:hover");
    const skillId = box?.dataset.skillId;
    if (slot < 0 || skillId === undefined) {
      return;
    }
    event.preventDefault();
    context.equipTo(skillId, slot);
  };
  document.addEventListener("keydown", onKeyDown);

  // A build pasted anywhere but a field imports it (#572), as Load GW1
  // code does (#2004). Other text is ignored; a broken build says why.
  const stopPaste = listenForPaste((text) => {
    const loaded = loadCode(text, context.current().id, Date.now());
    if (loaded.ok) {
      loadInto(context, loaded);
      return true;
    }
    switch (loaded.reason) {
      case "empty":
      case "not-a-code":
        return false;
      case "team":
        toast("That is a team code. Paste it on Team Builder.");
        return true;
      case "invalid":
        // Every problem at once: someone fixing a pasted build should not
        // discover its faults one round trip at a time.
        toast("Could not import", { problems: loaded.problems });
        return true;
    }
  });

  return {
    leave: (then) => {
      bar.leave(then);
    },
    dispose() {
      disposed = true;
      dropUndo();
      document.removeEventListener("keydown", onKeyDown);
      stopPaste();
      bar.dispose();
      tooltip.dispose();
      paperDoll.close();
      training?.dispose();
    },
  };
}

/* --- command bar ----------------------------------------------------------- */

interface CommandBar extends Region {
  /** Whether a confirmation, the ⋯ menu or the problems list is open. */
  isOpen(): boolean;
  /** Leave for `then`; unsaved edits ask first. */
  leave(then: () => void): void;
  dispose(): void;
}

/**
 * The command bar (#566, #1902): the name and professions, the point
 * budget, the problems chip, an unsaved marker, Save, which stores and
 * leaves, and ⋯ with Share (#572), Load GW1 code (#2004), Duplicate and Delete. Esc with unsaved
 * edits, and Delete always, ask in the bar first.
 */
function mountCommandBar(
  context: EditorContext,
  paperDoll: PaperDoll,
  opened: StoredCharacter,
  callbacks: BuildEditorCallbacks,
  onName: (name: string) => void,
): CommandBar {
  let asking: InlineConfirm | undefined;
  const ask = (
    anchor: HTMLElement,
    question: string,
    confirmLabel: string,
    onConfirm: () => void,
    cancelLabel: string,
  ): void => {
    asking?.dismiss();
    asking = inlineConfirm(anchor, question, confirmLabel, onConfirm, cancelLabel);
  };

  const leave = (then: () => void): void => {
    if (!isUnsaved(opened, context.current())) {
      then();
      return;
    }
    ask(save, "Discard changes?", "Discard", then, "Keep editing");
  };

  const nameInput = document.createElement("input");
  nameInput.className = "editor-name";
  nameInput.dataset.cause = "name";
  nameInput.setAttribute("aria-label", "character name");
  nameInput.value = opened.name;
  nameInput.addEventListener("input", () => {
    onName(nameInput.value);
  });

  const professions = h("div", "editor-row editor-professions");
  professions.dataset.cause = "professions";
  const primary = professionPicker(
    "primary",
    () => professionChoices(context.current(), "primary"),
    (value) => {
      if (value !== undefined) {
        context.changeProfessions(value, context.current().secondaryProfession);
      }
    },
  );
  const secondary = professionPicker(
    "secondary",
    () => professionChoices(context.current(), "secondary"),
    (value) => {
      context.changeProfessions(context.current().primaryProfession, value);
    },
  );
  professions.append(primary.element, secondary.element);

  const budget = h("span", "editor-budget");
  budget.title = "Attribute points spent";
  const chip = problemsChip([]);
  const unsaved = h("span", "editor-unsaved", "● unsaved");

  let disposed = false;
  // Save is the way out (#1902): it stores, then leaves as Esc would.
  const save = button("Save", "primary", () => {
    save.disabled = true;
    callbacks.onSave({ ...context.current(), updatedAt: Date.now() }).then(
      () => {
        if (disposed) {
          return;
        }
        // After leaving, which puts the last screen's toast away.
        callbacks.onClose();
        toast("Saved");
      },
      (error: unknown) => {
        if (disposed) {
          return;
        }
        toast(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
        save.disabled = editorProblems(context.current()).some((problem) => problem.blocking);
      },
    );
  });

  // Share (#572): the build as one line, selected, with Copy. Load
  // (#2004) opens in its place: one of the two at a time.
  const share = shareLine("build to share");
  const load = loadLine("GW1 code to load", "Paste a GW1 template code", (text) => {
    const loaded = loadCode(text, context.current().id, Date.now());
    if (!loaded.ok) {
      return loaded.problems;
    }
    loadInto(context, loaded);
    return [];
  });
  const showShare = (text: string): void => {
    load.hide();
    share.show(text);
  };
  const more = moreMenu(
    [
      button("Share", "", () => {
        showShare(exportBuild(context.current()));
      }),
      // The same build as a GW1 template code (#494), for GW1's build sites.
      button("Share as GW1 code", "", () => {
        const encoded = encodeTemplate(context.current());
        if (encoded.ok) {
          showShare(encoded.code);
        } else {
          toast(encoded.problem);
        }
      }),
      button("Load GW1 code", "", () => {
        share.hide();
        load.show();
      }),
      // An edited character duplicates as edited, as it always has.
      button("Duplicate", "", () => {
        callbacks.onDuplicate(context.current());
      }),
      button("Delete", "", () => {
        const { id, name } = context.current();
        ask(
          more.toggle,
          `Delete ${name}?`,
          "Delete",
          () => {
            callbacks.onDelete(id);
          },
          "Cancel",
        );
      }),
    ],
    [share.element, load.element],
  );

  // Esc puts away the ⋯ menu, Share, the problem list and then the pick
  // (#564) before it leaves.
  const putAway = (): boolean => {
    if (more.isOpen()) {
      more.close();
      return true;
    }
    if (share.isOpen()) {
      share.hide();
      return true;
    }
    if (load.isOpen()) {
      load.hide();
      return true;
    }
    if (chip.isOpen()) {
      chip.close();
      return true;
    }
    if (context.selected() !== undefined) {
      context.select(undefined);
      return true;
    }
    if (paperDoll.isOpen()) {
      paperDoll.close();
      return true;
    }
    return false;
  };
  // The name is the last crumb: the place is the character (#1272).
  screenBar({
    crumbs: ["VibeWars", nameInput],
    escape: () => {
      leave(callbacks.onClose);
    },
    status: [professions, budget, chip.element, unsaved],
    actions: [save, more.element],
    putAway,
  });

  // A press anywhere else puts the ⋯ menu and the problem list away.
  const onPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!more.element.contains(target)) {
      more.close();
      share.hide();
      load.hide();
    }
    if (!chip.element.contains(target)) {
      chip.close();
    }
  };
  document.addEventListener("pointerdown", onPointerDown);

  const budgetTotal = MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget;
  return {
    update(character) {
      // Only an import changes the name from outside the field; setting
      // an unchanged value would still move the caret to the end.
      if (nameInput.value !== character.name) {
        nameInput.value = character.name;
      }
      primary.update(character.primaryProfession);
      secondary.update(character.secondaryProfession);
      budget.textContent = `${String(budgetTotal - remainingPoints(character))}/${String(budgetTotal)}`;
      const problems = editorProblems(character);
      chip.update(
        problems.map((problem): ChipProblem => ({
          text: problem.text,
          blocking: problem.blocking,
          jump: () => {
            // The name and professions sit in the top bar (#1272), outside the layout.
            showCause(document, problem.cause);
          },
        })),
      );
      unsaved.hidden = !isUnsaved(opened, character);
      // An invalid build cannot be saved (brief §23); the button says why.
      const firstBlocking = problems.find((problem) => problem.blocking);
      save.disabled = firstBlocking !== undefined;
      save.title = firstBlocking?.text ?? "Save this character";
    },
    isOpen() {
      return (
        asking?.isOpen() === true ||
        more.isOpen() ||
        share.isOpen() ||
        load.isOpen() ||
        chip.isOpen()
      );
    },
    leave,
    dispose() {
      disposed = true;
      document.removeEventListener("pointerdown", onPointerDown);
    },
  };
}

/* --- professions ----------------------------------------------------------- */

/**
 * A profession field (#568): a button with the chosen profession's icon
 * and name, which opens a grid of every profession it may be. Each cell
 * says what the profession brings and how many of the bar's skills it
 * keeps, so a change is chosen knowing what it costs. Esc, a click
 * outside, or the button again closes it.
 */
function professionPicker(
  which: "primary" | "secondary",
  choices: () => readonly ProfessionChoice[],
  onChange: (value: ProfessionId | undefined) => void,
): { readonly element: HTMLElement; update(selected: ProfessionId | undefined): void } {
  const wrapper = h("div", "editor-field editor-profession-field");
  wrapper.appendChild(h("span", "editor-label", which));
  // Menus only: in the arena, colour means team.
  const icon = document.createElement("img");
  icon.className = "profession-icon";
  icon.alt = "";
  const name = h("span", "editor-profession-name");
  const opener = button("", "editor-profession", () => {
    if (grid.hidden) {
      open();
    } else {
      close();
    }
  });
  opener.dataset.which = which;
  opener.setAttribute("aria-haspopup", "dialog");
  opener.setAttribute("aria-expanded", "false");
  opener.setAttribute("aria-label", `${which} profession`);
  opener.append(icon, name);
  const grid = h("div", "profession-grid");
  grid.setAttribute("role", "dialog");
  grid.setAttribute("aria-label", `choose a ${which} profession`);
  grid.hidden = true;
  wrapper.append(opener, grid);

  const onOutside = (event: PointerEvent): void => {
    if (event.target instanceof Node && !wrapper.contains(event.target)) {
      close();
    }
  };
  const close = (): void => {
    grid.hidden = true;
    // Built afresh on every open, from the character as it is then.
    grid.replaceChildren();
    opener.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", onOutside, { capture: true });
  };
  const open = (): void => {
    grid.replaceChildren(
      ...choices().map((choice) => {
        const cell = button("", "profession-cell", () => {
          close();
          opener.focus();
          if (!choice.current) {
            onChange(choice.id);
          }
        });
        cell.dataset.profession = choice.id ?? "none";
        cell.classList.toggle("is-current", choice.current);
        if (choice.current) {
          cell.setAttribute("aria-current", "true");
        }
        const head = h("span", "profession-cell-head");
        if (choice.id !== undefined) {
          const glyph = document.createElement("img");
          glyph.className = "profession-icon";
          glyph.alt = "";
          glyph.src = professionIcon(choice.id);
          head.appendChild(glyph);
        }
        head.appendChild(h("span", "profession-cell-name", choice.name));
        cell.appendChild(head);
        if (choice.attributes.length > 0) {
          cell.appendChild(h("span", "profession-cell-attributes", choice.attributes.join(" · ")));
        }
        if (choice.of > 0) {
          const keeps = h(
            "span",
            "profession-cell-keeps",
            `keeps ${String(choice.keeps)} of ${String(choice.of)} skills`,
          );
          keeps.classList.toggle("is-loss", choice.keeps < choice.of);
          cell.appendChild(keeps);
        }
        return cell;
      }),
    );
    grid.hidden = false;
    opener.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", onOutside, { capture: true });
    (grid.querySelector<HTMLElement>(".is-current") ?? grid.querySelector("button"))?.focus();
  };
  grid.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      // The grid's, not the editor's: Esc here closes it and nothing else.
      event.preventDefault();
      event.stopPropagation();
      close();
      opener.focus();
    }
  });

  return {
    element: wrapper,
    update(selected) {
      const text = selected === undefined ? "(none)" : PROFESSIONS[selected].name;
      if (name.textContent !== text) {
        name.textContent = text;
      }
      opener.dataset.value = selected ?? "none";
      if (selected === undefined) {
        icon.hidden = true;
        return;
      }
      icon.hidden = false;
      const src = professionIcon(selected);
      if (icon.getAttribute("src") !== src) {
        icon.src = src;
      }
    },
  };
}

/* --- attributes ------------------------------------------------------------ */

function rankOf(character: StoredCharacter, attributeId: string): number {
  return character.attributes.find((a) => a.attributeId === attributeId)?.rank ?? 0;
}

function mountAttributes(panel: HTMLElement, context: EditorContext): Region {
  const budget = MINIMAL_GW_INSPIRED_PVP_V1.attributes.attributePointBudget;
  const points = h("div", "editor-points");
  const pointsText = h("div", "editor-points-text");
  const bar = h("div", "attribute-budget");
  points.append(pointsText, bar);
  const list = h("div", "editor-attributes");
  list.dataset.cause = "attributes";
  panel.append(points, list);

  /** The pip under the pointer, previewed on its row and the points line. */
  let hover: { readonly attributeId: string; readonly pip: number } | undefined;
  /** A pip the budget could not pay for, until the next change. */
  let refused: { readonly attributeId: string; readonly needs: number } | undefined;

  const request = (attributeId: string, rank: number): void => {
    const character = context.current();
    if (rank < 0 || rank > MAX_ATTRIBUTE_RANK || rank === rankOf(character, attributeId)) {
      return;
    }
    const result = trySetRank(character, attributeId, rank);
    if ("needs" in result) {
      refused = { attributeId, needs: result.needs };
      render(character);
      return;
    }
    context.commit(result.character);
  };

  const create = (attributeId: string): HTMLElement => {
    // One focusable control per row, so Tab walks attributes and not pips.
    const row = h("div", "editor-attribute");
    row.tabIndex = 0;
    row.setAttribute("role", "slider");
    row.setAttribute("aria-valuemin", "0");
    row.setAttribute("aria-valuemax", String(MAX_ATTRIBUTE_RANK));
    row.addEventListener("keydown", (event) => {
      const rank = rankOf(context.current(), attributeId);
      const wanted =
        event.key === "ArrowRight"
          ? rank + 1
          : event.key === "ArrowLeft"
            ? rank - 1
            : event.key === "Home"
              ? 0
              : undefined;
      if (wanted !== undefined) {
        event.preventDefault();
        request(attributeId, wanted);
      }
    });

    const pips = h("span", "attribute-pips");
    for (let pip = 1; pip <= MAX_ATTRIBUTE_RANK; pip += 1) {
      const node = h("span", "attribute-pip");
      node.dataset.pip = String(pip);
      node.addEventListener("click", () => {
        request(attributeId, pipTarget(context.current(), attributeId, pip));
      });
      node.addEventListener("mouseenter", () => {
        hover = { attributeId, pip };
        render(context.current());
      });
      pips.appendChild(node);
    }
    pips.addEventListener("mouseleave", () => {
      hover = undefined;
      render(context.current());
    });

    row.append(
      h("span", "editor-attribute-name"),
      pips,
      h("span", "editor-attribute-rank"),
      h("span", "editor-attribute-next"),
      h("span", "editor-attribute-needs"),
    );
    return row;
  };

  const attributeName = (attributeId: string): string =>
    getAttribute(attributeId)?.name ?? attributeId;

  const render = (character: StoredCharacter): void => {
    const shown = accessibleAttributeIds(
      character.primaryProfession,
      character.secondaryProfession,
    ).filter((attributeId) => getAttribute(attributeId) !== undefined);
    // A row and its budget segment share a colour, so the bar reads back
    // to the rows without a legend.
    const colour = (attributeId: string): string =>
      `hsl(${String(Math.round((200 + (shown.indexOf(attributeId) * 360) / shown.length) % 360))} 55% 60%)`;
    const bonuses = new Map(
      // Runes are worn by every set, so set 1 says them.
      (summariseGear(character, 0)?.attributeBonuses ?? []).map((bonus) => [
        bonus.attributeId,
        bonus,
      ]),
    );
    const preview =
      hover === undefined
        ? undefined
        : {
            attributeId: hover.attributeId,
            rank: pipTarget(character, hover.attributeId, hover.pip),
          };

    if (preview === undefined) {
      pointsText.textContent = `${String(remainingPoints(character))} attribute points remaining`;
    } else {
      const { cost, left } = rankChange(character, preview.attributeId, preview.rank);
      const label = `${attributeName(preview.attributeId)} ${String(preview.rank)}`;
      pointsText.textContent =
        left < 0
          ? `${label}: needs ${String(-left)} more points`
          : `${label}: ${cost >= 0 ? `costs ${String(cost)}` : `refunds ${String(-cost)}`}, ${String(left)} left`;
    }

    syncList(
      bar,
      budgetSegments(character),
      (segment) => segment.attributeId,
      () => h("span", "attribute-budget-segment"),
      (node, segment) => {
        node.style.width = `${String((segment.points / budget) * 100)}%`;
        node.style.background = colour(segment.attributeId);
        node.title = `${attributeName(segment.attributeId)}: ${String(segment.points)} points`;
      },
    );

    syncList(
      list,
      shown,
      (attributeId) => attributeId,
      create,
      (row, attributeId) => {
        const definition = getAttribute(attributeId);
        const rank = rankOf(character, attributeId);
        const bonus = bonuses.get(attributeId);
        row.style.setProperty("--attribute-colour", colour(attributeId));
        row.setAttribute("aria-label", attributeName(attributeId));
        row.setAttribute("aria-valuenow", String(rank));

        const name = row.querySelector(".editor-attribute-name");
        if (name !== null) {
          name.textContent = `${attributeName(attributeId)}${definition?.isPrimary === true ? " ★" : ""}`;
          // What the primary does at this rank (#531), under its name.
          const effect = describePrimaryAttribute(attributeId, rank);
          if (effect !== undefined) {
            name.appendChild(h("span", "editor-attribute-effect", effect));
          }
        }

        const previewed = preview?.attributeId === attributeId ? preview.rank : undefined;
        for (const pip of Array.from(row.querySelectorAll<HTMLElement>(".attribute-pip"))) {
          const at = Number(pip.dataset.pip);
          pip.classList.toggle("is-on", at <= rank);
          pip.classList.toggle(
            "is-dim",
            at > rank && rankChange(character, attributeId, at).left < 0,
          );
          pip.classList.toggle("is-preview", previewed !== undefined && at <= previewed);
          pip.classList.toggle("is-lost", previewed !== undefined && at > previewed && at <= rank);
        }

        const rankText = row.querySelector(".editor-attribute-rank");
        if (rankText !== null) {
          // Runes raise the rank past what points bought (#565): not a pip
          // to click, so a suffix after it.
          rankText.textContent = String(rank);
          if (bonus !== undefined) {
            const suffix = h("span", "editor-attribute-bonus", ` +${String(bonus.bonus)}`);
            suffix.title = bonus.sources;
            rankText.appendChild(suffix);
          }
        }
        const next = row.querySelector(".editor-attribute-next");
        if (next !== null) {
          const cost = nextRankCost(character, attributeId);
          next.textContent = cost === undefined ? "max" : `next: ${String(cost)} pts`;
        }
        const needs = row.querySelector(".editor-attribute-needs");
        if (needs !== null) {
          needs.textContent =
            refused?.attributeId === attributeId
              ? `needs ${String(refused.needs)} more points`
              : "";
        }
      },
    );
  };

  return {
    update(character) {
      refused = undefined;
      render(character);
    },
  };
}

/* --- skill bar ------------------------------------------------------------- */

function mountSkillBar(panel: HTMLElement, context: EditorContext): Region {
  const { tooltip } = context;
  // Boxes rather than dropdowns: a bar is a spatial thing, and ordering
  // it by picking from eight identical `<select>`s never matched how
  // players think about it.
  const section = h("div", "editor-skills");
  section.appendChild(h("div", "editor-label", "Skill bar"));
  const grid = h("div", "skill-bar-grid");
  grid.dataset.cause = "bar";
  section.appendChild(grid);
  const notice = h("div", "editor-notice");
  notice.setAttribute("role", "status");
  panel.appendChild(section);

  /** What each filled slot's tooltip shows, as of the last update. */
  const described = new Map<number, SkillDescription>();
  /** What each slot's contents were built from, so an unchanged slot is left alone. */
  const built = new Map<number, string>();

  const create = (slot: number): HTMLElement => {
    const cell = h("div", "skill-slot");
    cell.dataset.slot = String(slot);
    // Pick the slot the next equip goes to (#564); again lets go.
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    const toggle = (): void => {
      context.select(context.selected() === slot ? undefined : slot);
      context.showLibrary("skills");
    };
    cell.addEventListener("click", toggle);
    cell.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.target === cell && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        toggle();
      }
    });
    cell.dataset.cause = `slot-${String(slot)}`;
    cell.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeDragSource({ from: "slot", slot }));
    });
    cell.addEventListener("mouseenter", () => {
      context.showTip(cell, () => described.get(slot));
    });
    cell.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    cell.addEventListener("dragover", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.add("is-drop-target");
    });
    cell.addEventListener("dragleave", () => {
      cell.classList.remove("is-drop-target");
    });
    cell.addEventListener("drop", (event: DragEvent) => {
      event.preventDefault();
      cell.classList.remove("is-drop-target");
      const source = decodeDragSource(event.dataTransfer?.getData("text/plain") ?? "");
      if (source === undefined) {
        // Something unrelated was dragged in. Do nothing, loudly nowhere.
        return;
      }
      context.equip(applySkillDrop(context.current(), source, slot));
    });
    return cell;
  };

  return {
    update(character) {
      const said = context.notice();
      if (said === undefined) {
        notice.remove();
      } else {
        notice.textContent = said;
        section.appendChild(notice);
      }
      const available = equippableSkills(character);
      const ranks = characterRanks(character);
      const slots = character.skillBar.map((_, slot) => slot);
      const selected = context.selected();
      syncList(grid, slots, String, create, (cell, slot) => {
        const isSelected = selected === slot;
        cell.classList.toggle("is-selected", isSelected);
        cell.setAttribute("aria-pressed", String(isSelected));
        const skillId = character.skillBar[slot] ?? null;
        const skill = skillId === null ? undefined : available.find((s) => s.id === skillId);
        const description = skill === undefined ? undefined : describeSkill(skill, ranks);
        if (description === undefined) {
          described.delete(slot);
        } else {
          described.set(slot, description);
        }
        const label = context.slotLabel(slot);
        const warning =
          skill === undefined ? undefined : weaponWarning(skill, carriedWeapons(character));
        const signature = `${label}|${skill === undefined ? "" : `${skill.id}|${description?.cost ?? ""}|${warning?.title ?? ""}`}`;
        if (built.get(slot) === signature) {
          return;
        }
        built.set(slot, signature);
        cell.replaceChildren(h("span", "skill-slot-index", label));
        cell.classList.toggle("is-empty", skill === undefined);
        cell.classList.toggle("has-weapon-warning", warning !== undefined);
        cell.classList.toggle("is-elite", skill?.elite === true);
        cell.draggable = skill !== undefined;
        if (skill === undefined || description === undefined) {
          cell.appendChild(h("span", "skill-slot-empty", "Empty"));
          return;
        }
        cell.insertAdjacentHTML("beforeend", skillIconHtml(skill.id, SLOT_ICON_PX));
        cell.appendChild(h("span", "skill-slot-name", skill.name));
        cell.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
        cell.appendChild(h("span", "skill-slot-cost", description.cost));
        // An attack skill the weapon cannot use (#417): it still saves.
        if (warning !== undefined) {
          const badge = h("span", "skill-slot-warning", warning.badge);
          badge.title = warning.title;
          cell.appendChild(badge);
        }
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "skill-slot-clear";
        clear.textContent = "×";
        clear.title = `Remove ${skill.name}`;
        clear.addEventListener("click", (event) => {
          // Without this the click also lands on the cell, which would
          // pick the slot as it empties.
          event.stopPropagation();
          context.commit(setSkill(context.current(), slot, null));
        });
        cell.appendChild(clear);
      });
    },
  };
}

/* --- library (right column) ------------------------------------------------ */

type LibraryTab = "skills" | "gear";

interface LibraryRegion extends Region {
  /** Open `tab`, scrolled to the group named `group` if given. */
  show(tab: LibraryTab, group?: string): void;
}

function mountLibrary(layout: HTMLElement, context: EditorContext): LibraryRegion {
  const library = h("aside", "skill-library");
  layout.appendChild(library);

  // Two libraries in one column rather than two columns: the panel is
  // already the full height of the editor, and a second permanent column
  // would squeeze the character sheet for something you only use while
  // picking one kind of thing. Both are kept, built and up to date; only
  // the open one is in the page, and each keeps its own scroll.
  const skills = mountSkillLibrary(context);
  const gear = mountGearLibrary(context);
  const bodies: Readonly<Record<LibraryTab, readonly HTMLElement[]>> = {
    skills: skills.elements,
    gear: gear.elements,
  };
  const scrolled: Record<LibraryTab, number> = { skills: 0, gear: 0 };
  let active: LibraryTab = "skills";

  const tabs = h("div", "library-tabs");
  const open = (tab: LibraryTab): void => {
    if (active === tab) {
      return;
    }
    scrolled[active] = library.scrollTop;
    for (const element of bodies[active]) {
      element.remove();
    }
    active = tab;
    library.append(...bodies[tab]);
    library.scrollTop = scrolled[tab];
    for (const [other, otherButton] of tabButtons) {
      otherButton.classList.toggle("is-active", other === tab);
    }
  };
  const tabButtons = (["skills", "gear"] as const).map((tab) => {
    const node = button(tab, "library-tab", () => {
      if (active !== tab) {
        open(tab);
      }
    });
    node.classList.toggle("is-active", tab === active);
    tabs.appendChild(node);
    return [tab, node] as const;
  });
  library.append(tabs, ...bodies[active]);

  // Dropping worn things back onto the library takes them off: a bar skill
  // on the skills tab, gear on the gear tab. The gesture players reach for
  // after dragging something out of a slot.
  library.addEventListener("dragover", (event: DragEvent) => {
    event.preventDefault();
  });
  library.addEventListener("drop", (event: DragEvent) => {
    event.preventDefault();
    const raw = event.dataTransfer?.getData("text/plain") ?? "";
    if (active === "skills") {
      const source = decodeDragSource(raw);
      if (source?.from === "slot") {
        context.commit(setSkill(context.current(), source.slot, null));
      }
      return;
    }
    const source = decodeGearDrag(raw);
    if (source !== undefined) {
      context.commit(applyGearDrop(context.current(), source, { kind: "library" }));
    }
  });

  return {
    update(character) {
      skills.update(character);
      gear.update(character);
    },
    show(tab, group) {
      open(tab);
      const heading = [...library.querySelectorAll<HTMLElement>(".skill-group")].find(
        (node) => node.dataset.group === group,
      );
      if (heading !== undefined) {
        library.scrollTop +=
          heading.getBoundingClientRect().top - library.getBoundingClientRect().top;
      }
    },
  };
}

/** A library tab's body: the elements it puts under the tabs. */
interface LibraryBody extends Region {
  readonly elements: readonly HTMLElement[];
}

/**
 * A card's inline details (#567): its description at your rank, and the
 * 0-12 scale of its attribute with your rank marked.
 */
function renderDetails(
  node: HTMLElement,
  description: SkillDescription,
  ranks: ReadonlyMap<string, number>,
): void {
  renderSkillDescription(node, description, { title: false });
  const { attributeId, attributeName } = description;
  if (attributeId === undefined || attributeName === undefined) {
    return;
  }
  const rank = ranks.get(attributeId) ?? 0;
  const scale = h("div", "skill-scale");
  scale.setAttribute("role", "img");
  scale.setAttribute(
    "aria-label",
    `${attributeName} rank ${String(rank)} of ${String(MAX_ATTRIBUTE_RANK)}`,
  );
  for (let step = 0; step <= MAX_ATTRIBUTE_RANK; step++) {
    const mark = h("span", "skill-scale-step", String(step));
    mark.classList.toggle("is-current", step === rank);
    mark.classList.toggle("is-reached", step < rank);
    scale.appendChild(mark);
  }
  node.appendChild(scale);
}

/** A GW1 skill not in the game yet (#1220), told from a playable one by its lack of an id. */
function isCorpus(skill: Skill | CorpusSkill): skill is CorpusSkill {
  return !("id" in skill);
}

/** A library card's key: a skill's id, or a corpus entry's GW1 id, which no skill id looks like. */
function libraryKey(skill: Skill | CorpusSkill): string {
  return isCorpus(skill) ? `gw:${String(skill.gwId)}` : skill.id;
}

function mountSkillLibrary(context: EditorContext): LibraryBody {
  const { tooltip } = context;
  const search = document.createElement("input");
  search.className = "field-input skill-search";
  search.type = "search";
  search.placeholder = "Search names and text";
  search.setAttribute("aria-label", "search skills");
  // The library's "Elite" toggle (#459): only elite skills listed.
  const eliteOnly = document.createElement("input");
  eliteOnly.type = "checkbox";
  const eliteFilter = h("label", "skill-elite-filter");
  eliteFilter.append(eliteOnly, " Elite");
  // On the search's own row, so the library is no taller for it.
  const filters = h("div", "skill-filters");
  filters.append(search, eliteFilter);
  // The GW1 skills not in the game yet (#1220), off by default and
  // remembered. Their data is a chunk of its own, loaded the first time
  // this is on; until it arrives the library lists what it has.
  const showCorpus = document.createElement("input");
  showCorpus.type = "checkbox";
  showCorpus.checked = loadShowCorpus();
  const corpusToggle = h("label", "skill-corpus-toggle");
  corpusToggle.append(showCorpus, " Show skills not in the game yet");
  let corpus: readonly CorpusSkill[] | undefined;
  let corpusLoading = false;
  const loadCorpus = (): void => {
    if (corpus !== undefined || corpusLoading) {
      return;
    }
    corpusLoading = true;
    import("@vibewars/game-data/corpus")
      .then(({ corpusSkills }) => {
        corpus = missingFromCatalog(corpusSkills(), IMPLEMENTED_SKILLS);
        render(context.current());
      })
      .catch(() => {
        // A chunk that failed to load is asked for again at the next toggle.
      })
      .finally(() => {
        corpusLoading = false;
      });
  };
  if (showCorpus.checked) {
    loadCorpus();
  }
  // One chip per type the catalogue has (#567); several may be on.
  const types = new Set<SkillType>();
  const chips = h("div", "skill-type-chips");
  for (const type of skillTypesOf(
    IMPLEMENTED_SKILLS,
    Object.keys(SKILL_TYPE_NAME) as SkillType[],
  )) {
    const chip = button(SKILL_TYPE_NAME[type].toLowerCase(), "skill-type-chip", () => {
      if (types.has(type)) {
        types.delete(type);
      } else {
        types.add(type);
      }
      chip.setAttribute("aria-pressed", String(types.has(type)));
      render(context.current());
    });
    chip.setAttribute("aria-pressed", "false");
    chips.appendChild(chip);
  }
  /** The card whose details are open; one at a time (#567). */
  let open: string | undefined;
  const groupHost = h("div", "skill-groups");

  /**
   * A click on a library skill: to the picked slot or the first empty one,
   * as its Equip says. One already on the bar stays where it is, and a
   * full bar with no pick takes nothing (#564).
   */
  const equipFromLibrary = (skill: Skill): void => {
    const character = context.current();
    const target = equipTarget(character.skillBar, context.selected());
    if (target !== undefined && !character.skillBar.includes(skill.id)) {
      context.equipTo(skill.id, target.slot);
    }
  };

  /**
   * A card (#567): a button with the name, type, cost and the number that
   * matters at your rank, which opens its details inline; then Equip, or
   * where it is on the bar. Dragging the card equips too.
   */
  const createBox = (skill: Skill): HTMLElement => {
    const box = h("div", "skill-box");
    box.draggable = true;
    box.dataset.skillId = skill.id;
    box.classList.toggle("is-elite", skill.elite);
    const card = button("", "skill-box-card", () => {
      open = open === skill.id ? undefined : skill.id;
      render(context.current());
    });
    card.setAttribute("aria-expanded", "false");
    card.insertAdjacentHTML("beforeend", skillIconHtml(skill.id, LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
    card.appendChild(h("span", "skill-box-cost"));
    card.appendChild(h("span", "skill-box-headline"));
    box.appendChild(card);
    box.appendChild(
      button("", "skill-box-equip", () => {
        equipFromLibrary(skill);
      }),
    );
    box.appendChild(h("span", "skill-box-on"));
    const details = h("div", "skill-box-details");
    details.hidden = true;
    box.appendChild(details);
    box.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData(
        "text/plain",
        encodeDragSource({ from: "library", skillId: skill.id }),
      );
    });
    // The hover tooltip stays beside the inline details (#549 Q3), as in
    // GW1's skill window.
    box.addEventListener("mouseenter", () => {
      context.showTip(box, () => describeSkill(skill, characterRanks(context.current())));
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    return box;
  };

  /**
   * A locked card (#568): a skill of a profession you do not have, tagged
   * with the one it needs. It opens its details, but has no Equip and
   * does not drag.
   */
  const createLockedBox = (skill: Skill): HTMLElement => {
    const box = h("div", "skill-locked-box");
    box.dataset.skillId = skill.id;
    box.classList.toggle("is-elite", skill.elite);
    const card = button("", "skill-box-card", () => {
      open = open === skill.id ? undefined : skill.id;
      render(context.current());
    });
    card.setAttribute("aria-expanded", "false");
    card.insertAdjacentHTML("beforeend", skillIconHtml(skill.id, LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.type));
    card.appendChild(h("span", "skill-box-cost"));
    card.appendChild(h("span", "skill-box-headline"));
    box.appendChild(card);
    box.appendChild(h("span", "skill-box-needs", `needs ${skillProfessionName(skill.profession)}`));
    const details = h("div", "skill-box-details");
    details.hidden = true;
    box.appendChild(details);
    box.addEventListener("mouseenter", () => {
      context.showTip(box, () => describeSkill(skill, characterRanks(context.current())));
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    return box;
  };

  /**
   * A GW1 skill not in the game yet (#1220): greyed, badged, with GW1's
   * fields on hover. It neither opens, equips nor drags. Nothing on it
   * changes, so each is built once and kept: a search cleared brings a
   * thousand back without building one (#1220 "stays responsive").
   */
  const corpusBoxes = new Map<number, HTMLElement>();
  const createCorpusBox = (skill: CorpusSkill): HTMLElement => {
    const built = corpusBoxes.get(skill.gwId);
    if (built !== undefined) {
      return built;
    }
    const box = h("div", "skill-corpus-box");
    corpusBoxes.set(skill.gwId, box);
    box.dataset.gwId = String(skill.gwId);
    box.classList.toggle("is-elite", skill.elite);
    const card = h("div", "skill-box-card");
    card.insertAdjacentHTML("beforeend", skillIconHtml("", LIBRARY_ICON_PX));
    card.appendChild(h("span", "skill-box-name", skill.name));
    if (skill.skillType !== undefined) {
      card.insertAdjacentHTML("beforeend", skillTypeBadgeHtml(skill.skillType));
    }
    card.appendChild(h("span", "skill-box-cost", corpusCostText(skill)));
    box.appendChild(card);
    box.appendChild(h("span", "skill-corpus-badge", "not in the game yet"));
    box.addEventListener("mouseenter", () => {
      tooltip.showCorpus(box, skill);
    });
    box.addEventListener("mouseleave", () => {
      tooltip.hide();
    });
    return box;
  };

  /** A card's cost, headline and open details, as of `ranks`: the same for a locked card. */
  const paintCard = (box: HTMLElement, skill: Skill, ranks: ReadonlyMap<string, number>): void => {
    const description = describeSkill(skill, ranks);
    const cost = box.querySelector(".skill-box-cost");
    if (cost !== null && cost.textContent !== description.cost) {
      cost.textContent = description.cost;
    }
    const headline = box.querySelector<HTMLElement>(".skill-box-headline");
    const headlineText = description.headline ?? "";
    if (headline !== null && headline.textContent !== headlineText) {
      headline.replaceChildren();
      appendParts(headline, description.headlineParts ?? []);
    }
    const isOpen = open === skill.id;
    box.classList.toggle("is-open", isOpen);
    box.querySelector(".skill-box-card")?.setAttribute("aria-expanded", String(isOpen));
    const details = box.querySelector<HTMLElement>(".skill-box-details");
    if (details !== null) {
      details.hidden = !isOpen;
      if (isOpen) {
        renderDetails(details, description, ranks);
      } else if (details.childElementCount > 0) {
        details.replaceChildren();
      }
    }
  };

  // Below the groups, collapsed: what other professions would bring (#568).
  const locked = document.createElement("details");
  locked.className = "skill-locked";
  const lockedSummary = document.createElement("summary");
  locked.appendChild(lockedSummary);
  const lockedBoxes = h("div", "skill-group-boxes");
  locked.appendChild(lockedBoxes);

  const createGroup = (): HTMLElement => {
    const section = h("div", "skill-group");
    const header = h("div", "skill-group-header");
    header.appendChild(h("span", "skill-group-name"));
    section.appendChild(header);
    section.appendChild(h("div", "skill-group-boxes"));
    return section;
  };

  const render = (character: StoredCharacter): void => {
    const ranks = characterRanks(character);
    const target = equipTarget(character.skillBar, context.selected());
    const equipText =
      target === undefined
        ? "pick a slot"
        : `Equip → ${context.slotLabel(target.slot)}${target.replaces ? " (replace)" : ""}`;
    const filtered = (list: readonly Skill[]): readonly Skill[] =>
      filterSkillsByType(
        filterSkillsByText(eliteOnly.checked ? filterEliteSkills(list) : list, search.value),
        types,
      );
    const matches = filtered(equippableSkills(character));
    const lockedMatches = filtered(
      lockedSkills(IMPLEMENTED_SKILLS, character.primaryProfession, character.secondaryProfession),
    );
    const corpusMatches = corpusByAccess(
      showCorpus.checked && corpus !== undefined
        ? filterCorpus(corpus, search.value, types, eliteOnly.checked)
        : [],
      character.primaryProfession,
      character.secondaryProfession,
    );
    // A card the filters took away closes; it does not reopen on its own.
    if (![...matches, ...lockedMatches].some((skill) => skill.id === open)) {
      open = undefined;
    }
    const groups = groupSkillsByAttribute(matches, corpusMatches.open);
    syncList(
      groupHost,
      groups,
      (group) => group.attributeId ?? group.attributeName,
      createGroup,
      (section, group) => {
        const [header, boxes] = Array.from(section.children);
        const name = header?.querySelector(".skill-group-name");
        if (name !== null && name !== undefined) {
          name.textContent = group.attributeName;
        }
        // The rank is shown here because it is exactly what makes every
        // skill under this heading better — the reason to group this way.
        // "No Attribute" skills have none to show.
        let rank = header?.querySelector(".skill-group-rank");
        if (group.attributeId === undefined) {
          rank?.remove();
        } else {
          if (rank === null || rank === undefined) {
            rank = h("span", "skill-group-rank");
            header?.appendChild(rank);
          }
          rank.textContent = `rank ${String(ranks.get(group.attributeId) ?? 0)}`;
        }
        if (boxes instanceof HTMLElement) {
          syncList(
            boxes,
            [...group.skills, ...group.corpus],
            libraryKey,
            (skill) => (isCorpus(skill) ? createCorpusBox(skill) : createBox(skill)),
            (box, skill) => {
              if (isCorpus(skill)) {
                return;
              }
              const on = character.skillBar.indexOf(skill.id);
              box.classList.toggle("is-equipped", on >= 0);
              // On the bar: where, and no Equip. Else where an equip goes.
              const equip = box.querySelector<HTMLButtonElement>(".skill-box-equip");
              const onLabel = box.querySelector(".skill-box-on");
              if (equip !== null) {
                equip.hidden = on >= 0;
                equip.disabled = target === undefined;
                if (equip.textContent !== equipText) {
                  equip.textContent = equipText;
                }
              }
              if (onLabel !== null) {
                const text = on >= 0 ? `on ${context.slotLabel(on)}` : "";
                if (onLabel.textContent !== text) {
                  onLabel.textContent = text;
                }
              }
              paintCard(box, skill, ranks);
            },
          );
        }
      },
    );
    const lockedAll = [...lockedMatches, ...corpusMatches.locked];
    lockedSummary.textContent = `Other professions (${String(lockedAll.length)})`;
    // Collapsed, the near thousand GW1 skills of other professions are
    // counted, not laid out: they come in as it opens (#1220).
    syncList(
      lockedBoxes,
      locked.open ? lockedAll : lockedMatches,
      libraryKey,
      (skill) => (isCorpus(skill) ? createCorpusBox(skill) : createLockedBox(skill)),
      (box, skill) => {
        if (!isCorpus(skill)) {
          paintCard(box, skill, ranks);
        }
      },
    );
    locked.hidden = lockedAll.length === 0;
  };

  search.addEventListener("input", () => {
    render(context.current());
  });
  eliteOnly.addEventListener("change", () => {
    render(context.current());
  });
  locked.addEventListener("toggle", () => {
    if (showCorpus.checked) {
      render(context.current());
    }
  });
  showCorpus.addEventListener("change", () => {
    saveShowCorpus(showCorpus.checked);
    if (showCorpus.checked) {
      loadCorpus();
    }
    render(context.current());
  });

  return { elements: [corpusToggle, filters, chips, groupHost, locked], update: render };
}

/* -------------------------------------------------------------------------- */
/* Gear                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `commit` a gear change, toasting each mod a new weapon or off-hand
 * could not keep (#2008); a change that drops none is silent.
 */
function commitGear(context: EditorContext, next: StoredCharacter): void {
  const notes = droppedModNotes(context.current(), next);
  context.commit(next);
  for (const note of notes) {
    toast(note);
  }
}

const MOD_SLOT_LABEL: Readonly<Record<ModSlot, string>> = {
  prefix: "Prefix",
  suffix: "Suffix",
  inscription: "Inscription",
};

/**
 * One hand's mod pickers (#2008): a select per slot its item has, None
 * and every mod that fits, from the catalog, so a new mod needs no UI.
 */
function mountModPickers(
  context: EditorContext,
  hand: "mainHand" | "offHand",
): {
  readonly element: HTMLElement;
  update(item: WeaponId | OffhandId | undefined, upgrades: ItemUpgrades | undefined): void;
} {
  const element = h("div", "gear-mods-hand");
  element.dataset.hand = hand;
  const pickers = new Map(
    (["prefix", "suffix", "inscription"] as const).map((slot) => [
      slot,
      mountSelectRow((value) => {
        context.commit(
          setUpgrade(
            context.current(),
            context.weaponSet(),
            hand,
            slot,
            value === "" ? null : value,
          ),
        );
      }),
    ]),
  );
  let shown = "";
  return {
    element,
    update(item, upgrades) {
      const slots = item === undefined ? [] : modSlotsOf(item);
      const rows = slots.flatMap((slot) => {
        const picker = pickers.get(slot);
        if (picker === undefined || item === undefined) {
          return [];
        }
        const worn = upgrades?.[slot] ?? null;
        picker.update(
          MOD_SLOT_LABEL[slot],
          [
            { value: "", label: "None" },
            ...modChoices(item, slot).map((mod) => ({
              value: mod.id,
              label: `${mod.name} — ${mod.text}`,
            })),
          ],
          worn ?? "",
        );
        picker.element.dataset.slot = slot;
        picker.element.title = worn === null ? "" : (getWeaponMod(worn)?.text ?? "");
        return [picker.element];
      });
      // Kept, not rebuilt, so a picker keeps focus across a pick.
      const signature = slots.join("|");
      if (signature !== shown) {
        shown = signature;
        element.replaceChildren(...rows);
      }
    },
  };
}

/** A labelled `<select>`, the shape this file already uses for professions, kept and refilled. */
function mountSelectRow(onChange: (value: string) => void): {
  readonly element: HTMLElement;
  update(
    label: string,
    options: readonly { readonly value: string; readonly label: string }[],
    selected: string,
  ): void;
} {
  const field = h("label", "editor-field");
  const caption = h("span", "editor-field-label");
  const select = document.createElement("select");
  select.addEventListener("change", () => {
    onChange(select.value);
  });
  field.append(caption, select);
  let filled = "";
  return {
    element: field,
    update(label, options, selected) {
      caption.textContent = label;
      const signature = JSON.stringify(options);
      if (signature !== filled) {
        filled = signature;
        select.replaceChildren(
          ...options.map((option) => {
            const node = document.createElement("option");
            node.value = option.value;
            node.textContent = option.label;
            return node;
          }),
        );
      }
      select.value = selected;
    },
  };
}

/** What a gear slot shows; see `mountGearSlot`. */
interface GearSlotState {
  readonly filled: string | undefined;
  /** What an empty slot says; "empty" if unset. */
  readonly emptyNote?: string | undefined;
  readonly icon?: GearIcon | undefined;
  readonly detail?: string | undefined;
  readonly disabledNote?: string | undefined;
  readonly dragSource?: GearDragSource | undefined;
  readonly onClear?: (() => void) | undefined;
}

/** Put `node` in or take it out, never moving it when it is already where it should be. */
function present(node: HTMLElement, shown: boolean, place: (node: HTMLElement) => void): void {
  if (!shown) {
    node.remove();
  } else if (!node.isConnected) {
    place(node);
  }
}

/**
 * A gear slot: a drop target that shows what is in it.
 *
 * Deliberately the same shape and gestures as `.skill-slot` — drag onto
 * it to fill it, drag out of it to empty it, click the × to clear. A
 * loadout is a thing you assemble, and two different interaction models
 * for assembling one would be two things to learn.
 */
function mountGearSlot(
  label: string,
  context: EditorContext,
  onDrop: (source: GearDragSource) => void,
  onClick?: () => void,
): { readonly element: HTMLElement; update(state: GearSlotState): void } {
  let state: GearSlotState = { filled: undefined };
  const disabled = (): boolean => state.disabledNote !== undefined;

  const cell = h("div", "gear-slot");
  const name = h("span", "gear-slot-name");
  const detail = h("span", "gear-slot-detail");
  const clear = button("×", "gear-slot-clear", () => {
    state.onClear?.();
  });
  // Clearing is not a click on the slot itself.
  clear.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  clear.title = `clear ${label}`;
  if (onClick !== undefined) {
    cell.addEventListener("click", onClick);
  }
  cell.append(h("span", "gear-slot-label", label), name);
  let shownName = "";

  cell.addEventListener("dragstart", (event: DragEvent) => {
    if (state.dragSource !== undefined && !disabled()) {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(state.dragSource));
    }
  });
  cell.addEventListener("dragover", (event: DragEvent) => {
    if (disabled()) {
      return;
    }
    event.preventDefault();
    cell.classList.add("is-drop-target");
  });
  cell.addEventListener("dragleave", () => {
    cell.classList.remove("is-drop-target");
  });
  cell.addEventListener("drop", (event: DragEvent) => {
    if (disabled()) {
      return;
    }
    event.preventDefault();
    cell.classList.remove("is-drop-target");
    context.tooltip.hide();
    const decoded = decodeGearDrag(event.dataTransfer?.getData("text/plain") ?? "");
    // A skill dropped here decodes to nothing and is ignored, which is
    // the same do-nothing-loudly-nowhere behaviour the skill bar has.
    if (decoded !== undefined) {
      onDrop(decoded);
    }
  });

  return {
    element: cell,
    update(next) {
      state = next;
      const off = disabled();
      cell.classList.toggle("is-disabled", off);
      cell.classList.toggle("is-empty", !off && next.filled === undefined);
      const icon = off ? undefined : next.icon;
      const text = next.disabledNote ?? next.filled ?? next.emptyNote ?? "empty";
      const signature = `${icon?.src ?? ""}|${text}`;
      if (signature !== shownName) {
        shownName = signature;
        const img = gearIconImg(icon);
        name.replaceChildren(...(img === undefined ? [] : [img]), document.createTextNode(text));
      }
      detail.textContent = next.detail ?? "";
      present(detail, next.detail !== undefined && !off, (node) => {
        name.after(node);
      });
      cell.draggable = !off && next.dragSource !== undefined;
      present(clear, next.onClear !== undefined && next.filled !== undefined && !off, (node) => {
        cell.appendChild(node);
      });
    },
  };
}

/**
 * The gear panel: weapon, off-hand, five armor pieces, and what it all
 * adds up to.
 *
 * The slots are drop targets fed from the library on the right, exactly
 * like the skill bar above them. Attribute *nominations* stay as
 * dropdowns, because choosing which attribute a wand scales with is a
 * genuine list choice rather than a spatial one — dragging would be
 * ceremony.
 *
 * The summary at the bottom is not decoration. Every control here moves
 * a number, and a player weighing +3 Swordsmanship against 75 health
 * needs to see both sides of the trade as they make it.
 */
function mountGear(panel: HTMLElement, context: EditorContext, doll: PaperDoll): Region {
  const { current, commit } = context;
  const section = h("div", "editor-gear");
  section.dataset.cause = "equipment";
  section.appendChild(h("div", "editor-label", "Equipment"));

  const drop = (target: GearDropTarget) => (source: GearDragSource) => {
    commitGear(context, applyGearDrop(current(), source, target));
  };

  // --- weapon sets ----------------------------------------------------
  // One tab per set (#489): the hands, their attributes and the summary
  // below show and edit the selected one.
  const tabRow = h("div", "gear-set-tabs");
  tabRow.setAttribute("role", "tablist");
  tabRow.setAttribute("aria-label", "weapon sets");
  const tabs = WEAPON_SET_INDICES.map((set) => {
    const tab = h("button", "gear-set-tab");
    tab.setAttribute("type", "button");
    tab.setAttribute("role", "tab");
    tab.dataset.cause = `equipment.weaponSets[${String(set)}]`;
    tab.addEventListener("click", () => {
      context.selectWeaponSet(set);
    });
    // Arrow keys move between the tabs, as a tablist's do.
    tab.addEventListener("keydown", (event: KeyboardEvent) => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (step === 0) {
        return;
      }
      event.preventDefault();
      const next = WEAPON_SET_INDICES[(set + step + WEAPON_SETS) % WEAPON_SETS] ?? set;
      context.selectWeaponSet(next);
      tabs[next]?.tab.focus();
    });
    const number = h("span", "gear-set-tab-number", String(set + 1));
    const icons = h("span", "gear-set-tab-icons");
    tab.append(number, icons);
    // Set 1 always holds a weapon, so only 2-4 can be emptied.
    const clear =
      set === 0
        ? undefined
        : button("×", "gear-set-tab-clear", () => {
            commit(clearWeaponSet(current(), set));
          });
    if (clear !== undefined) {
      clear.title = `empty set ${String(set + 1)}`;
      clear.setAttribute("aria-label", `empty set ${String(set + 1)}`);
    }
    const cell = h("div", "gear-set-tab-cell");
    cell.append(tab, ...(clear === undefined ? [] : [clear]));
    tabRow.appendChild(cell);
    // Nothing drawn yet, so even an empty set's first draw differs.
    return { set, tab, icons, clear, shown: undefined as string | undefined };
  });
  section.appendChild(tabRow);

  // --- weapon and off-hand -------------------------------------------
  const handsGrid = h("div", "gear-hands");
  // A hand clicked opens what can go in it (#570).
  const weaponSlot = mountGearSlot(
    "weapon",
    context,
    (source) => {
      drop({ kind: "main-hand", set: context.weaponSet() })(source);
    },
    () => {
      context.showLibrary("gear", "weapons");
    },
  );
  const offhandSlot = mountGearSlot(
    "off-hand",
    context,
    (source) => {
      drop({ kind: "off-hand", set: context.weaponSet() })(source);
    },
    () => {
      context.showLibrary("gear", "off-hands");
    },
  );
  handsGrid.append(weaponSlot.element, offhandSlot.element);
  section.appendChild(handsGrid);

  // --- weapon mods ----------------------------------------------------
  // Under each hand, a picker per slot its item has (#2008).
  const modsGrid = h("div", "gear-mods");
  const weaponMods = mountModPickers(context, "mainHand");
  const offhandMods = mountModPickers(context, "offHand");
  modsGrid.append(weaponMods.element, offhandMods.element);
  section.appendChild(modsGrid);

  // --- attribute nominations ------------------------------------------
  // Only shown for gear that genuinely has a choice to make. A sword is
  // always Swordsmanship, and offering a one-option dropdown would imply
  // otherwise. The headgear always has one (#1140), so the row is always
  // there, the weapon's and the off-hand's ahead of it.
  const linkRow = h("div", "editor-row");
  const weaponLink = mountSelectRow((value) => {
    commit(setRequirementAttribute(current(), context.weaponSet(), "mainHand", value));
  });
  const offhandLink = mountSelectRow((value) => {
    commit(setRequirementAttribute(current(), context.weaponSet(), "offHand", value));
  });
  const headgearLink = mountSelectRow((value) => {
    commit(setHeadgearAttribute(current(), value));
  });
  section.appendChild(linkRow);

  // --- armor ----------------------------------------------------------
  const armorHeader = h("div", "editor-subheader");
  armorHeader.appendChild(h("span", "editor-label", "Armor"));
  armorHeader.appendChild(
    button("Clear upgrades", "editor-clear-armor", () => {
      commit(clearArmorUpgrades(current()));
    }),
  );
  section.appendChild(armorHeader);

  // The figure, a piece clicked picks its insignia and rune (#2059). The
  // headgear's attribute sits on the headgear's row.
  headgearLink.element.classList.add("editor-headgear");
  doll.headgearSlot.appendChild(headgearLink.element);
  section.appendChild(doll.element);

  // --- the summary ------------------------------------------------------
  // What the gear adds beyond the headline stats, which sit under the
  // arena (#571).
  const stats = h("div", "gear-stats");
  panel.appendChild(section);

  return {
    update(character) {
      const selected = context.weaponSet();
      const sets = character.equipment.weaponSets;
      // A set's problems mark its tab (#489), as a slot's mark the slot.
      const troubled = new Set(
        validateBuild(character).flatMap((problem) => {
          const match = SET_FIELD.exec(problem.field);
          return match === null ? [] : [Number(match[1])];
        }),
      );
      for (const entry of tabs) {
        const held = sets[entry.set];
        entry.tab.classList.toggle("is-selected", entry.set === selected);
        entry.tab.setAttribute("aria-selected", String(entry.set === selected));
        entry.tab.tabIndex = entry.set === selected ? 0 : -1;
        entry.tab.classList.toggle("is-empty", held === null);
        entry.tab.classList.toggle("has-problem", troubled.has(entry.set));
        entry.tab.title =
          held === null
            ? `Set ${String(entry.set + 1)}: empty`
            : `Set ${String(entry.set + 1)}: ${getWeapon(held.mainHand.weaponId)?.name ?? held.mainHand.weaponId}`;
        const signature =
          held === null ? "" : `${held.mainHand.weaponId}|${held.offHand?.offhandId ?? ""}`;
        if (signature !== entry.shown) {
          entry.shown = signature;
          const main = held === null ? undefined : gearIconImg(weaponIcon(held.mainHand.weaponId));
          const offhandId = held?.offHand?.offhandId;
          const off = offhandId === undefined ? undefined : gearIconImg(offhandIcon(offhandId));
          off?.classList.add("is-offhand");
          entry.icons.replaceChildren(
            ...(held === null ? [h("span", "gear-set-tab-add", "+")] : []),
            ...(main === undefined ? [] : [main]),
            ...(off === undefined ? [] : [off]),
          );
        }
        if (entry.clear !== undefined) {
          entry.clear.hidden = held === null;
        }
      }

      const held = sets[selected];
      const mainHand = held?.mainHand;
      const offHand = held?.offHand ?? null;
      const weapon = mainHand === undefined ? undefined : getWeapon(mainHand.weaponId);
      const offhandDefinition = offHand === null ? undefined : getOffhand(offHand.offhandId);
      weaponSlot.element.dataset.cause = `equipment.weaponSets[${String(selected)}].mainHand`;
      offhandSlot.element.dataset.cause = `equipment.weaponSets[${String(selected)}].offHand`;
      weaponSlot.update({
        filled: weapon?.name,
        emptyNote: "Add a weapon",
        icon: mainHand === undefined ? undefined : weaponIcon(mainHand.weaponId),
        detail:
          weapon === undefined
            ? undefined
            : `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
        dragSource:
          mainHand === undefined ? undefined : { from: "hand", set: selected, hand: "mainHand" },
      });
      offhandSlot.update({
        filled: offhandDefinition?.name,
        icon: offHand === null ? undefined : offhandIcon(offHand.offhandId),
        detail:
          offhandDefinition === undefined
            ? undefined
            : `+${String(offhandDefinition.baseBonus + offhandDefinition.metRequirementBonus)} ${offhandDefinition.kind}`,
        // Said in the slot itself rather than left for the player to
        // discover by dragging a shield onto it and seeing nothing happen.
        disabledNote:
          held === null
            ? "no weapon in this set"
            : canEquipOffhand(character, selected)
              ? undefined
              : "both hands full",
        dragSource: offHand === null ? undefined : { from: "hand", set: selected, hand: "offHand" },
        onClear: () => {
          commit(setOffhand(current(), context.weaponSet(), null));
        },
      });

      weaponMods.update(mainHand?.weaponId, mainHand?.upgrades);
      offhandMods.update(offHand?.offhandId, offHand?.upgrades);

      const weaponChoices =
        weapon?.requirement.kind === "chosen" ? weaponAttributeChoices(character, selected) : [];
      const offhandChoices =
        offHand === null ? [] : offhandAttributeChoices(character, offHand.offhandId);
      const attributeOptions = (ids: readonly string[]) =>
        ids.map((id) => ({ value: id, label: getAttribute(id)?.name ?? id }));
      if (weapon !== undefined && mainHand !== undefined && weaponChoices.length > 0) {
        weaponLink.update(
          `${weapon.name.toLowerCase()} attribute`,
          attributeOptions(weaponChoices),
          mainHand.requirementAttributeId ?? "",
        );
      }
      if (offHand !== null && offhandChoices.length > 0) {
        offhandLink.update(
          `${offhandDefinition?.name.toLowerCase() ?? "off-hand"} attribute`,
          attributeOptions(offhandChoices),
          offHand.requirementAttributeId ?? "",
        );
      }
      headgearLink.update(
        "+1",
        attributeOptions(headgearChoices(character)),
        character.equipment.armor.head.headgearAttributeId ?? "",
      );
      present(weaponLink.element, weaponChoices.length > 0, (node) => {
        linkRow.prepend(node);
      });
      present(offhandLink.element, offhandChoices.length > 0, (node) => {
        linkRow.appendChild(node);
      });
      present(linkRow, weaponChoices.length > 0 || offhandChoices.length > 0, (node) => {
        armorHeader.before(node);
      });

      doll.update(character);

      const lines = statLines(character, selected);
      stats.replaceChildren(...lines);
      present(stats, lines.length > 0, (node) => {
        section.appendChild(node);
      });
    },
  };
}

/**
 * The derived stats (#571): health, energy and its pips, armor, and what
 * the weapon deals. Built once and updated in place. An unmet weapon
 * requirement is said on the damage line, in red, with what it needs:
 * a player should not have to discover it by losing.
 */
function mountStats(): Region & { readonly element: HTMLElement } {
  const element = h("dl", "editor-stats");
  element.setAttribute("aria-label", "derived stats");
  const line = (key: string, label: string): HTMLElement => {
    const value = h("dd", "editor-stat-value");
    value.dataset.stat = key;
    element.append(h("dt", "editor-stat-label", label), value);
    return value;
  };
  const health = line("health", "health");
  const energy = line("energy", "energy");
  const armor = line("armor", "armor");
  const damage = line("damage", "damage");
  const needs = h("span", "editor-stat-needs");
  return {
    element,
    update(character) {
      // Set 1, beside the preview that shows it: a match starts with it (ADR-0036).
      const summary = summariseGear(character, 0);
      if (summary === undefined) {
        return;
      }
      health.textContent = String(summary.maxHealth);
      energy.textContent = `${String(summary.maxEnergy)} · ${String(summary.baseEnergyPips)} pips`;
      armor.textContent = String(summary.armor);
      damage.textContent = `${summary.damageRange} · ${summary.attackInterval}`;
      const unmet = summary.unmetRequirement;
      damage.classList.toggle("is-unmet", unmet !== undefined);
      if (unmet !== undefined) {
        const name = getAttribute(unmet.attributeId)?.name ?? unmet.attributeId;
        needs.textContent = `needs ${name} ${String(unmet.rank)}`;
        damage.append(" ", needs);
      }
    },
  };
}

/**
 * What set `set`'s gear adds beyond the headline stats; nothing takes
 * focus, so rebuilt.
 */
function statLines(character: StoredCharacter, set: WeaponSetIndex): HTMLElement[] {
  const summary = summariseGear(character, set);
  if (summary === undefined) {
    return [h("div", "gear-stat-note", "Empty set")];
  }
  const lines: HTMLElement[] = [];
  for (const bonus of summary.attributeBonuses) {
    lines.push(
      statLine(
        getAttribute(bonus.attributeId)?.name ?? bonus.attributeId,
        `+${String(bonus.bonus)}`,
      ),
    );
  }
  for (const line of summary.conditionalArmor) {
    lines.push(h("div", "gear-stat-note", line));
  }
  if (summary.flatPhysicalReduction > 0) {
    lines.push(
      h(
        "div",
        "gear-stat-note",
        `−${String(summary.flatPhysicalReduction)} physical damage per hit`,
      ),
    );
  }
  return lines;
}

function statLine(label: string, value: string): HTMLElement {
  const row = h("div", "gear-stat");
  row.appendChild(h("span", "gear-stat-label", label));
  row.appendChild(h("span", "gear-stat-value", value));
  return row;
}

/**
 * The gear library: everything you could equip, grouped and draggable.
 *
 * Deliberately the same box-and-drag vocabulary as the skill library —
 * same markup, same gestures. A player who has learned to build a skill
 * bar already knows how to use this.
 */
function mountGearLibrary(context: EditorContext): LibraryBody {
  const { current } = context;
  const host = h("div", "skill-groups");

  function box(options: {
    readonly name: string;
    readonly icon?: GearIcon | undefined;
    readonly detail: string;
    readonly drag: GearDragSource;
    readonly onClick: () => void;
  }): HTMLElement {
    const node = h("div", "skill-box gear-box");
    node.draggable = true;
    const name = h("span", "skill-box-name");
    const icon = gearIconImg(options.icon);
    if (icon !== undefined) {
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(options.name));
    node.appendChild(name);
    node.appendChild(h("span", "skill-box-cost", options.detail));
    node.addEventListener("dragstart", (event: DragEvent) => {
      event.dataTransfer?.setData("text/plain", encodeGearDrag(options.drag));
    });
    // Click-to-equip alongside dragging, as the skill library's Equip:
    // dragging is the nicer gesture and a poor only option on a trackpad.
    node.addEventListener("click", options.onClick);
    return node;
  }

  function group(name: string): HTMLElement {
    const section = h("div", "skill-group");
    section.dataset.group = name;
    const header = h("div", "skill-group-header");
    header.appendChild(h("span", "skill-group-name", name));
    section.appendChild(header);
    host.appendChild(section);
    return section;
  }

  // --- weapons ---------------------------------------------------------
  const weapons = group("weapons");
  const weaponBoxes = ALL_WEAPONS.map((weapon) => {
    const node = box({
      name: weapon.name,
      icon: weaponIcon(weapon.id),
      detail: `${String(weapon.damageMin)}–${String(weapon.damageMax)} · ${weapon.attackIntervalSeconds.toFixed(2)}s`,
      drag: { from: "weapon-library", weaponId: weapon.id },
      onClick: () => {
        commitGear(context, setWeapon(current(), context.weaponSet(), weapon.id));
      },
    });
    weapons.appendChild(node);
    return { id: weapon.id, node };
  });

  // --- off-hands -------------------------------------------------------
  const offhands = group("off-hands");
  const offhandBoxes = ALL_OFFHANDS.map((offhand) => {
    const node = box({
      name: offhand.name,
      icon: offhandIcon(offhand.id),
      detail: `+${String(offhand.baseBonus + offhand.metRequirementBonus)} ${offhand.kind}`,
      drag: { from: "offhand-library", offhandId: offhand.id },
      onClick: () => {
        commitGear(context, setOffhand(current(), context.weaponSet(), offhand.id));
      },
    });
    offhands.appendChild(node);
    return { id: offhand.id, node };
  });

  return {
    elements: [host],
    update(character) {
      const held = character.equipment.weaponSets[context.weaponSet()];
      for (const { id, node } of weaponBoxes) {
        node.classList.toggle("is-equipped", id === held?.mainHand.weaponId);
      }
      for (const { id, node } of offhandBoxes) {
        node.classList.toggle("is-equipped", id === held?.offHand?.offhandId);
      }
    },
  };
}
