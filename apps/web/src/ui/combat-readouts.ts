import {
  MAINTAINED_STATUSES,
  STATUS_DEFINITIONS,
  chainRequirementText,
  getAttribute,
  getSkill,
  getWeapon,
  type CombatEvent,
  type CombatLogEntry,
  type SkillEffect,
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
  /**
   * Set only on a regeneration row the batcher writes, so a run of them
   * for one target and source folds into one row (#590).
   */
  readonly fold?: LogFold;
}

export interface LogFold {
  /** `${targetId}:${sourceId}`: rows fold only with the same key. */
  readonly key: string;
  readonly amount: number;
  readonly startedAt: number;
  readonly endedAt: number;
  /** The text before " for ", e.g. "regeneration heals You". */
  readonly label: string;
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
    case "health-lost":
    case "sacrifice":
    case "health-loss":
    case "life-stolen":
      return "damage";
    case "heal":
    case "resurrected":
      return "heal";
    case "energy-gain":
    case "energy-loss":
    case "adrenaline-gained":
      return "resource";
    case "status-applied":
    case "status-removed":
    case "status-expired":
    case "status-spread":
    case "upkeep-lost":
    case "skill-used":
    case "effect-skipped":
      return "status";
    case "interrupted":
    case "attack-interrupted":
    case "cancelled":
    case "spell-failed":
    case "interrupt-missed":
    case "attack-missed":
    case "attack-blocked":
    case "invulnerable":
    case "attack-dodged":
    case "attack-obstructed":
    case "attack-unreachable":
    case "knocked-down":
    case "shadow-stepped":
    case "shadow-stepped-away":
    case "shadow-stepped-back":
    case "shadow-swapped":
    case "teleported":
    case "companion-stepped":
    case "skill-disabled":
    case "recharge-lengthened":
      return "control";
    case "death":
      return "death";
    case "creature-destroyed":
      return "death";
  }
}

/** A share, 0..1, as a whole percentage: "25%". */
function percent(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

function skillName(skillId: string | undefined): string | undefined {
  return skillId === undefined ? undefined : (getSkill(skillId)?.name ?? skillId);
}

/** One event as a sentence a player can learn from. */
/**
 * " (must follow an off-hand attack)", " (only if target is knocked
 * down)": what a chain attack out of sequence needed (#831, #885, #1041).
 */
function outOfSequence(skillId: string | undefined): string {
  const skill = skillId === undefined ? undefined : getSkill(skillId);
  const needed = skill === undefined ? undefined : chainRequirementText(skill);
  return needed === undefined ? "" : ` (${needed})`;
}

/**
 * "not a spell": why a picky interrupt let a cast through, by its filter
 * (#796, #1008), found among the skill's effects or what its ground
 * effect lands (#1367).
 */
function interruptRefusal(skillId: string | undefined): string {
  const effects = skillId === undefined ? [] : (getSkill(skillId)?.effects ?? []);
  const interrupt = effects.flatMap(withLanded).find((effect) => effect.kind === "interrupt");
  return interrupt?.kind === "interrupt" && interrupt.only === "spell"
    ? "not a spell"
    : "not a spell or chant";
}

/** An effect, then what its trap's spring or its pulse lands, if it is a ground effect. */
function withLanded(effect: SkillEffect): readonly SkillEffect[] {
  if (effect.kind !== "create-ground-effect") {
    return [effect];
  }
  switch (effect.act.kind) {
    case "aura":
      return [effect];
    case "trap":
      return [effect, ...effect.act.trap.spring.effects];
    case "pulse":
      return [effect, ...effect.act.pulse.effects];
  }
}

export function describeCombatEvent(
  entry: Pick<CombatLogEntry, "cause" | "sourceId" | "skillId" | "weaponId" | "attributeId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
  isCreature: (id: string) => boolean,
): string {
  const target = nameOf(event.targetId);
  const skill = skillName(entry.skillId);
  const source = entry.sourceId === undefined ? undefined : nameOf(entry.sourceId);
  // "Fireball (You)", "Longbow (You)" for a weapon swing (#162), "Soul
  // Reaping (You)" for an attribute (#633), or, for a status tick, GW1's
  // word for which way it went (#151): regeneration heals, degeneration
  // hurts. The source, when exactly one is known.
  const attribute =
    entry.cause === "attribute"
      ? (getAttribute(entry.attributeId ?? "")?.name ?? "an attribute")
      : undefined;
  const what =
    attribute ??
    (entry.cause === "weapon"
      ? (getWeapon(entry.weaponId ?? "")?.name ?? "a weapon")
      : entry.cause === "degeneration"
        ? event.kind === "heal"
          ? "regeneration"
          : "degeneration"
        : (skill ??
          // A Guild Battle's shrine raises on its own (#1222): nobody's, no skill.
          (entry.cause === "skill" && entry.sourceId === undefined && event.kind === "resurrected"
            ? "The shrine"
            : "a skill")));
  // A creature swings its own jaws or bones: "Wolf hits Bob", not
  // "Unarmed (Wolf)" (#1144); a priest raises with no skill: "Priest
  // resurrects Bob" (#1186).
  const byCreature =
    (entry.cause === "weapon" || (entry.cause === "skill" && entry.skillId === undefined)) &&
    entry.sourceId !== undefined &&
    isCreature(entry.sourceId);
  const by =
    byCreature && source !== undefined
      ? source
      : `${what}${source === undefined ? "" : ` (${source})`}`;
  switch (event.kind) {
    case "damage":
      return `${by} hits ${target} for ${formatAmount(event.amount)}${event.critical ? ", a critical hit" : ""}`;
    case "heal":
      return `${by} heals ${target} for ${formatAmount(event.amount)}`;
    case "energy-gain":
      return `${target} gains ${formatAmount(event.amount)} energy${attribute === undefined ? "" : ` from ${attribute}`}`;
    case "energy-loss":
      return `${target} loses ${formatAmount(event.amount)} energy to ${by}`;
    case "health-lost":
      // Named for the status, not the skill that brought it: not a second hit.
      return `${STATUS_DEFINITIONS[event.statusId].name}${source === undefined ? "" : ` (${source})`} takes ${formatAmount(event.amount)} health from ${target}`;
    case "sacrifice":
      return `${target} sacrifices ${formatAmount(event.amount)} health`;
    case "health-loss":
      return `${target} loses ${formatAmount(event.amount)} Health to ${by}`;
    case "life-stolen":
      return `${by} steals ${formatAmount(event.amount)} health from ${target}`;
    case "death":
      return `${target} dies`;
    case "creature-destroyed":
      return `${by} destroys ${target}`;
    case "resurrected":
      return `${by} resurrects ${target} (${percent(event.healthFraction)} health, ${percent(event.energyFraction)} energy)`;
    case "status-applied":
      return `${target} gains ${STATUS_DEFINITIONS[event.statusId].name} (${
        event.durationSeconds !== null
          ? `${formatAmount(event.durationSeconds)} s`
          : // No end of its own, and no upkeep either (#1789).
            MAINTAINED_STATUSES.has(event.statusId)
            ? "maintained"
            : "until it ends"
      })`;
    case "status-removed":
      return `${by} removes ${STATUS_DEFINITIONS[event.statusId].name} from ${target}`;
    case "status-expired":
      return `${STATUS_DEFINITIONS[event.statusId].name} ends on ${target}`;
    case "upkeep-lost":
      // GW1 tells the caster alone; the log names them (#837).
      return `${STATUS_DEFINITIONS[event.statusId].name} on ${target} was lost: ${nameOf(event.casterId)} could not pay the upkeep`;
    case "status-spread":
      return `${target} catches ${STATUS_DEFINITIONS[event.statusId].name} from ${nameOf(event.fromId)}`;
    case "interrupted":
      return `${by} interrupts ${target}'s ${skillName(event.skillId) ?? event.skillId}`;
    case "attack-interrupted":
      return `${by} interrupts ${target}'s attack`;
    case "cancelled":
      return `${target} cancels ${skillName(event.skillId) ?? event.skillId}`;
    case "spell-failed":
      return `${target}'s ${skillName(event.skillId) ?? event.skillId} fails`;
    case "interrupt-missed":
      // A picky interrupt says why it let a cast through (#796).
      return event.refusedSkillId === null
        ? `${by} finds nothing to interrupt on ${target}`
        : `${by} can't interrupt ${target}'s ${skillName(event.refusedSkillId) ?? event.refusedSkillId}: ${interruptRefusal(entry.skillId)}`;
    case "attack-missed":
      return `${by} misses ${target}${event.reason === "out-of-sequence" ? outOfSequence(entry.skillId) : ""}`;
    case "attack-blocked":
      return `${target} blocks ${by}`;
    case "invulnerable":
      // A shrine raise's window (#1208) turned it away (#1233).
      return `${by}: ${target} is invulnerable`;
    case "attack-dodged":
      return `${target} dodges ${by}`;
    case "attack-obstructed":
      return `${by} is obstructed on the way to ${target}`;
    case "attack-unreachable":
      return `${by} can't reach ${target}`;
    case "knocked-down":
      return `${by} knocks down ${target} (${formatAmount(event.durationSeconds)} s)`;
    case "skill-disabled":
      return `${by} disables ${target}'s ${skillName(event.skillId) ?? event.skillId} for ${formatAmount(event.seconds)} s`;
    case "recharge-lengthened":
      return `${target}'s ${skillName(event.skillId) ?? event.skillId} takes ${formatAmount(event.seconds)} s longer to recharge`;
    case "shadow-stepped":
      return `${target} shadow steps to ${nameOf(event.toId)}`;
    case "shadow-stepped-away":
      return `${target} shadow steps away`;
    case "shadow-stepped-back":
      return `${target} shadow steps back`;
    case "shadow-swapped":
      return `${target} swaps places with ${nameOf(event.withId)}`;
    case "teleported":
      return `${target} is teleported to ${nameOf(event.toId)}`;
    case "companion-stepped":
      return `${target} leaps to ${nameOf(event.toId)}`;
    case "skill-used":
      return `${nameOf(event.casterId)} uses ${skillName(event.skillId) ?? event.skillId}${event.targetId === event.casterId ? "" : ` on ${target}`}`;
    case "adrenaline-gained": {
      const from = skillName(event.skillId ?? entry.skillId);
      return `${target} gains ${strikesOf(event.strikes)} of adrenaline${from === undefined ? "" : ` from ${from}`}`;
    }
    case "effect-skipped":
      return `${by}: no effect, ${event.requirement}`;
  }
}

/** "1 strike", "3 strikes". */
function strikesOf(strikes: number): string {
  return `${String(strikes)} ${strikes === 1 ? "strike" : "strikes"}`;
}

/**
 * A blow's adrenaline (#1735) ends its hit's row, ", +1 adrenaline", so a
 * run of hits stays one row each; `undefined` for adrenaline a skill gave,
 * which is a row of its own.
 */
function hitAdrenaline(event: CombatEvent, hit: LogRow | undefined): LogRow | undefined {
  return event.kind === "adrenaline-gained" && event.skillId === undefined && hit !== undefined
    ? { ...hit, text: `${hit.text}, +${String(event.strikes)} adrenaline` }
    : undefined;
}

export function combatEventToRow(
  entry: Pick<
    CombatLogEntry,
    "atSeconds" | "cause" | "sourceId" | "skillId" | "weaponId" | "attributeId"
  >,
  event: CombatEvent,
  nameOf: (id: string) => string,
  isCreature: (id: string) => boolean,
): LogRow {
  return {
    time: formatSimClock(entry.atSeconds),
    text: describeCombatEvent(entry, event, nameOf, isCreature),
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
  public push(
    entry: CombatLogEntry,
    nameOf: (id: string) => string,
    isCreature: (id: string) => boolean,
  ): LogRow[] {
    const rows = this.advance(entry.atSeconds, nameOf, isCreature);
    // This entry's last hit row, which its blow's adrenaline ends (#1735).
    let hit: number | undefined;
    for (const event of entry.events) {
      if (entry.cause !== "degeneration") {
        const withAdrenaline = hitAdrenaline(event, hit === undefined ? undefined : rows[hit]);
        if (withAdrenaline !== undefined && hit !== undefined) {
          rows[hit] = withAdrenaline;
          continue;
        }
        // A skill or a swing can finish off someone still ticking too.
        if (event.kind === "death") {
          rows.push(
            ...this.#close(
              (open) => open.targetId === event.targetId,
              () => entry.atSeconds,
              nameOf,
              isCreature,
            ),
          );
        }
        rows.push(combatEventToRow(entry, event, nameOf, isCreature));
        hit = event.kind === "damage" ? rows.length - 1 : hit;
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
          isCreature,
        ),
      );
      rows.push(combatEventToRow(entry, event, nameOf, isCreature));
    }
    return rows;
  }

  /** Close the windows that are a full second old at `atSeconds`. */
  public advance(
    atSeconds: number,
    nameOf: (id: string) => string,
    isCreature: (id: string) => boolean,
  ): LogRow[] {
    return this.#close(
      (open) => atSeconds >= open.startedAt + STATUS_TICK_WINDOW_SECONDS,
      (open) => open.startedAt + STATUS_TICK_WINDOW_SECONDS,
      nameOf,
      isCreature,
    );
  }

  /** Close every window at `atSeconds`, as before a divider. */
  public flush(
    atSeconds: number,
    nameOf: (id: string) => string,
    isCreature: (id: string) => boolean,
  ): LogRow[] {
    return this.#close(
      () => true,
      () => atSeconds,
      nameOf,
      isCreature,
    );
  }

  /** Write the due windows, each stamped at `closedAt`, oldest first. */
  #close(
    due: (open: TickWindow) => boolean,
    closedAt: (open: TickWindow) => number,
    nameOf: (id: string) => string,
    isCreature: (id: string) => boolean,
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
      const atSeconds = closedAt(open);
      const row = combatEventToRow(
        {
          atSeconds,
          cause: "degeneration",
          sourceId: open.sourceId,
          skillId: undefined,
          weaponId: undefined,
          attributeId: undefined,
        },
        open.kind === "damage"
          ? { kind: open.kind, targetId: open.targetId, amount: open.amount, critical: false }
          : { kind: open.kind, targetId: open.targetId, amount: open.amount },
        nameOf,
        isCreature,
      );
      // Degeneration stays tick by tick: a damage run is worth reading.
      rows.push(
        open.kind === "heal"
          ? {
              ...row,
              fold: {
                key: `${open.targetId}:${open.sourceId ?? ""}`,
                amount: open.amount,
                startedAt: atSeconds,
                endedAt: atSeconds,
                label: row.text.slice(0, row.text.lastIndexOf(" for ")),
              },
            }
          : row,
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
 * A folded run's text: "regeneration heals You for 57 over 19 s". A run
 * of one tick has no span, so no tail (#1618).
 */
export function foldedText(fold: LogFold): string {
  const span = fold.endedAt - fold.startedAt;
  const total = `${fold.label} for ${formatAmount(fold.amount)}`;
  return span === 0 ? total : `${total} over ${formatAmount(span)} s`;
}

/**
 * The log after `incoming` arrives, keeping the newest `cap` rows.
 * Consecutive rows with the same `fold.key` merge into one that keeps
 * the first row's time (#590). `replacedLast` says the last existing
 * row absorbed incoming ones, so the DOM rewrites it in place; `added`
 * are the rows to paint after it. `dropped` is how many came off the
 * front, so the DOM can remove exactly those instead of rebuilding.
 */
export function appendRows(
  existing: readonly LogRow[],
  incoming: readonly LogRow[],
  cap: number,
): {
  readonly rows: readonly LogRow[];
  readonly dropped: number;
  readonly replacedLast: boolean;
  readonly added: readonly LogRow[];
} {
  const all = [...existing];
  let replacedLast = false;
  for (const row of incoming) {
    const last = all.at(-1);
    if (row.fold !== undefined && last?.fold?.key === row.fold.key) {
      const fold: LogFold = {
        ...last.fold,
        amount: last.fold.amount + row.fold.amount,
        endedAt: row.fold.endedAt,
      };
      all[all.length - 1] = { ...last, text: foldedText(fold), fold };
      replacedLast ||= all.length === existing.length;
      continue;
    }
    all.push(row);
  }
  const dropped = Math.max(0, all.length - cap);
  return {
    rows: all.slice(dropped),
    dropped,
    replacedLast,
    added: all.slice(existing.length),
  };
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
 * healing done. Health a status takes as it lands, or a foe's skill makes
 * you lose (#1678), is taken, never dealt.
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
      } else if (
        (event.kind === "health-lost" ||
          event.kind === "health-loss" ||
          event.kind === "life-stolen") &&
        event.targetId === selfId
      ) {
        taken += event.amount;
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
  readonly tone: "damage" | "heal" | "energy" | "neutral";
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
    case "health-lost":
    case "health-loss":
    case "life-stolen":
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
    case "energy-loss":
      // Energy Burn and Energy Tap (#793): blue, as the energy bar, with the
      // word, so it never reads as health.
      return { text: `−${formatAmount(amount ?? 0)} energy`, tone: "energy", critical: false };
    case "interrupted":
    case "attack-interrupted":
      return { text: "interrupted!", tone: "neutral", critical: false };
    case "cancelled":
      // The caster moved and gave the cast up (#279).
      return { text: "cancelled", tone: "neutral", critical: false };
    case "spell-failed":
      // Guilt and the like (#1475): over the caster, whose spell it was.
      return { text: "failed", tone: "neutral", critical: false };
    case "attack-missed":
      // A blinded swing paid for and wasted: over the target, so the
      // attacker sees where it went (#6).
      return { text: "miss", tone: "neutral", critical: false };
    case "attack-blocked":
      // Guardian and the like turned the blow aside (#534).
      return { text: "block", tone: "neutral", critical: false };
    case "invulnerable":
      // A body a shrine just raised took none of it (#1233).
      return { text: "Invulnerable", tone: "neutral", critical: false };
    case "attack-dodged":
      // A shot that landed where the target would have been (#159).
      return { text: "dodge", tone: "neutral", critical: false };
    case "attack-obstructed":
      // A wall between the bow and its target at release (#160).
      return { text: "obstructed", tone: "neutral", critical: false };
    case "attack-unreachable":
      // No way round the walls; the attack has ended (#211).
      return { text: "can't reach", tone: "neutral", critical: false };
    case "knocked-down":
      // Once, as it lands; the lying pose says it for as long as it lasts (#545).
      return { text: "Knocked down", tone: "neutral", critical: false };
    case "death":
      return { text: "defeated", tone: "damage", critical: false };
    default:
      // Status applications/removals already show as markers on the
      // actor; adding text for them too would just be noise.
      return undefined;
  }
}
