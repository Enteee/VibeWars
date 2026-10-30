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

/** Damage to yourself is not damage dealt, as the headless runner has always counted it. */
const notSelf = (sourceId: string, targetId: string): boolean => sourceId !== targetId;

/** A tally that can still be added to. */
class TallyBuilder {
  readonly damageByActor = new Map<string, number>();
  readonly healingByActor = new Map<string, number>();
  readonly damageTakenByActor = new Map<string, number>();
  unattributedDamage = 0;
  /** Whether damage `sourceId` did to `targetId` counts as dealt. */
  readonly #dealt: (sourceId: string, targetId: string) => boolean;

  constructor(dealt: (sourceId: string, targetId: string) => boolean) {
    this.#dealt = dealt;
  }

  add(entry: CombatLogEntry): void {
    for (const event of entry.events) {
      if (event.kind === "damage") {
        bump(this.damageTakenByActor, event.targetId, event.amount);
        if (entry.sourceId === undefined) {
          this.unattributedDamage += event.amount;
        } else if (this.#dealt(entry.sourceId, event.targetId)) {
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
  const tally = new TallyBuilder(notSelf);
  for (const entry of entries) {
    tally.add(entry);
  }
  return tally;
}

/** One player's line in the match summary (#1057). */
export interface MatchTallyRow {
  readonly damage: number;
  readonly healing: number;
  readonly taken: number;
  readonly kills: number;
  readonly deaths: number;
  readonly interrupts: number;
}

/**
 * A whole match's totals per participant, for the summary at its end
 * (#1057). Damage, healing and taken follow `tallyCombat`'s rules, except
 * that only damage to a foe is dealt: hurting an ally is not an
 * achievement. A kill is credited to the source of the entry that carries
 * the death, when that source is on the other team and the dead is a
 * member, a player or a bot: a creature's death, a Guild Lord's too, is no
 * kill (#1226). A death with no source, or by a teammate's hand, credits
 * nobody. An interrupt is a
 * successful one: `interrupted`, never `interrupt-missed`.
 */
export class MatchTally {
  readonly #teamOf: (id: string) => number | undefined;
  readonly #isMember: (id: string) => boolean;
  readonly #combat: TallyBuilder;
  readonly #kills = new Map<string, number>();
  readonly #deaths = new Map<string, number>();
  readonly #interrupts = new Map<string, number>();

  /**
   * `teamOf` says which team an id is on; kills and damage dealt need it.
   * `isMember` says whether an id is a player or a bot, whose death a kill is.
   */
  public constructor(
    teamOf: (id: string) => number | undefined,
    isMember: (id: string) => boolean,
  ) {
    this.#teamOf = teamOf;
    this.#isMember = isMember;
    this.#combat = new TallyBuilder((sourceId, targetId) => this.#foes(sourceId, targetId));
  }

  public add(entries: readonly CombatLogEntry[]): void {
    for (const entry of entries) {
      this.#combat.add(entry);
      for (const event of entry.events) {
        if (event.kind === "death") {
          bump(this.#deaths, event.targetId, 1);
          if (
            entry.sourceId !== undefined &&
            this.#isMember(event.targetId) &&
            this.#foes(entry.sourceId, event.targetId)
          ) {
            bump(this.#kills, entry.sourceId, 1);
          }
        } else if (
          (event.kind === "interrupted" || event.kind === "attack-interrupted") &&
          entry.sourceId !== undefined
        ) {
          bump(this.#interrupts, entry.sourceId, 1);
        }
      }
    }
  }

  /** Zeros for an id never seen. */
  public row(id: string): MatchTallyRow {
    return {
      damage: this.#combat.damageByActor.get(id) ?? 0,
      healing: this.#combat.healingByActor.get(id) ?? 0,
      taken: this.#combat.damageTakenByActor.get(id) ?? 0,
      kills: this.#kills.get(id) ?? 0,
      deaths: this.#deaths.get(id) ?? 0,
      interrupts: this.#interrupts.get(id) ?? 0,
    };
  }

  #foes(a: string, b: string): boolean {
    const teamA = this.#teamOf(a);
    const teamB = this.#teamOf(b);
    return teamA !== undefined && teamB !== undefined && teamA !== teamB;
  }
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
  #totals = new TallyBuilder(notSelf);

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
    this.#totals = new TallyBuilder(notSelf);
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
