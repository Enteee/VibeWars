import {
  STATUS_DEFINITIONS,
  getSkill,
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
    case "interrupt-missed":
    case "attack-missed":
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
  entry: Pick<CombatLogEntry, "cause" | "sourceId" | "skillId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
): string {
  const target = nameOf(event.targetId);
  const skill = skillName(entry.skillId);
  const source = entry.sourceId === undefined ? undefined : nameOf(entry.sourceId);
  // "Fireball (You)", or, for a status tick, the statuses behind it.
  const by =
    entry.cause === "degeneration"
      ? "degeneration"
      : `${skill ?? "a skill"}${source === undefined ? "" : ` (${source})`}`;
  switch (event.kind) {
    case "damage":
      return `${by} hits ${target} for ${formatAmount(event.amount)}`;
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
    case "interrupt-missed":
      return `${by} finds nothing to interrupt on ${target}`;
    case "attack-missed":
      return `${by} misses ${target}`;
  }
}

export function combatEventToRow(
  entry: Pick<CombatLogEntry, "atSeconds" | "cause" | "sourceId" | "skillId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
): LogRow {
  return {
    time: formatSimClock(entry.atSeconds),
    text: describeCombatEvent(entry, event, nameOf),
    tone: logToneOf(event.kind),
  };
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
  readonly healing: number;
  readonly taken: number;
  readonly seconds: number;
}

export const EMPTY_TOTALS: MeterTotals = { damage: 0, healing: 0, taken: 0, seconds: 0 };

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
  let { damage, healing, taken } = totals;
  for (const entry of entries) {
    for (const event of entry.events) {
      if (event.kind === "damage") {
        if (event.targetId === selfId) {
          taken += event.amount;
        } else if (entry.sourceId === selfId) {
          damage += event.amount;
        }
      } else if (event.kind === "heal" && entry.sourceId === selfId) {
        healing += event.amount;
      }
    }
  }
  return { damage, healing, taken, seconds: totals.seconds + stepSeconds };
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
    { label: "healing", value: formatAmount(totals.healing) },
    { label: "taken", value: formatAmount(totals.taken) },
    { label: "time", value: formatSimClock(totals.seconds) },
  ];
}

export interface FloatingCue {
  readonly text: string;
  readonly tone: "damage" | "heal" | "neutral";
}

/**
 * The floating text for a combat event, or `undefined` for none. Loose
 * types, because the match view gets its events off the wire.
 */
export function floatingCueFor(kind: string, amount: number | undefined): FloatingCue | undefined {
  switch (kind) {
    case "damage":
      // The sign says damage or heal; the colour only backs it up, so a
      // player who cannot tell the two colours apart loses nothing.
      // U+2212, a real minus, as wide as the plus.
      return { text: `−${formatAmount(amount ?? 0)}`, tone: "damage" };
    case "heal":
      return { text: `+${formatAmount(amount ?? 0)}`, tone: "heal" };
    case "interrupted":
      return { text: "interrupted!", tone: "neutral" };
    case "attack-missed":
      // A blinded swing paid for and wasted: over the target, so the
      // attacker sees where it went (#6).
      return { text: "miss", tone: "neutral" };
    case "death":
      return { text: "defeated", tone: "damage" };
    default:
      // Status applications/removals already show as markers on the
      // actor; adding text for them too would just be noise.
      return undefined;
  }
}
