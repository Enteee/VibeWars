import {
  STATUS_DEFINITIONS,
  getSkill,
  getWeapon,
  type CombatEvent,
  type CombatLogEntry,
} from "@vibewars/game-core";

/**
 * The Training Ground's combat log and meter, as pure functions (#2
 * §6.5). No DOM: the panel paints what these return, and vitest checks
 * them in node.
 */

export type LogTone = "damage" | "heal" | "resource" | "status" | "control" | "death" | "divider";

export interface LogRow {
  /** Seconds into the session, already formatted. */
  readonly time: string;
  readonly text: string;
  readonly tone: LogTone;
}

/** `m:ss.t`, the session clock as the log shows it. */
export function formatSimClock(seconds: number): string {
  const tenths = Math.max(0, Math.floor(seconds * 10));
  const minutes = Math.floor(tenths / 600);
  const rest = (tenths % 600) / 10;
  return `${String(minutes)}:${rest.toFixed(1).padStart(4, "0")}`;
}

/** The colour family of an event. Total over `CombatEvent["kind"]`: a new kind fails to compile here. */
export function logToneOf(kind: CombatEvent["kind"]): Exclude<LogTone, "divider"> {
  switch (kind) {
    case "damage":
    case "sacrifice":
      return "damage";
    case "heal":
      return "heal";
    case "energy-gain":
      return "resource";
    case "status-applied":
    case "status-removed":
    case "status-expired":
      return "status";
    case "interrupted":
    case "cancelled":
    case "interrupt-missed":
    case "attack-missed":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
      return "control";
    case "death":
      return "death";
  }
}

function skillName(skillId: string | undefined): string | undefined {
  return skillId === undefined ? undefined : (getSkill(skillId)?.name ?? skillId);
}

/** One event as a sentence a player can learn from. */
export function describeCombatEvent(
  entry: Pick<CombatLogEntry, "cause" | "sourceId" | "skillId" | "weaponId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
): string {
  const target = nameOf(event.targetId);
  const skill = skillName(entry.skillId);
  const source = entry.sourceId === undefined ? undefined : nameOf(entry.sourceId);
  // "Fireball (You)", "Longbow (You)" for a weapon swing (#162), or, for
  // a status tick, GW1's word for which way it went (#151): regeneration
  // heals, degeneration hurts. The source, when exactly one is known.
  const what =
    entry.cause === "weapon"
      ? (getWeapon(entry.weaponId ?? "")?.name ?? "a weapon")
      : entry.cause === "degeneration"
        ? event.kind === "heal"
          ? "regeneration"
          : "degeneration"
        : (skill ?? "a skill");
  const by = `${what}${source === undefined ? "" : ` (${source})`}`;
  switch (event.kind) {
    case "damage":
      return `${by} hits ${target} for ${formatAmount(event.amount)}${event.critical ? ", a critical hit" : ""}`;
    case "heal":
      return `${by} heals ${target} for ${formatAmount(event.amount)}`;
    case "energy-gain":
      return `${target} gains ${formatAmount(event.amount)} energy`;
    case "sacrifice":
      return `${target} sacrifices ${formatAmount(event.amount)} health`;
    case "death":
      return `${target} dies`;
    case "status-applied":
      return `${target} gains ${STATUS_DEFINITIONS[event.statusId].name} (${formatAmount(event.durationSeconds)} s)`;
    case "status-removed":
      return `${by} removes ${STATUS_DEFINITIONS[event.statusId].name} from ${target}`;
    case "status-expired":
      return `${STATUS_DEFINITIONS[event.statusId].name} ends on ${target}`;
    case "interrupted":
      return `${by} interrupts ${target}'s ${skillName(event.skillId) ?? event.skillId}`;
    case "cancelled":
      return `${target} cancels ${skillName(event.skillId) ?? event.skillId}`;
    case "interrupt-missed":
      return `${by} finds nothing to interrupt on ${target}`;
    case "attack-missed":
      return `${by} misses ${target}`;
    case "attack-dodged":
      return `${target} dodges ${by}`;
    case "attack-obstructed":
      return `${by} is obstructed on the way to ${target}`;
    case "attack-unreachable":
      return `${by} can't reach ${target}`;
  }
}

export function combatEventToRow(
  entry: Pick<CombatLogEntry, "atSeconds" | "cause" | "sourceId" | "skillId" | "weaponId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
): LogRow {
  return {
    time: formatSimClock(entry.atSeconds),
    text: describeCombatEvent(entry, event, nameOf),
    tone: logToneOf(event.kind),
  };
}

/** How long the log gathers a target's status ticks into one row. */
export const STATUS_TICK_WINDOW_SECONDS = 1;

interface TickWindow {
  readonly targetId: string;
  readonly kind: "damage" | "heal";
  readonly startedAt: number;
  amount: number;
  /** `undefined` when unknown, or when ticks from different sources met. */
  sourceId: string | undefined;
}

/**
 * Status ticks, summed (#151). The simulation logs degeneration and
 * regeneration every tick, 20 rows a second of fractions that print as
 * "0". This gathers them per target and direction into one row a second,
 * timed when the window closes, so the log's clock never runs backwards
 * past rows already written, and drops a sum that prints as 0.
 *
 * Anything else in a status entry (a death, an expiry) is written at
 * once, after that target's open windows, so nobody dies before the
 * damage that killed them. Skill and weapon entries pass straight through.
 */
export class StatusTickBatcher {
  readonly #open = new Map<string, TickWindow>();

  /** The rows `entry` makes ready now. */
  public push(entry: CombatLogEntry, nameOf: (id: string) => string): LogRow[] {
    const rows = this.advance(entry.atSeconds, nameOf);
    for (const event of entry.events) {
      if (entry.cause !== "degeneration") {
        // A skill or a swing can finish off someone still ticking too.
        if (event.kind === "death") {
          rows.push(
            ...this.#close(
              (open) => open.targetId === event.targetId,
              () => entry.atSeconds,
              nameOf,
            ),
          );
        }
        rows.push(combatEventToRow(entry, event, nameOf));
        continue;
      }
      if (event.kind === "damage" || event.kind === "heal") {
        const key = `${event.targetId}:${event.kind}`;
        const open = this.#open.get(key);
        if (open === undefined) {
          this.#open.set(key, {
            targetId: event.targetId,
            kind: event.kind,
            startedAt: entry.atSeconds,
            amount: event.amount,
            sourceId: entry.sourceId,
          });
        } else {
          open.amount += event.amount;
          if (open.sourceId !== entry.sourceId) {
            open.sourceId = undefined;
          }
        }
        continue;
      }
      rows.push(
        ...this.#close(
          (open) => open.targetId === event.targetId,
          () => entry.atSeconds,
          nameOf,
        ),
      );
      rows.push(combatEventToRow(entry, event, nameOf));
    }
    return rows;
  }

  /** Close the windows that are a full second old at `atSeconds`. */
  public advance(atSeconds: number, nameOf: (id: string) => string): LogRow[] {
    return this.#close(
      (open) => atSeconds >= open.startedAt + STATUS_TICK_WINDOW_SECONDS,
      (open) => open.startedAt + STATUS_TICK_WINDOW_SECONDS,
      nameOf,
    );
  }

  /** Close every window at `atSeconds`, as before a divider. */
  public flush(atSeconds: number, nameOf: (id: string) => string): LogRow[] {
    return this.#close(
      () => true,
      () => atSeconds,
      nameOf,
    );
  }

  /** Write the due windows, each stamped at `closedAt`, oldest first. */
  #close(
    due: (open: TickWindow) => boolean,
    closedAt: (open: TickWindow) => number,
    nameOf: (id: string) => string,
  ): LogRow[] {
    const closing = [...this.#open.entries()]
      .filter(([, open]) => due(open))
      .sort(([, a], [, b]) => a.startedAt - b.startedAt);
    const rows: LogRow[] = [];
    for (const [key, open] of closing) {
      this.#open.delete(key);
      if (formatAmount(open.amount) === "0") {
        continue;
      }
      rows.push(
        combatEventToRow(
          {
            atSeconds: closedAt(open),
            cause: "degeneration",
            sourceId: open.sourceId,
            skillId: undefined,
            weaponId: undefined,
          },
          open.kind === "damage"
            ? { kind: open.kind, targetId: open.targetId, amount: open.amount, critical: false }
            : { kind: open.kind, targetId: open.targetId, amount: open.amount },
          nameOf,
        ),
      );
    }
    return rows;
  }
}

/** A `── re-armed ──` line: something changed, and the meter restarted. */
export function dividerRow(label: string, atSeconds: number): LogRow {
  return { time: formatSimClock(atSeconds), text: `── ${label} ──`, tone: "divider" };
}

/**
 * The log after `incoming` arrives, keeping the newest `cap` rows.
 * `dropped` is how many came off the front, so the DOM can remove
 * exactly those instead of rebuilding.
 */
export function appendRows(
  existing: readonly LogRow[],
  incoming: readonly LogRow[],
  cap: number,
): { readonly rows: readonly LogRow[]; readonly dropped: number } {
  const all = [...existing, ...incoming];
  const dropped = Math.max(0, all.length - cap);
  return { rows: all.slice(dropped), dropped };
}

/**
 * Whether the log should follow new rows. Measured *before* appending:
 * a reader who scrolled up to read is left where they are.
 */
export function shouldStickToBottom(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= 4;
}

/** What the meter adds up, for the player, since the last reset. */
export interface MeterTotals {
  readonly damage: number;
  /** The part of `damage` the weapon did; the rest is skills and statuses (#162). */
  readonly weaponDamage: number;
  readonly healing: number;
  readonly taken: number;
  readonly seconds: number;
}

export const EMPTY_TOTALS: MeterTotals = {
  damage: 0,
  weaponDamage: 0,
  healing: 0,
  taken: 0,
  seconds: 0,
};

/**
 * Add one step's entries to the player's totals. Damage to yourself is
 * not damage dealt, as `tallyCombat` counts it; healing yourself is
 * healing done.
 */
export function accumulate(
  totals: MeterTotals,
  entries: readonly CombatLogEntry[],
  selfId: string,
  stepSeconds: number,
): MeterTotals {
  let { damage, weaponDamage, healing, taken } = totals;
  for (const entry of entries) {
    for (const event of entry.events) {
      if (event.kind === "damage") {
        if (event.targetId === selfId) {
          taken += event.amount;
        } else if (entry.sourceId === selfId) {
          damage += event.amount;
          if (entry.cause === "weapon") {
            weaponDamage += event.amount;
          }
        }
      } else if (event.kind === "heal" && entry.sourceId === selfId) {
        healing += event.amount;
      }
    }
  }
  return { damage, weaponDamage, healing, taken, seconds: totals.seconds + stepSeconds };
}

/** An amount over a time, with no time reading as 0 rather than `Infinity`. */
export function perSecond(amount: number, seconds: number): number {
  return seconds > 0 ? amount / seconds : 0;
}

export function formatAmount(amount: number): string {
  return String(Math.round(amount));
}

export function formatRate(rate: number): string {
  return rate.toFixed(1);
}

export interface MeterRow {
  readonly label: string;
  readonly value: string;
}

export function meterRows(totals: MeterTotals): readonly MeterRow[] {
  return [
    { label: "dps", value: formatRate(perSecond(totals.damage, totals.seconds)) },
    { label: "hps", value: formatRate(perSecond(totals.healing, totals.seconds)) },
    { label: "damage", value: formatAmount(totals.damage) },
    {
      label: "weapon / skills",
      value: `${formatAmount(totals.weaponDamage)} / ${formatAmount(totals.damage - totals.weaponDamage)}`,
    },
    { label: "healing", value: formatAmount(totals.healing) },
    { label: "taken", value: formatAmount(totals.taken) },
    { label: "time", value: formatSimClock(totals.seconds) },
  ];
}

export interface FloatingCue {
  readonly text: string;
  readonly tone: "damage" | "heal" | "neutral";
  /** A critical hit (#533): drawn larger, whatever dealt it. */
  readonly critical: boolean;
}

/**
 * The floating text for a combat event, or `undefined` for none. Loose
 * types, because the match view gets its events off the wire.
 */
export function floatingCueFor(
  kind: string,
  amount: number | undefined,
  critical: boolean,
): FloatingCue | undefined {
  // A status ticks every sim tick, mostly for under a point; a "−0" tells
  // the player nothing, and twenty a second would bury the real hits.
  if ((kind === "damage" || kind === "heal") && Math.round(amount ?? 0) === 0) {
    return undefined;
  }
  switch (kind) {
    case "damage":
      // The sign says damage or heal; the colour only backs it up, so a
      // player who cannot tell the two colours apart loses nothing.
      // U+2212, a real minus, as wide as the plus.
      return {
        text: `−${formatAmount(amount ?? 0)}${critical ? "!" : ""}`,
        tone: "damage",
        critical,
      };
    case "heal":
      return { text: `+${formatAmount(amount ?? 0)}`, tone: "heal", critical: false };
    case "interrupted":
      return { text: "interrupted!", tone: "neutral", critical: false };
    case "cancelled":
      // The caster moved and gave the cast up (#279).
      return { text: "cancelled", tone: "neutral", critical: false };
    case "attack-missed":
      // A blinded swing paid for and wasted: over the target, so the
      // attacker sees where it went (#6).
      return { text: "miss", tone: "neutral", critical: false };
    case "attack-dodged":
      // A shot that landed where the target would have been (#159).
      return { text: "dodge", tone: "neutral", critical: false };
    case "attack-obstructed":
      // A wall between the bow and its target at release (#160).
      return { text: "obstructed", tone: "neutral", critical: false };
    case "attack-unreachable":
      // No way round the walls; the attack has ended (#211).
      return { text: "can't reach", tone: "neutral", critical: false };
    case "death":
      return { text: "defeated", tone: "damage", critical: false };
    default:
      // Status applications/removals already show as markers on the
      // actor; adding text for them too would just be noise.
      return undefined;
  }
}
