/**
 * Conditions, hexes and enchantments (brief §12–§13).
 *
 * All three are *timed status effects* on a combatant and share one
 * lifecycle (apply → tick → expire/remove), so they share one
 * implementation parameterised by `category` rather than three parallel
 * systems that would inevitably drift apart. What differs between them is
 * genuine game rules, encoded as data here:
 *
 * - `condition`  — negative, applied by foes, removed by condition removal.
 * - `hex`        — negative, applied by foes, removed by hex removal.
 * - `enchantment`— positive, applied by allies, removed by enchantment removal/strip.
 * - `stance`     — positive, on yourself only, ended by stance removal (#465).
 * - `preparation`— on yourself only; changes your attacks while it lasts (#525).
 * - `glyph`      — on yourself only; changes your next spells, then is gone (#526).
 * - `shout`      — a shout's lingering effect (#524); no removal touches it.
 * - `chant`      — a chant's lingering effect (#758); no removal touches it.
 * - `weapon-spell`— a spell on an ally's weapon (#758), one at a time; not
 *   an enchantment, so enchantment removal leaves it.
 * - `skill-effect`— none of GW1's removable kinds: Healing Signet's armor
 *   loss while it is activated. No removal touches it either.
 *
 * Re-application does not stack duration (GW1-style): the longer of the
 * existing and incoming duration wins. That single rule is why a spammed
 * short condition cannot out-last one well-timed long one. An exclusive
 * category (`EXCLUSIVE_CATEGORIES`) is the exception: one at a time.
 */

import type { Combatant, SkillEffect } from "./types.js";

export type StatusCategory =
  | "condition"
  | "hex"
  | "enchantment"
  | "stance"
  | "preparation"
  | "glyph"
  | "shout"
  | "chant"
  | "weapon-spell"
  | "skill-effect";

/**
 * Categories of which a combatant has at most one at a time (GW1): a new
 * one ends whichever is up, the same one included, and starts at its full
 * duration.
 */
export const EXCLUSIVE_CATEGORIES: ReadonlySet<StatusCategory> = new Set([
  "stance",
  "preparation",
  "glyph",
  "weapon-spell",
]);

export type StatusId =
  // Conditions (brief §12's starting set).
  | "bleeding"
  | "burning"
  | "poison"
  | "crippled"
  | "blind"
  | "weakness"
  | "cracked-armor"
  | "deep-wound"
  | "dazed"
  // Hexes / enchantments implemented so far.
  | "life-drain"
  | "malaise"
  | "regeneration"
  | "blood-ritual"
  | "armor-boost"
  | "guardian"
  // Stances.
  | "sprint"
  | "dash"
  // Preparations.
  | "apply-poison"
  // Glyphs.
  | "glyph-of-lesser-energy"
  // Shouts and skill effects (#524).
  | "watch-yourself"
  | "healing-signet-armor"
  // Chants and weapon spells (#758).
  | "anthem-of-flame"
  | "weapon-of-warding";

/** Health one pip of regeneration or degeneration is worth, per second (GW1). */
export const HEALTH_PER_PIP = 2;
/** Energy one pip of regeneration is worth, per second (GW1). */
export const ENERGY_PER_PIP = 1 / 3;
/** The most pips a net regeneration or degeneration can reach, either way (GW1). */
export const MAX_PIPS = 10;

/** A net pip count as it applies: clamped to `MAX_PIPS` either way. */
export function clampPips(pips: number): number {
  return Math.max(-MAX_PIPS, Math.min(MAX_PIPS, pips));
}

/**
 * A chance to block incoming attacks (#534): a blocked attack does nothing.
 * `against` says which attacks: melee blows, projectiles, or both. Spells
 * are never blocked.
 */
export interface BlockRule {
  readonly chance: number;
  readonly against: "all" | "melee" | "projectile";
}

export interface StatusDefinition {
  readonly id: StatusId;
  readonly name: string;
  readonly category: StatusCategory;
  /**
   * Health regeneration while active, in GW1 pips (`HEALTH_PER_PIP`):
   * negative degenerates. Every status's pips sum, clamped to
   * `MAX_PIPS` either way, and apply continuously, not in lumps.
   */
  readonly healthPips: number;
  /** Energy regeneration while active, in pips (`ENERGY_PER_PIP`), summed with the base. */
  readonly energyPips: number;
  /** Flat armor modifier while active. */
  readonly armorModifier: number;
  /**
   * Armor taken before `armorModifier`s add, never below a floor (#763):
   * Cracked Armor's −20, not below 60. `undefined`: none.
   */
  readonly armorReduction: ArmorReduction | undefined;
  /** Movement speed multiplier while active (1 = unaffected). */
  readonly moveSpeedMultiplier: number;
  /**
   * Chance in [0, 1] that the bearer's *attacks* miss. Drawn from the
   * injectable simulation RNG, never Math.random (brief §35).
   */
  readonly attackMissChance: number;
  /** Multiplier on the bearer's maximum health (deep wound's signature). */
  readonly maxHealthMultiplier: number;
  /**
   * Multiplier on the bearer's spell cast time; >1 is a penalty. Dazed
   * doubles it. A signet or any other skill that is not a spell ignores
   * it (#524).
   */
  readonly castTimeMultiplier: number;
  /**
   * GW1's daze (#546): applying it interrupts a spell the bearer is
   * casting, and so does every attack that lands on the bearer while it
   * lasts. Anything that is not a spell is left alone.
   */
  readonly interruptsSpells: boolean;
  /**
   * Multiplier on how long the bearer's attacks take, swings and attack
   * skills alike; <1 is faster (ADR-0029). No status sets it yet: it is the
   * hook attack-speed skills plug into.
   */
  readonly attackDurationMultiplier: number;
  /** While active, a knockdown does nothing to the bearer (#468). No status sets it yet. */
  readonly preventsKnockdown: boolean;
  /** The bearer's chance to block attacks; `undefined`: none. */
  readonly block: BlockRule | undefined;
  /**
   * It ends after this many incoming attacks, each a hit or a block
   * (#524); `undefined`: only its duration ends it. Counted on each
   * bearer's own status, so allies sharing a shout wear theirs out apart.
   */
  readonly endsAfterAttacks: number | undefined;
  /**
   * Effects on whoever the bearer's physical attacks hit while it lasts
   * (#525): a preparation's rider, as Apply Poison's poison. Applied
   * where a blow lands, swing, attack skill or arrow alike, never on a
   * miss or a block.
   */
  readonly onAttackHit: readonly SkillEffect[];
  /**
   * What it does to the bearer's next spells (#526): each costs
   * `costReduction` less energy, and it ends once `count` spells have
   * started. `undefined`: spells leave it alone.
   */
  readonly nextSpells: NextSpells | undefined;
  /**
   * Effects on whoever the bearer's next attack skill hits (#758): a
   * chant's rider, as Anthem of Flame's burning. It ends when that attack
   * skill resolves, hit, miss or block, and applies only on a hit.
   * `undefined`: attack skills leave it alone.
   */
  readonly nextAttackSkill: readonly SkillEffect[] | undefined;
  /**
   * It ends the moment the bearer attacks (#758): strikes a blow or
   * releases a shot, swing or attack skill alike. A weapon spell's price.
   */
  readonly endsWhenBearerAttacks: boolean;
}

/** Armor taken, but never below `floor`, nor any armor already under it (#763). */
export interface ArmorReduction {
  readonly amount: number;
  readonly floor: number;
}

/** A glyph's hold on the next spells: how many, and how much cheaper (#526). */
export interface NextSpells {
  readonly count: number;
  readonly costReduction: number;
}

function define(
  id: StatusId,
  name: string,
  category: StatusCategory,
  overrides: Partial<Omit<StatusDefinition, "id" | "name" | "category">> = {},
): StatusDefinition {
  return {
    id,
    name,
    category,
    healthPips: 0,
    energyPips: 0,
    armorModifier: 0,
    armorReduction: undefined,
    moveSpeedMultiplier: 1,
    attackMissChance: 0,
    maxHealthMultiplier: 1,
    castTimeMultiplier: 1,
    interruptsSpells: false,
    attackDurationMultiplier: 1,
    preventsKnockdown: false,
    block: undefined,
    endsAfterAttacks: undefined,
    onAttackHit: [],
    nextSpells: undefined,
    nextAttackSkill: undefined,
    endsWhenBearerAttacks: false,
    ...overrides,
  };
}

/**
 * Status definitions. Pip counts are GW1's; the other numbers are this
 * project's own tuning, chosen to
 * preserve each effect's *mechanical identity* (bleeding is a slow drain,
 * burning a fast one, deep wound a healing-reduction, blind an attack
 * denial) rather than to replicate any specific proprietary value table.
 */
export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = {
  bleeding: define("bleeding", "Bleeding", "condition", { healthPips: -3 }),
  burning: define("burning", "Burning", "condition", { healthPips: -7 }),
  poison: define("poison", "Poison", "condition", { healthPips: -4 }),
  crippled: define("crippled", "Crippled", "condition", { moveSpeedMultiplier: 0.5 }),
  blind: define("blind", "Blind", "condition", { attackMissChance: 0.9 }),
  weakness: define("weakness", "Weakness", "condition", { armorModifier: -20 }),
  "cracked-armor": define("cracked-armor", "Cracked Armor", "condition", {
    armorReduction: { amount: 20, floor: 60 },
  }),
  "deep-wound": define("deep-wound", "Deep Wound", "condition", { maxHealthMultiplier: 0.8 }),
  dazed: define("dazed", "Dazed", "condition", { castTimeMultiplier: 2, interruptsSpells: true }),

  "life-drain": define("life-drain", "Life Drain", "hex", { healthPips: -2 }),
  malaise: define("malaise", "Malaise", "hex", { energyPips: -1 }),
  regeneration: define("regeneration", "Regeneration", "enchantment", { healthPips: 4 }),
  "blood-ritual": define("blood-ritual", "Blood Ritual", "enchantment", { energyPips: 3 }),
  // The slow is Armor of Earth's price: without it, +24 armor is free.
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", {
    armorModifier: 24,
    moveSpeedMultiplier: 0.75,
  }),
  guardian: define("guardian", "Guardian", "enchantment", {
    block: { chance: 0.5, against: "all" },
  }),

  sprint: define("sprint", "Sprint", "stance", { moveSpeedMultiplier: 1.25 }),
  dash: define("dash", "Dash", "stance", { moveSpeedMultiplier: 1.5 }),

  // "Watch Yourself!" at rank 12: +5...21 armor, ending after 1...3 attacks.
  "watch-yourself": define("watch-yourself", "Watch Yourself!", "shout", {
    armorModifier: 21,
    endsAfterAttacks: 3,
  }),
  "healing-signet-armor": define("healing-signet-armor", "Healing Signet", "skill-effect", {
    armorModifier: -40,
  }),

  // "Enemies struck by your physical attacks become poisoned for
  // 3...13...15 seconds": 13 s, its rank-12 value.
  "apply-poison": define("apply-poison", "Apply Poison", "preparation", {
    onAttackHit: [{ kind: "apply-status", statusId: "poison", durationSeconds: 13 }],
  }),

  // "Your next 2 spells cost 10...16...18 less Energy to cast": 16, its
  // rank-12 value; Energy Storage scaling waits for #532.
  "glyph-of-lesser-energy": define("glyph-of-lesser-energy", "Glyph of Lesser Energy", "glyph", {
    nextSpells: { count: 2, costReduction: 16 },
  }),

  // "The next attack skill used by each party member within earshot also
  // causes Burning for 1...3...3 seconds": 3 s, its rank-12 value.
  "anthem-of-flame": define("anthem-of-flame", "Anthem of Flame", "chant", {
    nextAttackSkill: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
  }),
  // "+2...4...4 Health regeneration and a 50% chance to block. Weapon of
  // Warding ends if that ally attacks."
  "weapon-of-warding": define("weapon-of-warding", "Weapon of Warding", "weapon-spell", {
    healthPips: 4,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerAttacks: true,
  }),
};

export interface ActiveStatus {
  readonly id: StatusId;
  /** Seconds of duration still remaining. */
  remainingSeconds: number;
  /** Incoming attacks before it ends (`endsAfterAttacks`); `undefined`: no such limit. */
  attacksLeft: number | undefined;
  /** Spells still to start before it ends (`nextSpells`); `undefined`: no such limit. */
  spellsLeft: number | undefined;
  /** Who applied it — needed so a future "when this ends, heal the caster"
   *  effect knows whom to credit. */
  readonly sourceId: string;
}

export function isStatusId(value: unknown): value is StatusId {
  return typeof value === "string" && Object.hasOwn(STATUS_DEFINITIONS, value);
}

/** Look up a status from an id of unknown provenance (a wire string, a tooltip). */
export function findStatusDefinition(id: string): StatusDefinition | undefined {
  return isStatusId(id) ? STATUS_DEFINITIONS[id] : undefined;
}

export function getStatusDefinition(id: StatusId): StatusDefinition {
  return STATUS_DEFINITIONS[id];
}

/**
 * All active statuses on one combatant, plus the lifecycle rules that
 * govern them.
 */
export class StatusSet {
  readonly #statuses = new Map<StatusId, ActiveStatus>();

  public get active(): readonly ActiveStatus[] {
    return [...this.#statuses.values()];
  }

  public has(id: StatusId): boolean {
    return this.#statuses.has(id);
  }

  public get(id: StatusId): ActiveStatus | undefined {
    return this.#statuses.get(id);
  }

  public get size(): number {
    return this.#statuses.size;
  }

  /**
   * Apply (or refresh) a status. Durations do not stack — the longer of
   * the existing and incoming duration wins, so re-applying a shorter
   * one never shortens a longer one already running. In an exclusive
   * category the new one replaces every one of its category, itself
   * included, at the incoming duration (a stance, #523).
   */
  public apply(id: StatusId, durationSeconds: number, sourceId: string): void {
    if (durationSeconds <= 0) {
      return;
    }
    const { category } = getStatusDefinition(id);
    if (EXCLUSIVE_CATEGORIES.has(category)) {
      this.removeByCategory(category);
    }
    const existing = this.#statuses.get(id);
    if (existing !== undefined && existing.remainingSeconds >= durationSeconds) {
      return;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      attacksLeft: getStatusDefinition(id).endsAfterAttacks,
      spellsLeft: getStatusDefinition(id).nextSpells?.count,
      sourceId,
    });
  }

  /** Remove every status, of every category: what a respawn leaves. */
  public clear(): void {
    this.#statuses.clear();
  }

  /** Remove one status by id. Returns whether anything was removed. */
  public remove(id: StatusId): boolean {
    return this.#statuses.delete(id);
  }

  /**
   * Remove up to `count` statuses of a category — the shape every
   * "remove a condition"/"strip an enchantment" skill needs. Returns the
   * ids actually removed, oldest-applied first, so a caller can report
   * exactly what it stripped.
   */
  public removeByCategory(category: StatusCategory, count = Number.POSITIVE_INFINITY): StatusId[] {
    const removed: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (removed.length >= count) {
        break;
      }
      if (getStatusDefinition(status.id).category === category) {
        removed.push(status.id);
      }
    }
    for (const id of removed) {
      this.#statuses.delete(id);
    }
    return removed;
  }

  /**
   * An attack hit the bearer or was blocked (#524): one fewer for every
   * status that ends after so many. Returns the ids that ended on it.
   */
  public countIncomingAttack(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.attacksLeft !== undefined) {
        status.attacksLeft -= 1;
        if (status.attacksLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    for (const id of ended) {
      this.#statuses.delete(id);
    }
    return ended;
  }

  /**
   * A spell of the bearer's started (#526): one fewer for every status
   * that holds the next spells. Returns the ids that ended on it.
   */
  public countSpellStarted(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.spellsLeft !== undefined) {
        status.spellsLeft -= 1;
        if (status.spellsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    for (const id of ended) {
      this.#statuses.delete(id);
    }
    return ended;
  }

  /**
   * The bearer attacked (#758): every status that ends when it does is
   * gone. Returns the ids that ended on it.
   */
  public endOnBearerAttack(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsWhenBearerAttacks)
      .map(({ id }) => id);
    for (const id of ended) {
      this.#statuses.delete(id);
    }
    return ended;
  }

  public countByCategory(category: StatusCategory): number {
    let count = 0;
    for (const status of this.#statuses.values()) {
      if (getStatusDefinition(status.id).category === category) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Advance all durations by `dt` seconds, dropping any that expire.
   * Returns the ids that expired on this tick so the caller can emit
   * end-of-status effects.
   */
  public advance(dt: number): StatusId[] {
    const expired: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      status.remainingSeconds -= dt;
      if (status.remainingSeconds <= 0) {
        expired.push(status.id);
      }
    }
    for (const id of expired) {
      this.#statuses.delete(id);
    }
    return expired;
  }
}

/**
 * How long a status lasts on `target`: its nominal duration, shortened
 * by the target's condition-duration runes (a Rune of Restoration takes
 * bleeding to 80%). Every path that puts a status on a combatant asks
 * this first, so a rune cannot work for skills and not for dummies. The
 * scale is the wearer's, never the caster's.
 */
export function scaledStatusDuration(
  target: Pick<Combatant, "equipment">,
  statusId: StatusId,
  durationSeconds: number,
): number {
  return durationSeconds * (target.equipment.statusDurationScale.get(statusId) ?? 1);
}

/* -------------------------------------------------------------------------- */
/* Aggregated modifiers                                                        */
/* -------------------------------------------------------------------------- */

export interface StatusModifiers {
  /** Every status's health pips, summed and not yet clamped. */
  readonly healthPips: number;
  /** Every status's energy pips, summed and not yet clamped. */
  readonly energyPips: number;
  readonly armorModifier: number;
  /** The largest armor reduction; `undefined`: none. */
  readonly armorReduction: ArmorReduction | undefined;
  readonly moveSpeedMultiplier: number;
  readonly attackMissChance: number;
  readonly maxHealthMultiplier: number;
  readonly castTimeMultiplier: number;
  readonly attackDurationMultiplier: number;
}

/**
 * Collapse every active status into one set of modifiers.
 *
 * Additive effects (health and energy pips, armor) sum; multiplicative ones
 * (move speed, max health, cast time) multiply; miss chance takes the
 * worst rather than compounding, so two blinding effects cannot push a
 * player past certain failure in a way that feels arbitrary. An armor
 * reduction is the largest single one.
 * Attack duration is GW1's rule: only the strongest speed-up and the
 * strongest slow-down count, and they multiply.
 */
export function aggregateModifiers(statuses: readonly ActiveStatus[]): StatusModifiers {
  let healthPips = 0;
  let energyPips = 0;
  let armorModifier = 0;
  let armorReduction: ArmorReduction | undefined;
  let moveSpeedMultiplier = 1;
  let attackMissChance = 0;
  let maxHealthMultiplier = 1;
  let castTimeMultiplier = 1;
  let attackFaster = 1;
  let attackSlower = 1;

  for (const status of statuses) {
    const def = getStatusDefinition(status.id);
    healthPips += def.healthPips;
    energyPips += def.energyPips;
    armorModifier += def.armorModifier;
    if (
      def.armorReduction !== undefined &&
      (armorReduction === undefined || def.armorReduction.amount > armorReduction.amount)
    ) {
      armorReduction = def.armorReduction;
    }
    moveSpeedMultiplier *= def.moveSpeedMultiplier;
    attackMissChance = Math.max(attackMissChance, def.attackMissChance);
    maxHealthMultiplier *= def.maxHealthMultiplier;
    castTimeMultiplier *= def.castTimeMultiplier;
    attackFaster = Math.min(attackFaster, def.attackDurationMultiplier);
    attackSlower = Math.max(attackSlower, def.attackDurationMultiplier);
  }

  return {
    healthPips,
    energyPips,
    armorModifier,
    armorReduction,
    moveSpeedMultiplier,
    attackMissChance,
    maxHealthMultiplier,
    castTimeMultiplier,
    attackDurationMultiplier: attackFaster * attackSlower,
  };
}
