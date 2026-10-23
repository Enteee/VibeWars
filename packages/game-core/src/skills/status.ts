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
 *
 * Re-application does not stack duration (GW1-style): the longer of the
 * existing and incoming duration wins. That single rule is why a spammed
 * short condition cannot out-last one well-timed long one.
 */

export type StatusCategory = "condition" | "hex" | "enchantment";

export type StatusId =
  // Conditions (brief §12's starting set).
  | "bleeding"
  | "burning"
  | "poison"
  | "crippled"
  | "blind"
  | "weakness"
  | "deep-wound"
  | "dazed"
  // Hexes / enchantments implemented so far.
  | "life-drain"
  | "regeneration"
  | "armor-boost";

export interface StatusDefinition {
  readonly id: StatusId;
  readonly name: string;
  readonly category: StatusCategory;
  /**
   * Health change per second while active. Negative drains, positive
   * regenerates. Applied continuously by the status tick, not in lumps.
   */
  readonly healthPerSecond: number;
  /** Flat armor modifier while active. */
  readonly armorModifier: number;
  /** Movement speed multiplier while active (1 = unaffected). */
  readonly moveSpeedMultiplier: number;
  /**
   * Chance in [0, 1] that the bearer's *attacks* miss. Drawn from the
   * injectable simulation RNG, never Math.random (brief §35).
   */
  readonly attackMissChance: number;
  /** Multiplier on the bearer's maximum health (deep wound's signature). */
  readonly maxHealthMultiplier: number;
  /** While true, the bearer cannot cast spells (dazed is the near-miss: it
   *  makes casting interruptible, handled separately in interrupts). */
  readonly preventsSpellCasting: boolean;
  /** Multiplier on the bearer's cast time; >1 is a penalty. */
  readonly castTimeMultiplier: number;
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
    healthPerSecond: 0,
    armorModifier: 0,
    moveSpeedMultiplier: 1,
    attackMissChance: 0,
    maxHealthMultiplier: 1,
    preventsSpellCasting: false,
    castTimeMultiplier: 1,
    ...overrides,
  };
}

/**
 * Status definitions. Numbers are this project's own tuning, chosen to
 * preserve each effect's *mechanical identity* (bleeding is a slow drain,
 * burning a fast one, deep wound a healing-reduction, blind an attack
 * denial) rather than to replicate any specific proprietary value table.
 */
export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = {
  bleeding: define("bleeding", "Bleeding", "condition", { healthPerSecond: -3 }),
  burning: define("burning", "Burning", "condition", { healthPerSecond: -7 }),
  poison: define("poison", "Poison", "condition", { healthPerSecond: -4 }),
  crippled: define("crippled", "Crippled", "condition", { moveSpeedMultiplier: 0.5 }),
  blind: define("blind", "Blind", "condition", { attackMissChance: 0.9 }),
  weakness: define("weakness", "Weakness", "condition", { armorModifier: -20 }),
  "deep-wound": define("deep-wound", "Deep Wound", "condition", { maxHealthMultiplier: 0.8 }),
  dazed: define("dazed", "Dazed", "condition", { castTimeMultiplier: 2 }),

  "life-drain": define("life-drain", "Life Drain", "hex", { healthPerSecond: -2 }),
  regeneration: define("regeneration", "Regeneration", "enchantment", { healthPerSecond: 4 }),
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", { armorModifier: 24 }),
};

export interface ActiveStatus {
  readonly id: StatusId;
  /** Seconds of duration still remaining. */
  remainingSeconds: number;
  /** Who applied it — needed so a future "when this ends, heal the caster"
   *  effect knows whom to credit. */
  readonly sourceId: string;
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
   * one never shortens a longer one already running.
   */
  public apply(id: StatusId, durationSeconds: number, sourceId: string): void {
    if (durationSeconds <= 0) {
      return;
    }
    const existing = this.#statuses.get(id);
    if (existing !== undefined && existing.remainingSeconds >= durationSeconds) {
      return;
    }
    this.#statuses.set(id, { id, remainingSeconds: durationSeconds, sourceId });
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

/* -------------------------------------------------------------------------- */
/* Aggregated modifiers                                                        */
/* -------------------------------------------------------------------------- */

export interface StatusModifiers {
  readonly healthPerSecond: number;
  readonly armorModifier: number;
  readonly moveSpeedMultiplier: number;
  readonly attackMissChance: number;
  readonly maxHealthMultiplier: number;
  readonly preventsSpellCasting: boolean;
  readonly castTimeMultiplier: number;
}

/**
 * Collapse every active status into one set of modifiers.
 *
 * Additive effects (health-per-second, armor) sum; multiplicative ones
 * (move speed, max health, cast time) multiply; miss chance takes the
 * worst rather than compounding, so two blinding effects cannot push a
 * player past certain failure in a way that feels arbitrary.
 */
export function aggregateModifiers(statuses: readonly ActiveStatus[]): StatusModifiers {
  let healthPerSecond = 0;
  let armorModifier = 0;
  let moveSpeedMultiplier = 1;
  let attackMissChance = 0;
  let maxHealthMultiplier = 1;
  let preventsSpellCasting = false;
  let castTimeMultiplier = 1;

  for (const status of statuses) {
    const def = getStatusDefinition(status.id);
    healthPerSecond += def.healthPerSecond;
    armorModifier += def.armorModifier;
    moveSpeedMultiplier *= def.moveSpeedMultiplier;
    attackMissChance = Math.max(attackMissChance, def.attackMissChance);
    maxHealthMultiplier *= def.maxHealthMultiplier;
    preventsSpellCasting = preventsSpellCasting || def.preventsSpellCasting;
    castTimeMultiplier *= def.castTimeMultiplier;
  }

  return {
    healthPerSecond,
    armorModifier,
    moveSpeedMultiplier,
    attackMissChance,
    maxHealthMultiplier,
    preventsSpellCasting,
    castTimeMultiplier,
  };
}
