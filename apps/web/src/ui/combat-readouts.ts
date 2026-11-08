import {
  ADRENALINE_PER_STRIKE,
  MAINTAINED_STATUSES,
  chainRequirementText,
  getSkill,
  type CombatEvent,
  type CombatLogEntry,
  type SkillEffect,
} from "@vibewars/game-core";

import { attributeName, itemName, skillName, statusName } from "../i18n/game-names.js";
import { t, type MessageKey } from "../i18n/index.js";

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
  /** Who healed, e.g. "regeneration", and whom, e.g. "You". */
  readonly by: string;
  readonly target: string;
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
    case "attack-backfired":
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

function skillLabel(skillId: string | undefined): string | undefined {
  return skillId === undefined ? undefined : skillName(skillId);
}

/**
 * "must follow an off-hand attack", "only if target is knocked down":
 * what a chain attack out of sequence needed (#831, #885, #1041).
 */
function outOfSequence(skillId: string | undefined): string | undefined {
  const skill = skillId === undefined ? undefined : getSkill(skillId);
  return skill === undefined ? undefined : chainRequirementText(skill);
}

/**
 * "not a spell": why a picky interrupt let a cast through, by its filter
 * (#796, #1008), found among the skill's effects or what its ground
 * effect lands (#1367).
 */
function interruptRefusal(skillId: string | undefined): MessageKey {
  const effects = skillId === undefined ? [] : (getSkill(skillId)?.effects ?? []);
  const interrupt = effects.flatMap(withLanded).find((effect) => effect.kind === "interrupt");
  return interrupt?.kind === "interrupt" && interrupt.only === "spell"
    ? "combat.interruptRefusedNotSpell"
    : "combat.interruptRefusedNotSpellOrChant";
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
      return [effect, ...effect.act.pulse.effects, ...(effect.act.atEnd?.effects ?? [])];
  }
}

/**
 * Who or what an entry's event came from, as a row names it: "Fireball
 * (You)", "Longbow (You)" for a weapon swing (#162), "Soul Reaping (You)"
 * for an attribute (#633), or, for a status tick, GW1's word for which
 * way it went (#151): regeneration heals, degeneration hurts. The source,
 * when exactly one is known.
 */
function sourceOf(
  entry: Pick<CombatLogEntry, "cause" | "sourceId" | "skillId" | "weaponId" | "attributeId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
  isCreature: (id: string) => boolean,
): { readonly by: string; readonly attribute: string | undefined } {
  const source = entry.sourceId === undefined ? undefined : nameOf(entry.sourceId);
  const attribute =
    entry.cause === "attribute"
      ? entry.attributeId === undefined
        ? t("combat.sourceAttribute")
        : attributeName(entry.attributeId)
      : undefined;
  const what =
    attribute ??
    (entry.cause === "weapon"
      ? entry.weaponId === undefined
        ? t("combat.sourceWeapon")
        : itemName(entry.weaponId)
      : entry.cause === "degeneration"
        ? t(event.kind === "heal" ? "combat.sourceRegeneration" : "combat.sourceDegeneration")
        : entry.cause === "beacon"
          ? t("combat.sourceBeacon")
          : (skillLabel(entry.skillId) ??
            // A Guild Battle's shrine raises on its own (#1222): nobody's, no skill.
            t(
              entry.cause === "skill" &&
                entry.sourceId === undefined &&
                event.kind === "resurrected"
                ? "combat.sourceShrine"
                : "combat.sourceSkill",
            )));
  // A creature swings its own jaws or bones: "Wolf hits Bob", not
  // "Unarmed (Wolf)" (#1144); a priest raises with no skill: "Priest
  // resurrects Bob" (#1186).
  const byCreature =
    (entry.cause === "weapon" || (entry.cause === "skill" && entry.skillId === undefined)) &&
    entry.sourceId !== undefined &&
    isCreature(entry.sourceId);
  return {
    by: byCreature && source !== undefined ? source : withSource(what, source),
    attribute,
  };
}

/** "Fireball (You)": `what`, and whose it was if anyone's. */
function withSource(what: string, source: string | undefined): string {
  return source === undefined ? what : t("combat.bySource", { what, source });
}

/** One event as a sentence a player can learn from. */
export function describeCombatEvent(
  entry: Pick<CombatLogEntry, "cause" | "sourceId" | "skillId" | "weaponId" | "attributeId">,
  event: CombatEvent,
  nameOf: (id: string) => string,
  isCreature: (id: string) => boolean,
): string {
  const target = nameOf(event.targetId);
  const source = entry.sourceId === undefined ? undefined : nameOf(entry.sourceId);
  const { by, attribute } = sourceOf(entry, event, nameOf, isCreature);
  switch (event.kind) {
    case "damage":
      return t(event.critical ? "combat.hitCritical" : "combat.hit", {
        by,
        target,
        amount: formatAmount(event.amount),
      });
    case "heal":
      return t("combat.heal", { by, target, amount: formatAmount(event.amount) });
    case "energy-gain":
      return attribute === undefined
        ? t("combat.energyGain", { target, amount: formatAmount(event.amount) })
        : t("combat.energyGainFrom", { target, amount: formatAmount(event.amount), attribute });
    case "energy-loss":
      return t("combat.energyLoss", { target, amount: formatAmount(event.amount), by });
    case "health-lost":
      // Named for the status, not the skill that brought it: not a second hit.
      return t("combat.healthLost", {
        status: withSource(statusName(event.statusId), source),
        amount: formatAmount(event.amount),
        target,
      });
    case "sacrifice":
      return t("combat.sacrifice", { target, amount: formatAmount(event.amount) });
    case "health-loss":
      return t("combat.healthLoss", { target, amount: formatAmount(event.amount), by });
    case "life-stolen":
      return t("combat.lifeStolen", { by, amount: formatAmount(event.amount), target });
    case "death":
      return t("combat.death", { target });
    case "creature-destroyed":
      return t("combat.creatureDestroyed", { by, target });
    case "resurrected":
      return t("combat.resurrected", {
        by,
        target,
        health: percent(event.healthFraction),
        energy: percent(event.energyFraction),
      });
    case "status-applied": {
      const status = statusName(event.statusId);
      return event.durationSeconds !== null
        ? t("combat.statusApplied", {
            target,
            status,
            seconds: formatAmount(event.durationSeconds),
          })
        : // No end of its own, and no upkeep either (#1789).
          t(
            MAINTAINED_STATUSES.has(event.statusId)
              ? "combat.statusAppliedMaintained"
              : "combat.statusAppliedUntilEnds",
            { target, status },
          );
    }
    case "status-removed":
      return t("combat.statusRemoved", {
        by,
        status: statusName(event.statusId),
        target,
      });
    case "status-expired":
      return t("combat.statusExpired", { status: statusName(event.statusId), target });
    case "upkeep-lost":
      // GW1 tells the caster alone; the log names them (#837).
      return t("combat.upkeepLost", {
        status: statusName(event.statusId),
        target,
        caster: nameOf(event.casterId),
      });
    case "status-spread":
      return t("combat.statusSpread", {
        target,
        status: statusName(event.statusId),
        from: nameOf(event.fromId),
      });
    case "interrupted":
      return t("combat.interrupted", {
        by,
        target,
        skill: skillName(event.skillId),
      });
    case "attack-interrupted":
      return t("combat.attackInterrupted", { by, target });
    case "cancelled":
      return t("combat.cancelled", { target, skill: skillName(event.skillId) });
    case "spell-failed":
      return t("combat.spellFailed", { target, skill: skillName(event.skillId) });
    case "interrupt-missed":
      // A picky interrupt says why it let a cast through (#796).
      return event.refusedSkillId === null
        ? t("combat.interruptMissed", { by, target })
        : t(interruptRefusal(entry.skillId), {
            by,
            target,
            skill: skillName(event.refusedSkillId),
          });
    case "attack-missed": {
      const needed = event.reason === "out-of-sequence" ? outOfSequence(entry.skillId) : undefined;
      return needed === undefined
        ? t("combat.miss", { by, target })
        : t("combat.missOutOfSequence", { by, target, requirement: needed });
    }
    case "attack-blocked":
      return t("combat.blocked", { target, by });
    case "invulnerable":
      // A shrine raise's window (#1208) turned it away (#1233).
      return t("combat.invulnerable", { by, target });
    case "attack-dodged":
      return t("combat.dodged", { target, by });
    case "attack-backfired":
      return t("combat.backfired", { by, target });
    case "attack-obstructed":
      return t("combat.obstructed", { by, target });
    case "attack-unreachable":
      return t("combat.unreachable", { by, target });
    case "knocked-down":
      return t("combat.knockedDown", {
        by,
        target,
        seconds: formatAmount(event.durationSeconds),
      });
    case "skill-disabled":
      return t("combat.skillDisabled", {
        by,
        target,
        skill: skillName(event.skillId),
        seconds: formatAmount(event.seconds),
      });
    case "recharge-lengthened":
      return t("combat.rechargeLengthened", {
        target,
        skill: skillName(event.skillId),
        seconds: formatAmount(event.seconds),
      });
    case "shadow-stepped":
      return t("combat.shadowStepped", { target, to: nameOf(event.toId) });
    case "shadow-stepped-away":
      return t("combat.shadowSteppedAway", { target });
    case "shadow-stepped-back":
      return t("combat.shadowSteppedBack", { target });
    case "shadow-swapped":
      return t("combat.shadowSwapped", { target, other: nameOf(event.withId) });
    case "teleported":
      return t("combat.teleported", { target, to: nameOf(event.toId) });
    case "companion-stepped":
      return t("combat.companionStepped", { target, to: nameOf(event.toId) });
    case "skill-used": {
      const caster = nameOf(event.casterId);
      const skill = skillName(event.skillId);
      return event.targetId === event.casterId
        ? t("combat.skillUsed", { caster, skill })
        : t("combat.skillUsedOn", { caster, skill, target });
    }
    case "adrenaline-gained":
      return adrenalineGained(target, event.strikes, skillLabel(event.skillId ?? entry.skillId));
    case "effect-skipped":
      return t("combat.effectSkipped", { by, requirement: event.requirement });
  }
}

/**
 * "You gain 1 strike of adrenaline", "3 strikes of adrenaline"; points
 * short of a whole strike (#2302) as GW1 words them, "4 adrenaline".
 */
function adrenalineGained(target: string, strikes: number, skill: string | undefined): string {
  if (!Number.isInteger(strikes)) {
    const points = String(Math.round(strikes * ADRENALINE_PER_STRIKE));
    return skill === undefined
      ? t("combat.adrenalinePoints", { target, points })
      : t("combat.adrenalinePointsFrom", { target, points, skill });
  }
  return skill === undefined
    ? t("combat.adrenalineStrikes", { target, count: strikes })
    : t("combat.adrenalineStrikesFrom", { target, count: strikes, skill });
}

/**
 * A blow's adrenaline (#1735) ends its hit's row, ", +1 adrenaline", so a
 * run of hits stays one row each; `undefined` for adrenaline a skill gave,
 * which is a row of its own.
 */
function hitAdrenaline(event: CombatEvent, hit: LogRow | undefined): LogRow | undefined {
  return event.kind === "adrenaline-gained" && event.skillId === undefined && hit !== undefined
    ? { ...hit, text: t("combat.hitAdrenaline", { hit: hit.text, strikes: String(event.strikes) }) }
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
      const tickEntry = {
        atSeconds,
        cause: "degeneration",
        sourceId: open.sourceId,
        skillId: undefined,
        weaponId: undefined,
        attributeId: undefined,
      } as const;
      const event: CombatEvent =
        open.kind === "damage"
          ? { kind: open.kind, targetId: open.targetId, amount: open.amount, critical: false }
          : { kind: open.kind, targetId: open.targetId, amount: open.amount };
      const row = combatEventToRow(tickEntry, event, nameOf, isCreature);
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
                by: sourceOf(tickEntry, event, nameOf, isCreature).by,
                target: nameOf(open.targetId),
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
  const { by, target } = fold;
  const amount = formatAmount(fold.amount);
  return span === 0
    ? t("combat.heal", { by, target, amount })
    : t("combat.healOver", { by, target, amount, seconds: formatAmount(span) });
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
 * you lose (#1678), is taken, never dealt. What your own spirits, minions
 * and pet deal and heal is yours (#2483), on the skills side: "weapon" is
 * only your own weapon. `ownerOf` names a creature's owner, `undefined`
 * for a masterless one or anyone not a creature.
 */
export function accumulate(
  totals: MeterTotals,
  entries: readonly CombatLogEntry[],
  selfId: string,
  stepSeconds: number,
  ownerOf: (id: string) => string | undefined,
): MeterTotals {
  let { damage, weaponDamage, healing, taken } = totals;
  for (const entry of entries) {
    const yours =
      entry.sourceId === selfId ||
      (entry.sourceId !== undefined && ownerOf(entry.sourceId) === selfId);
    for (const event of entry.events) {
      if (event.kind === "damage") {
        if (event.targetId === selfId) {
          taken += event.amount;
        } else if (yours) {
          damage += event.amount;
          if (entry.cause === "weapon" && entry.sourceId === selfId) {
            weaponDamage += event.amount;
          }
        }
      } else if (event.kind === "heal" && yours) {
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
  /** What the row is, for `data-meter`: the same in every language. */
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export function meterRows(totals: MeterTotals): readonly MeterRow[] {
  return [
    {
      id: "dps",
      label: t("combat.meterDps"),
      value: formatRate(perSecond(totals.damage, totals.seconds)),
    },
    {
      id: "hps",
      label: t("combat.meterHps"),
      value: formatRate(perSecond(totals.healing, totals.seconds)),
    },
    { id: "damage", label: t("combat.meterDamage"), value: formatAmount(totals.damage) },
    {
      id: "weapon-skills",
      label: t("combat.meterWeaponSkills"),
      value: `${formatAmount(totals.weaponDamage)} / ${formatAmount(totals.damage - totals.weaponDamage)}`,
    },
    { id: "healing", label: t("combat.meterHealing"), value: formatAmount(totals.healing) },
    { id: "taken", label: t("combat.meterTaken"), value: formatAmount(totals.taken) },
    { id: "time", label: t("combat.meterTime"), value: formatSimClock(totals.seconds) },
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
      return {
        text: t("combat.floatEnergyLoss", { amount: formatAmount(amount ?? 0) }),
        tone: "energy",
        critical: false,
      };
    case "interrupted":
    case "attack-interrupted":
      return { text: t("combat.floatInterrupted"), tone: "neutral", critical: false };
    case "cancelled":
      // The caster moved and gave the cast up (#279).
      return { text: t("combat.floatCancelled"), tone: "neutral", critical: false };
    case "spell-failed":
      // Guilt and the like (#1475): over the caster, whose spell it was.
      return { text: t("combat.floatFailed"), tone: "neutral", critical: false };
    case "attack-missed":
      // A blinded swing paid for and wasted: over the target, so the
      // attacker sees where it went (#6).
      return { text: t("combat.floatMiss"), tone: "neutral", critical: false };
    case "attack-blocked":
      // Guardian and the like turned the blow aside (#534).
      return { text: t("combat.floatBlock"), tone: "neutral", critical: false };
    case "invulnerable":
      // A body a shrine just raised took none of it (#1233).
      return { text: t("combat.floatInvulnerable"), tone: "neutral", critical: false };
    case "attack-dodged":
      // A shot that landed where the target would have been (#159).
      return { text: t("combat.floatDodge"), tone: "neutral", critical: false };
    case "attack-backfired":
      // Calculated Risk turned the blow back on its attacker (#2471).
      return { text: t("combat.floatBackfire"), tone: "neutral", critical: false };
    case "attack-obstructed":
      // A wall between the bow and its target at release (#160).
      return { text: t("combat.floatObstructed"), tone: "neutral", critical: false };
    case "attack-unreachable":
      // No way round the walls; the attack has ended (#211).
      return { text: t("combat.floatCantReach"), tone: "neutral", critical: false };
    case "knocked-down":
      // Once, as it lands; the lying pose says it for as long as it lasts (#545).
      return { text: t("combat.floatKnockedDown"), tone: "neutral", critical: false };
    case "death":
      return { text: t("combat.floatDefeated"), tone: "damage", critical: false };
    default:
      // Status applications/removals already show as markers on the
      // actor; adding text for them too would just be noise.
      return undefined;
  }
}
