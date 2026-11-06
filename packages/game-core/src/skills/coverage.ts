import { IMPLEMENTED_SKILLS } from "./catalog.js";

/**
 * Skill coverage reporting (brief §9, §29).
 *
 * The brief is explicit that a skill existing in the database is NOT the
 * same as it being implemented, and that coverage must never be faked.
 * This makes the distinction machine-readable so CI can assert on it and
 * a future build UI can show implementation status per skill.
 *
 * Reporting a count alone would be a weak form of honesty: "7 skills
 * unimplemented" invites the reader to assume the work is nearly done.
 * Naming the *mechanic* each one is waiting on is the useful statement,
 * because it says what would have to be built, and it makes the silent
 * failure mode — adding a corpus skill nobody ever looks at again —
 * impossible to miss. `coverage.test.ts` fails if an unimplemented skill
 * has no recorded reason.
 */

/**
 * A simulation capability `game-core` does not have yet.
 *
 * Deliberately a closed union rather than free text: a typo in a reason
 * string would quietly create a new "mechanic" and split the report, and
 * grouping skills by what they are waiting on is the whole point.
 */
export type MissingMechanic =
  | "unwritten"
  | "distance-trigger"
  | "count-disabled-own-skills"
  | "double-strike-bonus"
  | "count-overcast"
  | "nearest-spirit-energy-drain"
  | "while-near-spirit"
  | "weapon-element"
  | "weapon-filter-negation";

/** What each missing mechanic would mean to build, in one line. */
export const MISSING_MECHANIC_DESCRIPTIONS: Readonly<Record<MissingMechanic, string>> =
  Object.freeze({
    unwritten: "not a mechanic: the engine has every piece, only the catalog entry is missing",
    "distance-trigger": "an effect fires after the bearer moves a distance",
    "count-disabled-own-skills": "a magnitude counts how many of your skills are recharging",
    "double-strike-bonus": "an attack strikes twice and the second strike has its own bonus",
    "count-overcast": "a magnitude counts your Overcast",
    "nearest-spirit-energy-drain": "Energy is stolen from the nearest spirit",
    "while-near-spirit": "an effect holds while the bearer is within range of a spirit",
    "weapon-element": "the wielder's weapon deals an element's damage",
    "weapon-filter-negation": "a bonus applies with every weapon except one type",
  });

/**
 * Why each corpus skill with no catalog entry is not in the catalog, keyed
 * by GW1 id. Several mechanics per skill where the skill genuinely needs
 * all of them, since naming one alone would understate the work.
 *
 * Shrink-only: a card that adds one of these skills deletes its line, and
 * `coverage-gate.test.ts` fails on any key whose skill is implemented.
 */
export const UNIMPLEMENTED_REASONS: Readonly<Record<number, readonly MissingMechanic[]>> =
  Object.freeze({
    14: ["unwritten"], // Mantra of Persistence
    253: ["unwritten"], // Scourge Sacrifice
    265: ["unwritten"], // Amity
    305: ["unwritten"], // Resurrect
    815: ["distance-trigger"], // Scorpion Wire
    847: ["unwritten"], // Boon Signet
    990: ["count-disabled-own-skills"], // Expunge Enchantments
    1030: ["double-strike-bonus"], // Locust's Fury
    1056: ["unwritten"], // Kitah's Burden
    1088: ["count-overcast"], // Second Wind
    1091: ["unwritten"], // Double Dragon
    1093: ["unwritten"], // Teinai's Heat
    1119: ["unwritten"], // Karei's Healing Circle
    1133: ["unwritten"], // Drunken Blow
    1137: ["unwritten"], // Yeti Smash
    1222: ["unwritten"], // Lively Was Naomei
    1228: ["nearest-spirit-energy-drain"], // Spirit Siphon
    1244: ["while-near-spirit"], // Ghostly Haste
    1372: ["unwritten"], // Sandstorm
    1391: ["unwritten"], // Supportive Spirit
    1658: ["unwritten"], // Symbolic Posture
    1731: ["unwritten"], // Vocal Was Sogolon
    1737: ["unwritten"], // Wielder's Zeal
    1738: ["unwritten"], // Sight Beyond Sight
    1740: ["unwritten"], // Wielder's Remedy
    1744: ["unwritten"], // Caretaker's Charge
    1760: ["weapon-element"], // Ebon Dust Aura
    1764: ["unwritten"], // Attacker's Insight
    2011: ["unwritten"], // Grapple
    2060: ["unwritten"], // Glyph of Immolation
    2067: ["unwritten"], // "I Meant to Do That!"
    2187: ["weapon-filter-negation"], // Way of the Master
    2189: ["unwritten"], // Angorodon's Gaze
    2194: ["unwritten"], // Distracting Strike
    2195: ["unwritten"], // Symbolic Strike
    2201: ["unwritten"], // Shield of Force
    2208: ["unwritten"], // Burning Shield
  });

/** A corpus skill as coverage needs it: its GW1 id and name. */
export interface CorpusRef {
  readonly gwId: number;
  readonly name: string;
}

export interface UnimplementedSkill {
  readonly gwId: number;
  readonly name: string;
  /**
   * The mechanics this skill is waiting on. Empty means nobody recorded a
   * reason — which is the exact gap this module exists to surface, so it
   * is reported rather than defaulted to something plausible.
   */
  readonly missing: readonly MissingMechanic[];
}

export interface SkillCoverage {
  /** Skills in the reference corpus, counted once per GW1 id. */
  readonly imported: number;
  /** Corpus skills some catalog skill implements, by GW1 id. */
  readonly implemented: number;
  /** Corpus skills with no implementation yet, and why. */
  readonly unimplemented: readonly UnimplementedSkill[];
  /** Catalog skills that are this project's own design: no corpus GW1 id. */
  readonly originalDesign: readonly string[];
  /**
   * Unimplemented skills with no recorded reason, by GW1 id. Always empty
   * in a healthy repository; `coverage-gate.test.ts` is what keeps it so.
   */
  readonly unexplained: readonly number[];
}

/**
 * Compute coverage against the corpus, by GW1 id.
 *
 * Takes the corpus as a parameter rather than importing
 * `@vibewars/game-data` directly: `game-core` must stay dependency-free
 * (ADR-0001), and the caller (a CLI, a test, a future build UI) is the
 * one that already has the corpus loaded.
 */
export function computeCoverage(corpus: readonly CorpusRef[]): SkillCoverage {
  const implementedIds = new Set(
    IMPLEMENTED_SKILLS.flatMap((skill) => (skill.gwId === undefined ? [] : [skill.gwId])),
  );
  const byId = new Map(corpus.map((skill) => [skill.gwId, skill]));

  const unimplemented = [...byId.values()]
    .filter((skill) => !implementedIds.has(skill.gwId))
    .sort((a, b) => a.gwId - b.gwId)
    .map((skill) => ({
      gwId: skill.gwId,
      name: skill.name,
      missing: UNIMPLEMENTED_REASONS[skill.gwId] ?? [],
    }));

  const originalDesign = IMPLEMENTED_SKILLS.filter(
    (skill) => skill.gwId === undefined || !byId.has(skill.gwId),
  )
    .map((skill) => skill.id)
    .sort();

  return {
    imported: byId.size,
    implemented: byId.size - unimplemented.length,
    unimplemented,
    originalDesign,
    unexplained: unimplemented.filter((s) => s.missing.length === 0).map((s) => s.gwId),
  };
}

/**
 * Catalog skills the corpus marks as upkeep that are not maintained here
 * (#840): an upkeep skill implemented as a timed enchantment would be a
 * different skill wearing its name. Takes the imported upkeep ids for the
 * same reason `computeCoverage` takes the imported ids. Empty is healthy.
 */
export function unmaintainedUpkeepSkills(upkeepSkillIds: readonly string[]): readonly string[] {
  const upkeep = new Set(upkeepSkillIds);
  return IMPLEMENTED_SKILLS.filter(
    (skill) =>
      upkeep.has(skill.id) && !skill.effects.some((effect) => effect.kind === "maintain-status"),
  )
    .map((skill) => skill.id)
    .sort();
}

/** Group unimplemented skills (GW1 ids) by the mechanic they are waiting on. */
export function missingMechanics(
  coverage: SkillCoverage,
): ReadonlyMap<MissingMechanic, readonly number[]> {
  const grouped = new Map<MissingMechanic, number[]>();
  for (const skill of coverage.unimplemented) {
    for (const mechanic of skill.missing) {
      const existing = grouped.get(mechanic);
      if (existing === undefined) {
        grouped.set(mechanic, [skill.gwId]);
      } else {
        existing.push(skill.gwId);
      }
    }
  }
  return grouped;
}

export function formatCoverage(coverage: SkillCoverage): string {
  const lines = [
    `imported ${String(coverage.imported)} / implemented ${String(coverage.implemented)} / ${String(coverage.unimplemented.length)} unimplemented`,
    ...coverage.unimplemented.map((skill) => {
      const why = skill.missing.length === 0 ? "NO REASON RECORDED" : skill.missing.join(", ");
      return `  - ${String(skill.gwId)} ${skill.name} — needs ${why}`;
    }),
  ];

  const grouped = missingMechanics(coverage);
  if (grouped.size > 0) {
    lines.push("", "blocked on:");
    for (const [mechanic, ids] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(
        `  ${mechanic} (${String(ids.length)}) — ${MISSING_MECHANIC_DESCRIPTIONS[mechanic]}`,
      );
    }
  }

  if (coverage.originalDesign.length > 0) {
    lines.push(
      "",
      `original-design skills not from the corpus (${String(coverage.originalDesign.length)}):`,
      ...coverage.originalDesign.map((id) => `  - ${id}`),
    );
  }
  return lines.join("\n");
}
