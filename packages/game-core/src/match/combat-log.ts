import type { WeaponId } from "../equipment/weapons.js";
import type { CombatEvent } from "../skills/effects.js";

/**
 * The combat log: who did what to whom, and when (ADR-0017).
 *
 * `CombatEvent` deliberately says nothing about the attacker or the time.
 * Those are simulation facts, not effect facts, so they live on the
 * envelope here rather than widening the event union. The server already
 * sends this envelope on the wire (`{ casterSessionId, skillId, events }`);
 * this type formalises it and adds the tick, the time and the cause.
 */

/**
 * A cast, one participant's status tick, one landed weapon swing, or
 * something a primary attribute did by itself, with no skill or swing
 * behind it (#633): Soul Reaping's energy.
 */
export type CombatCause = "skill" | "degeneration" | "weapon" | "attribute";

/** One *resolution*: a cast, one participant's status tick, one swing, or an attribute's gain. */
export interface CombatLogEntry {
  readonly tick: number;
  readonly atSeconds: number;
  readonly cause: CombatCause;
  /**
   * Who is responsible. The caster for a skill, the attacker for a swing,
   * the bearer for an attribute.
   * For degeneration, whoever applied the statuses behind it when there is
   * exactly one such source, and `undefined` when several statuses from
   * different sources summed into one number: that is genuinely shared,
   * and is not guessed at.
   */
  readonly sourceId: string | undefined;
  readonly skillId: string | undefined;
  /** The weapon, on every `"weapon"` entry; `undefined` on every other (#162). */
  readonly weaponId: WeaponId | undefined;
  /** The attribute, on every `"attribute"` entry; `undefined` on every other (#633). */
  readonly attributeId: string | undefined;
  /** Where an area skill landed, and how far it reached. */
  readonly area: { readonly x: number; readonly y: number; readonly radius: number } | undefined;
  /** A weapon swing that struck twice (#561); `false` on every other entry. */
  readonly doubleStrike: boolean;
  readonly events: readonly CombatEvent[];
}

export interface CombatTally {
  readonly damageByActor: ReadonlyMap<string, number>;
  readonly healingByActor: ReadonlyMap<string, number>;
  readonly damageTakenByActor: ReadonlyMap<string, number>;
  /** Damage whose source could not be named; see `CombatLogEntry.sourceId`. */
  readonly unattributedDamage: number;
}

/** A tally that can still be added to. */
class TallyBuilder {
  readonly damageByActor = new Map<string, number>();
  readonly healingByActor = new Map<string, number>();
  readonly damageTakenByActor = new Map<string, number>();
  unattributedDamage = 0;

  add(entry: CombatLogEntry): void {
    for (const event of entry.events) {
      if (event.kind === "damage") {
        bump(this.damageTakenByActor, event.targetId, event.amount);
        if (entry.sourceId === undefined) {
          this.unattributedDamage += event.amount;
        } else if (event.targetId !== entry.sourceId) {
          // Damage to yourself is not damage dealt, as the headless
          // runner has always counted it.
          bump(this.damageByActor, entry.sourceId, event.amount);
        }
      } else if (event.kind === "heal" && entry.sourceId !== undefined) {
        bump(this.healingByActor, entry.sourceId, event.amount);
      } else if (event.kind === "health-lost" || event.kind === "life-stolen") {
        // Deep wound's health as it lands (#800), or health stolen (#935):
        // lost, but not damage dealt.
        bump(this.damageTakenByActor, event.targetId, event.amount);
      }
    }
  }
}

function bump(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/** Total damage dealt, healing done and damage taken, per participant. */
export function tallyCombat(entries: Iterable<CombatLogEntry>): CombatTally {
  const tally = new TallyBuilder();
  for (const entry of entries) {
    tally.add(entry);
  }
  return tally;
}

/** Sum of one kind of event credited to `actorId` across `entries`. */
function sumFor(
  entries: readonly CombatLogEntry[],
  actorId: string,
  kind: "damage" | "heal",
  sinceSeconds: number,
): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.sourceId !== actorId || entry.atSeconds <= sinceSeconds) {
      continue;
    }
    for (const event of entry.events) {
      if (event.kind === kind && (kind === "heal" || event.targetId !== actorId)) {
        total += event.amount;
      }
    }
  }
  return total;
}

/**
 * Damage and healing per second over a rolling window.
 *
 * Clock-free: the time comes from the entries and from the caller, never
 * from a wall clock, so the same log always reads the same numbers.
 */
export class CombatMeter {
  readonly #windowSeconds: number;
  #recent: CombatLogEntry[] = [];
  #totals = new TallyBuilder();

  public constructor(options: { windowSeconds?: number } = {}) {
    this.#windowSeconds = options.windowSeconds ?? 10;
  }

  public record(entry: CombatLogEntry): void {
    this.#recent.push(entry);
    this.#totals.add(entry);
    // Nothing older than one window can be asked about again.
    const horizon = entry.atSeconds - this.#windowSeconds;
    this.#recent = this.#recent.filter((kept) => kept.atSeconds > horizon);
  }

  public damagePerSecond(actorId: string, atSeconds: number): number {
    return this.#rate(actorId, "damage", atSeconds);
  }

  public healingPerSecond(actorId: string, atSeconds: number): number {
    return this.#rate(actorId, "heal", atSeconds);
  }

  /** Everything since the last reset. A snapshot: later records do not change it. */
  public totals(): CombatTally {
    return {
      damageByActor: new Map(this.#totals.damageByActor),
      healingByActor: new Map(this.#totals.healingByActor),
      damageTakenByActor: new Map(this.#totals.damageTakenByActor),
      unattributedDamage: this.#totals.unattributedDamage,
    };
  }

  public reset(): void {
    this.#recent = [];
    this.#totals = new TallyBuilder();
  }

  #rate(actorId: string, kind: "damage" | "heal", atSeconds: number): number {
    // Before a full window has passed, divide by the time there has been,
    // not by the whole window. At t=0 there has been none: report 0.
    const span = Math.min(this.#windowSeconds, atSeconds);
    if (span <= 0) {
      return 0;
    }
    return sumFor(this.#recent, actorId, kind, atSeconds - span) / span;
  }
}
