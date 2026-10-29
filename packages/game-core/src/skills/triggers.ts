import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { addCopyPool } from "./adrenaline.js";
import { copyKey, type SlotSkill } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import {
  getStatusDefinition,
  type EchoEffect,
  type SpreadGainedConditionEffect,
  type StatusChange,
  type StatusId,
  type StatusTrigger,
  type StatusTriggerEvent,
} from "./status.js";
import { isSpell, type Combatant, type SkillEffect, type Surroundings } from "./types.js";

/** What one status's trigger did, credited to whoever applied the status. */
export interface FiredTrigger {
  readonly sourceId: string;
  readonly skillId: string;
  readonly events: readonly CombatEvent[];
}

/**
 * Contagion's spread, which needs positions (#887): what it did, from
 * `bearer`, for the condition gained. Only the simulation knows where
 * everyone is.
 */
export type SpreadGainedCondition = (
  effect: SpreadGainedConditionEffect,
  bearer: Combatant,
  gained: Extract<StatusChange, { kind: "gained-condition" }>,
) => CombatEvent[];

export interface TriggerContext {
  readonly sourceOf: (id: string) => Combatant | undefined;
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
  /**
   * The skill the bearer just used, and its key (#469), on
   * `bearer-uses-skill` (#949): what Diversion lengthens and an echo
   * copies. `undefined` on every other event.
   */
  readonly usedSkill: SlotSkill | undefined;
}

/**
 * The bearer did `event` (#469): every status on it that answers fires,
 * once each, in `StatusSet.active` order (ADR-0003). Its effects are its
 * source's, on the trigger's target. A source no longer in the match fires
 * nothing; a dead one still does, as a dead Mesmer's hex keeps working in
 * GW1. A status in `spared`, one the skill being used put on its own user,
 * does not answer that use (#999): Song of Restoration waits for the
 * chanter's next skill.
 *
 * Nothing here fires a trigger: damage from one is never an event that
 * answers another, so triggers cannot recurse.
 */
export function fireTriggers(
  bearer: Combatant,
  event: Exclude<
    StatusTriggerEvent,
    "bearer-gains-condition" | "bearer-creates-creature" | "ends" | "expires"
  >,
  context: TriggerContext,
  spared: ReadonlySet<StatusId>,
): FiredTrigger[] {
  return bearer.statuses
    .triggersOn(event)
    .filter(({ statusId }) => !spared.has(statusId))
    .flatMap(({ statusId, sourceId, trigger }) =>
      fire(trigger, statusId, sourceId, bearer, undefined, undefined, context),
    );
}

/**
 * The bearer created `createdId` (#1316): every status on it that answers
 * that fires, once each, in `active` order, the creature already in the
 * world. A trigger with target `created` lands on the creature.
 */
export function fireCreationTriggers(
  bearer: Combatant,
  createdId: string,
  context: TriggerContext,
): FiredTrigger[] {
  return bearer.statuses
    .triggersOn("bearer-creates-creature")
    .flatMap(({ statusId, sourceId, trigger }) =>
      fire(trigger, statusId, sourceId, bearer, createdId, undefined, context),
    );
}

/**
 * What `change` to the bearer's statuses sets off (#887): a condition
 * gained fires every status on it that answers one, in `active` order; a
 * status ended fires its own `ends` triggers, though it is no longer on
 * the bearer, and its `expires` ones too if its duration ran out (#944).
 * A hit the bearer landed, or physical damage it took (#935), fires what
 * answered it when it happened (#953), so a killing blow still sets off
 * the hexes its death ended. Damage or life steal from a foe (#1022)
 * fires what answered it at that foe, and a block (#1329) what answered
 * it at the attacker. The simulation discards whatever
 * the firing itself changes, so this never recurses either.
 */
export function fireChangeTriggers(
  bearer: Combatant,
  change: StatusChange,
  spread: SpreadGainedCondition,
  context: TriggerContext,
): FiredTrigger[] {
  switch (change.kind) {
    case "gained-condition":
      return bearer.statuses
        .triggersOn("bearer-gains-condition")
        .flatMap(({ statusId, sourceId, trigger }) =>
          fire(
            trigger,
            statusId,
            sourceId,
            bearer,
            undefined,
            (effect) => spread(effect, bearer, change),
            context,
          ),
        );
    case "ended":
      return getStatusDefinition(change.id)
        .triggers.filter(
          (trigger) => trigger.on === "ends" || (trigger.on === "expires" && change.expired),
        )
        .flatMap((trigger) =>
          fire(trigger, change.id, change.sourceId, bearer, undefined, undefined, context),
        );
    case "hit":
    case "took-physical-damage":
      return change.fired.flatMap(({ statusId, sourceId, trigger }) =>
        fire(trigger, statusId, sourceId, bearer, undefined, undefined, context),
      );
    case "took-damage-from-foe":
    case "blocked":
      return change.fired.flatMap(({ statusId, sourceId, trigger }) =>
        fire(trigger, statusId, sourceId, bearer, change.offenderId, undefined, context),
      );
    // Not a trigger: the simulation lands it on its own (#1108, #1265).
    case "redirected-damage":
    case "charged-source":
      return [];
  }
}

/**
 * Who a trigger's effects come from and land on: the source on the bearer
 * or on itself, or (#1022) the bearer on `otherId`, the foe that set it
 * off, or (#1316) the creature it created. `undefined` when one of them is
 * gone, or an offender's bearer is dead: then it fires nothing.
 */
function parties(
  trigger: StatusTrigger,
  source: Combatant,
  bearer: Combatant,
  otherId: string | undefined,
  sourceOf: (id: string) => Combatant | undefined,
): { caster: Combatant; target: Combatant } | undefined {
  const other = otherId === undefined ? undefined : sourceOf(otherId);
  switch (trigger.target) {
    case "bearer":
      return { caster: source, target: bearer };
    case "source":
      return { caster: source, target: source };
    case "offender":
      return other === undefined || bearer.dead ? undefined : { caster: bearer, target: other };
    case "created":
      return other === undefined ? undefined : { caster: bearer, target: other };
  }
}

/**
 * One trigger's effects, in order, from `parties`. Consecutive skill
 * effects resolve together, so one may read what an earlier one did; a
 * spread with nothing gained does nothing. A status that ends when
 * triggered (#1022) then ends, logged as its expiry.
 */
function fire(
  trigger: StatusTrigger,
  statusId: StatusId,
  sourceId: string,
  bearer: Combatant,
  otherId: string | undefined,
  spread: ((effect: SpreadGainedConditionEffect) => CombatEvent[]) | undefined,
  { sourceOf, rng, rules, surroundings, usedSkill }: TriggerContext,
): FiredTrigger[] {
  const source = sourceOf(sourceId);
  if (source === undefined) {
    return [];
  }
  const resolved = parties(trigger, source, bearer, otherId, sourceOf);
  if (resolved === undefined) {
    return [];
  }
  const { caster, target } = resolved;
  const events: CombatEvent[] = [];
  let pending: SkillEffect[] = [];
  const flush = (): void => {
    events.push(...applyEffects(pending, { caster, target, rng, rules, surroundings, usedSkill }));
    pending = [];
  };
  for (const effect of trigger.effects) {
    if (effect.kind === "spread-gained-condition") {
      flush();
      events.push(...(spread?.(effect) ?? []));
    } else if (effect.kind === "echo") {
      flush();
      echo(effect, bearer, trigger.skillId, usedSkill);
    } else {
      pending.push(effect);
    }
  }
  flush();
  if (getStatusDefinition(statusId).endsWhenTriggered && bearer.statuses.has(statusId)) {
    bearer.statuses.end(statusId);
    events.push({ kind: "status-expired", targetId: bearer.id, statusId });
  }
  return events.length === 0 ? [] : [{ sourceId, skillId: trigger.skillId, events }];
}

/** Whether status `statusId` copies its bearer's next skill (#469). */
export function isEchoStatus(statusId: StatusId): boolean {
  return getStatusDefinition(statusId).triggers.some(({ effects }) =>
    effects.some(({ kind }) => kind === "echo"),
  );
}

/**
 * Whether `skillId` puts an echo on its user (#469): Arcane Echo and Echo.
 * One is never copied, and does not use up another echo already up.
 */
export function isEchoSkill(skillId: string): boolean {
  return (getSkill(skillId)?.effects ?? []).some(
    (effect) => effect.kind === "apply-status" && isEchoStatus(effect.statusId),
  );
}

/**
 * An echo answers `used` (#469): the slot of `echoSkillId` on the bearer's
 * bar holds a copy of it, under its own key, for `effect.seconds`; then the
 * echo skill is back, and starts its own recharge. Not for another echo
 * skill, and with `spellsOnly`, only for a spell.
 */
function echo(
  effect: EchoEffect,
  bearer: Combatant,
  echoSkillId: string,
  used: SlotSkill | undefined,
): void {
  const skill = used === undefined ? undefined : getSkill(used.skillId);
  const echoSkill = getSkill(echoSkillId);
  const slot = bearer.skillBar.indexOf(echoSkillId);
  if (
    skill === undefined ||
    echoSkill === undefined ||
    slot === -1 ||
    isEchoSkill(skill.id) ||
    (effect.spellsOnly && !isSpell(skill.type))
  ) {
    return;
  }
  const key = copyKey(skill.id, slot);
  bearer.cast.override(slot, {
    skillId: skill.id,
    key,
    remainingSeconds: effect.seconds,
    restores: { skillId: echoSkillId, rechargeSeconds: echoSkill.rechargeSeconds },
  });
  addCopyPool(bearer, key);
}
