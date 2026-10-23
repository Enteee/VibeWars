import type { AttributeAllocation } from "./attributes.js";
import { cumulativeCostForRank, MAX_ATTRIBUTE_RANK } from "./attributes.js";
import { getAttribute, getProfession, type ProfessionId } from "./professions.js";
import type { AttributeRules } from "./ruleset.js";

/**
 * A character: identity, primary/secondary profession, and attribute
 * allocation (brief §5). The skill bar is deliberately not here yet — it
 * depends on the skill engine (Sprint 10), and bolting an empty/placeholder
 * skill-bar field on now would be exactly the kind of premature shape-
 * guessing the brief warns against (§45).
 */
export interface Character {
  readonly id: string;
  readonly name: string;
  readonly primaryProfession: ProfessionId;
  /** `undefined` if no secondary profession has been chosen yet. */
  readonly secondaryProfession: ProfessionId | undefined;
  readonly attributes: readonly AttributeAllocation[];
}

export class CharacterValidationError extends Error {
  public override readonly name = "CharacterValidationError";
}

/**
 * Every attribute this character is allowed to invest in: all four of the
 * primary profession's attributes (including its primary attribute), plus
 * only the secondary profession's *non-primary* attributes.
 *
 * This is the real structural rule the whole system hinges on: a character
 * never gets to raise another profession's primary attribute just by
 * taking that profession as secondary (brief's example team "Warrior /
 * Monk" gets Strength + Axe Mastery/Swordsmanship/Tactics +
 * Healing/Protection/Smiting Prayers, but never Divine Favor).
 */
export function accessibleAttributeIds(
  primaryProfession: ProfessionId,
  secondaryProfession: ProfessionId | undefined,
): readonly string[] {
  const primary = getProfession(primaryProfession).attributes.map((attr) => attr.id);
  if (secondaryProfession === undefined) {
    return primary;
  }
  const secondary = getProfession(secondaryProfession)
    .attributes.filter((attr) => !attr.isPrimary)
    .map((attr) => attr.id);
  return [...primary, ...secondary];
}

/**
 * Validate a character against the structural rules above plus a point
 * budget (`rules` is normally a ruleset's `attributes` field — see
 * `ruleset.ts`). Throws with every problem named at once (not just the
 * first) so a build editor can show a user everything wrong in one pass
 * rather than a frustrating fix-one-error-at-a-time loop. Called both before
 * saving and after loading (brief §23 — persisted data can go stale when
 * rules change).
 */
export function validateCharacter(character: Character, rules: AttributeRules): void {
  const problems: string[] = [];

  if (character.name.trim() === "") {
    problems.push("name must not be empty");
  }

  if (character.secondaryProfession === character.primaryProfession) {
    problems.push("secondary profession must differ from primary profession");
  }

  const accessible = new Set(
    accessibleAttributeIds(character.primaryProfession, character.secondaryProfession),
  );

  const seenAttributeIds = new Set<string>();
  for (const allocation of character.attributes) {
    if (seenAttributeIds.has(allocation.attributeId)) {
      problems.push(`duplicate allocation for attribute ${allocation.attributeId}`);
    }
    seenAttributeIds.add(allocation.attributeId);

    const attribute = getAttribute(allocation.attributeId);
    if (attribute === undefined) {
      problems.push(`unknown attribute id ${allocation.attributeId}`);
      continue;
    }
    if (!accessible.has(allocation.attributeId)) {
      problems.push(
        `attribute ${allocation.attributeId} is not accessible to a ` +
          `${character.primaryProfession}/${character.secondaryProfession ?? "none"} character`,
      );
    }
    if (
      !Number.isInteger(allocation.rank) ||
      allocation.rank < 0 ||
      allocation.rank > MAX_ATTRIBUTE_RANK
    ) {
      problems.push(
        `attribute ${allocation.attributeId} rank ${String(allocation.rank)} is outside ` +
          `[0, ${String(MAX_ATTRIBUTE_RANK)}]`,
      );
    }
  }

  const validRankAllocations = character.attributes.filter(
    (a) => Number.isInteger(a.rank) && a.rank >= 0 && a.rank <= MAX_ATTRIBUTE_RANK,
  );
  const spent = validRankAllocations.reduce(
    (sum, allocation) => sum + cumulativeCostForRank(allocation.rank),
    0,
  );
  if (spent > rules.attributePointBudget) {
    problems.push(
      `attribute allocation costs ${String(spent)} points, over the ` +
        `${String(rules.attributePointBudget)}-point budget`,
    );
  }

  if (problems.length > 0) {
    throw new CharacterValidationError(
      `Invalid character:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
  }
}
