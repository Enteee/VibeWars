import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import type { SlotSkill } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { applyEffects, interruptAttackSkill, type CombatEvent } from "./effects.js";
import {
  getStatusDefinition,
  triggerAnswersWeapon,
  type EchoEffect,
  type SpreadGainedConditionEffect,
  type StatusChange,
  type StatusId,
  type StatusTrigger,
  type StatusTriggerEvent,
} from "./status.js";
import { standIn } from "./stand-in.js";
import { inScope } from "./tick.js";
import { isSpell, type Combatant, type SkillEffect, type Surroundings } from "./types.js";

/** What one status's trigger did, credited to whoever applied the status. */
export interface FiredTrigger {
  readonly sourceId: string;
  readonly skillId: string;
  readonly events: readonly CombatEvent[];
}

/**
 * Contagion's spread, which needs positions (#887): what it did, from
 * `bearer`, for the condition gained, each copy as `caster`'s, the
 * trigger's (#2259): Fevered Dreams' Mesmer's, Contagion's bearer's own.
 * Only the simulation knows where everyone is.
 */
export type SpreadGainedCondition = (
  effect: SpreadGainedConditionEffect,
  bearer: Combatant,
  gained: Extract<StatusChange, { kind: "gained-condition" }>,
  caster: Combatant,
) => CombatEvent[];

/**
 * An event `fireTriggers` fires at once, as the bearer does it: every one
 * but those recorded as status changes, or fired from a summon.
 */
export type DirectTriggerEvent = Exclude<
  StatusTriggerEvent,
  | "bearer-gains-condition"
  | "bearer-gains-hex-or-enchantment"
  | "bearer-applies-hex"
  | "bearer-gains-enchantment"
  | "bearer-loses-enchantment"
  | "bearer-loses-condition"
  | "bearer-blocks"
  | "bearer-interrupted"
  | "bearer-knocked-down"
  | "bearer-sacrifices-health"
  | "bearer-knockdown-prevented"
  | "bearer-health-drops-below"
  | "bearer-fatal-damage-negated"
  | "bearer-creates-creature"
  | "bearer-chant-or-shout-ends"
  | "bearer-dies"
  | "source-targets-bearer"
  | "ends"
  | "ends-early"
  | "expires"
>;

export interface TriggerContext {
  readonly sourceOf: (id: string) => Combatant | undefined;
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
  /**
   * The skill the bearer just used, and its key (#469), on
   * `bearer-uses-skill` (#949): what Diversion lengthens and an echo
   * copies; and the spell, on `bearer-casts-spell` (#1614), whose cost
   * Aura of Restoration reads; and the skill interrupted, on
   * `bearer-interrupted` (#2132), that Persistence of Memory recharges.
   * `undefined` on every other event.
   */
  readonly usedSkill: SlotSkill | undefined;
  /**
   * Whom the bearer's skill, attack or spell was aimed at, on
   * `bearer-uses-skill`, `bearer-casts-spell` and `bearer-attacks`
   * (#2282), and whether it had less Health than the bearer as the attack
   * or the cast began: Zealot's Fire's ally, Spoil Victor's victim.
   * Absent on every other event, and for a skill with no target.
   */
  readonly aimedAt?: AimedAt;
  /**
   * Whole seconds the ending status was on, on its end triggers (#2321):
   * what `held-seconds` counts. Absent on every other event.
   */
  readonly heldSeconds?: number;
}

/** `TriggerContext.aimedAt` (#2282). */
export interface AimedAt {
  readonly id: string;
  readonly hadLessHealth: boolean;
}

/**
 * The bearer did `event` (#469): every status on it that answers fires,
 * once each, in `StatusSet.active` order (ADR-0003). Its effects are its
 * source's, on the trigger's target. A source no longer in the match fires
 * nothing; a dead one still does, as a dead Mesmer's hex keeps working in
 * GW1. A status in `spared`, one the skill being used put on its own user,
 * does not answer that use (#999): Song of Restoration waits for the
 * chanter's next skill. An attack trigger bound to a weapon (#1354)
 * answers only an attack with that weapon in the bearer's main hand.
 * A use trigger bound to a kind of skill (#1437) answers only that kind,
 * one bound to a weaker victim (#2282) only an aim at one.
 *
 * Nothing here fires a trigger: damage from one is never an event that
 * answers another, so triggers cannot recurse.
 */
export function fireTriggers(
  bearer: Combatant,
  event: DirectTriggerEvent,
  context: TriggerContext,
  spared: ReadonlySet<StatusId>,
): FiredTrigger[] {
  return bearer.statuses
    .triggersOn(event)
    .filter(
      ({ statusId, trigger }) =>
        !spared.has(statusId) &&
        (event !== "bearer-attacks" ||
          triggerAnswersWeapon(trigger, bearer.equipment.mainHand.weapon)) &&
        ((event !== "bearer-uses-skill" && event !== "bearer-casts-spell") ||
          (answersUsedSkill(trigger, context.usedSkill) && answersAim(trigger, bearer, context))) &&
        (trigger.victimHasLessHealth === undefined || context.aimedAt?.hadLessHealth === true),
    )
    .flatMap(({ statusId, sourceId, trigger }) =>
      fire(trigger, statusId, sourceId, bearer, context.aimedAt?.id, undefined, context),
    );
}

/**
 * Whether a use trigger bound to a skill on an ally (#2282) or on a foe
 * (#2333) answers the aim: "ally", one at the bearer or at an ally of its,
 * "other-ally" (#2499), one at an ally only, "foe", one at a creature of
 * another team, a dead one too either way. No aim answers neither. Any other trigger answers any aim, and none.
 */
function answersAim(trigger: StatusTrigger, bearer: Combatant, context: TriggerContext): boolean {
  const targets = trigger.usedSkill?.targets;
  if (targets === undefined) {
    return true;
  }
  const aimed = context.aimedAt === undefined ? undefined : context.sourceOf(context.aimedAt.id);
  if (aimed === undefined) {
    return false;
  }
  if (targets === "foe") {
    return aimed.team !== bearer.team;
  }
  return aimed.team === bearer.team && (targets === "ally" || aimed.id !== bearer.id);
}

/**
 * `sourceId` used `used` on the bearer (#2290): every status of its source's
 * on the bearer that answers fires, once each, in `active` order, as
 * `fireTriggers`. Anyone else's statuses do not answer.
 */
export function fireSourceTargetsTriggers(
  bearer: Combatant,
  sourceId: string,
  used: SlotSkill,
  context: TriggerContext,
): FiredTrigger[] {
  return bearer.statuses
    .triggersOn("source-targets-bearer")
    .filter((each) => each.sourceId === sourceId && answersUsedSkill(each.trigger, used))
    .flatMap(({ statusId, trigger }) =>
      fire(trigger, statusId, sourceId, bearer, undefined, undefined, {
        ...context,
        usedSkill: used,
      }),
    );
}

/**
 * Whether a `bearer-uses-skill` trigger answers `used` (#1437): any skill,
 * unless it names a type, or one it must not be (#2290), a profession or
 * an attribute (#1614) the skill must have, or that it be elite (#1473),
 * adrenal (#1592) or a spell (#2132).
 */
function answersUsedSkill(trigger: StatusTrigger, used: SlotSkill | undefined): boolean {
  if (trigger.usedSkill === undefined) {
    return true;
  }
  const skill = used === undefined ? undefined : getSkill(used.skillId);
  return (
    skill !== undefined &&
    (trigger.usedSkill.type === undefined || skill.type === trigger.usedSkill.type) &&
    (trigger.usedSkill.notType === undefined || skill.type !== trigger.usedSkill.notType) &&
    (trigger.usedSkill.spell === undefined || isSpell(skill.type)) &&
    (trigger.usedSkill.attributes === undefined ||
      (skill.attributeId !== undefined &&
        inScope(trigger.usedSkill.attributes, skill.attributeId))) &&
    (trigger.usedSkill.profession === undefined ||
      skill.profession === trigger.usedSkill.profession) &&
    (trigger.usedSkill.elite === undefined || skill.elite) &&
    (trigger.usedSkill.adrenal === undefined || skill.cost?.kind === "adrenaline")
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
 * the bearer, and its `expires` ones too if its duration ran out (#944);
 * its `bearer-dies` ones are `fireDeathTriggers`'s, which the simulation
 * fires apart (#1825).
 * A chant or a shout ended (#1423) renews what renews on that and fires
 * every status still on a living bearer that answers it, after its own.
 * A hit the bearer landed or failed to land (#1332), or physical damage
 * it took (#935), fires what
 * answered it when it happened (#953), so a killing blow still sets off
 * the hexes its death ended. Damage or life steal from a foe (#1022)
 * fires what answered it at that foe, and a block (#1329) what answered
 * it at the attacker, and an interrupt (#1473) what answered it at the
 * interrupter. A heal by a skill (#1913) fires what answered it at
 * the healer. A hex or an enchantment gained (#1403) fires what
 * answered it, toward whoever put it on, and a hex a status broke costs
 * its caster that status's damage. An enchantment lost (#1437) fires what
 * answered it when it went, and a condition lost (#1475) what answered
 * that. The simulation discards whatever the firing itself changes, so
 * this never recurses either.
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
            (effect, caster) => spread(effect, bearer, change, caster),
            context,
          ),
        );
    case "ended": {
      const { category } = getStatusDefinition(change.id);
      const own = fireEndTriggers(bearer, change, context);
      if ((category !== "chant" && category !== "shout") || bearer.dead) {
        return own;
      }
      return [
        ...own,
        ...bearer.statuses
          .chantOrShoutEnded()
          .flatMap(({ statusId, sourceId, trigger }) =>
            fire(trigger, statusId, sourceId, bearer, undefined, undefined, context),
          ),
      ];
    }
    case "hit":
    case "failed-to-hit":
    case "took-physical-damage":
    case "took-elemental-damage":
    case "took-damage":
    case "knocked-down":
    case "sacrificed-health":
    case "knockdown-prevented":
    case "lost-enchantment":
    case "lost-condition":
      return change.fired.flatMap(({ statusId, sourceId, trigger }) =>
        fire(trigger, statusId, sourceId, bearer, undefined, undefined, context),
      );
    case "took-damage-from-foe":
    case "hit-by-attack":
    case "targeted-by-foe":
    case "healed-by-skill":
    case "blocked":
    case "health-dropped":
    case "fatal-negated":
      return change.fired.flatMap(({ statusId, sourceId, trigger }) =>
        fire(trigger, statusId, sourceId, bearer, change.offenderId, undefined, context),
      );
    // The skill interrupted is the one the trigger answers (#2132).
    case "interrupted":
      return change.fired
        .filter(({ trigger }) => answersUsedSkill(trigger, change.skill))
        .flatMap(({ statusId, sourceId, trigger }) =>
          fire(trigger, statusId, sourceId, bearer, change.offenderId, undefined, {
            ...context,
            usedSkill: change.skill,
          }),
        );
    case "gained-hex-or-enchantment":
      return change.fired.flatMap(({ statusId, sourceId, trigger }) =>
        fire(trigger, statusId, sourceId, bearer, change.sourceId, undefined, context),
      );
    case "applied-hex":
      return fireAppliedHex(bearer, change, context);
    case "broke-hex":
      return breakHex(bearer, change, context);
    case "reflected":
      return reflect(bearer, change, context);
    case "reflected-next":
      return reflectNext(change, context);
    // Not a trigger: the simulation lands it on its own (#1108, #1265).
    case "redirected-damage":
    case "charged-source":
      return [];
  }
}

/**
 * A status that `change` ended fires its own `ends` triggers, though it is
 * no longer on the bearer, and its `expires` ones if its duration ran out,
 * else its `ends-early` ones (#944, #1421). Nothing else on the bearer
 * answers here. The simulation calls this alone for a status a trigger
 * ended (#1789), as Faithful Intervention heals when damage ends it.
 */
export function fireEndTriggers(
  bearer: Combatant,
  change: Extract<StatusChange, { kind: "ended" }>,
  context: TriggerContext,
): FiredTrigger[] {
  return getStatusDefinition(change.id)
    .triggers.filter(
      (trigger) =>
        trigger.on === "ends" ||
        (trigger.on === "expires" && change.expired) ||
        (trigger.on === "ends-early" && !change.expired),
    )
    .flatMap((trigger) =>
      fire(trigger, change.id, change.sourceId, bearer, undefined, undefined, {
        ...context,
        heldSeconds: change.heldSeconds,
      }),
    );
}

/**
 * A status that `change` ended by its bearer's death fires its
 * `bearer-dies` triggers (#1762); none for any other end. The simulation
 * fires these for every death, a triggered effect's too (#1825), and
 * discards what they change, so a death one causes fires nothing: one
 * level, as end triggers.
 */
export function fireDeathTriggers(
  bearer: Combatant,
  change: Extract<StatusChange, { kind: "ended" }>,
  context: TriggerContext,
): FiredTrigger[] {
  if (!change.death) {
    return [];
  }
  return getStatusDefinition(change.id)
    .triggers.filter((trigger) => trigger.on === "bearer-dies")
    .flatMap((trigger) =>
      fire(trigger, change.id, change.sourceId, bearer, undefined, undefined, context),
    );
}

/**
 * Who a trigger's effects come from and land on: the source on the bearer
 * or on itself, or (#1022) the bearer on `otherId`, the foe that set it
 * off, or (#1316) the creature it created, or (#1403) the source on
 * `otherId`, who put the gained hex or enchantment on the bearer, or (#1789)
 * the source on `otherId`, the offender, or (#1913) the source on
 * `otherId`, the healer, only a foe of its own, or (#2282) the source on
 * `otherId`, whom the bearer's skill was used on. `undefined` when one of
 * them is gone, or an offender's bearer is dead: then it fires nothing.
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
    case "gained-source":
    case "source-on-offender":
      return other === undefined || other.dead ? undefined : { caster: source, target: other };
    case "healer":
      return other === undefined || other.dead || other.team === source.team
        ? undefined
        : { caster: source, target: other };
    case "hexed-foe":
      return other === undefined || other.dead ? undefined : { caster: bearer, target: other };
    case "skill-target":
      return other === undefined ? undefined : { caster: source, target: other };
  }
}

/**
 * The bearer's hex landed on a foe (#1951): each status that answered it
 * and answers one of that hex's attribute fires, once each, in `active`
 * order, at that foe.
 */
function fireAppliedHex(
  hexer: Combatant,
  change: Extract<StatusChange, { kind: "applied-hex" }>,
  context: TriggerContext,
): FiredTrigger[] {
  const { attribute } = getStatusDefinition(change.id);
  return change.fired
    .filter(({ trigger }) =>
      trigger.appliedHex === undefined
        ? true
        : attribute !== undefined && inScope(trigger.appliedHex.attributes, attribute),
    )
    .flatMap(({ statusId, sourceId, trigger }) =>
      fire(trigger, statusId, sourceId, hexer, change.hexedId, undefined, context),
    );
}

/**
 * A hex the bearer's status broke (#1403): its caster takes that status's
 * damage, typeless, from the bearer. A caster gone or dead takes nothing.
 */
export function breakHex(
  bearer: Combatant,
  change: Extract<StatusChange, { kind: "broke-hex" }>,
  { sourceOf, rng, rules, surroundings }: TriggerContext,
): FiredTrigger[] {
  const caster = sourceOf(change.toId);
  if (caster === undefined || caster.dead) {
    return [];
  }
  const events = applyEffects(
    [{ kind: "damage", amount: { flat: change.damage }, type: "typeless", armorPenetration: 0 }],
    { caster: bearer, target: caster, rng, rules, surroundings, usedSkill: undefined },
  );
  return [{ sourceId: bearer.id, skillId: change.skillId, events }];
}

/**
 * A blow on the bearer its status reflects (#1754): the attacker takes
 * that share, of the status's type, from the status's source, and the
 * status spends a reflection. An attacker dead or gone takes nothing and
 * costs none, as does a source that has left the match. Changes drain
 * once a tick, so a blow recorded after the last reflection was spent,
 * or after the status was stripped, in that same tick reflects nothing.
 */
function reflect(
  bearer: Combatant,
  change: Extract<StatusChange, { kind: "reflected" }>,
  { sourceOf, rng, rules, surroundings }: TriggerContext,
): FiredTrigger[] {
  if (!bearer.statuses.has(change.statusId)) {
    return [];
  }
  const attacker = sourceOf(change.toId);
  const source = sourceOf(change.sourceId);
  const reflects = getStatusDefinition(change.statusId).reflectsAttackDamage;
  if (attacker === undefined || attacker.dead || source === undefined || reflects === undefined) {
    return [];
  }
  const events = applyEffects(
    [{ kind: "damage", amount: { flat: change.damage }, type: reflects.type, armorPenetration: 0 }],
    { caster: source, target: attacker, rng, rules, surroundings, usedSkill: undefined },
  );
  if (bearer.statuses.spendReflection(change.statusId)) {
    events.push({ kind: "status-expired", targetId: bearer.id, statusId: change.statusId });
  }
  return [{ sourceId: source.id, skillId: reflects.skillId, events }];
}

/**
 * Reversal of Damage (#2187): the damage it negated, up to its cap, at
 * whoever dealt it, from the status's source, which ended as it took the
 * packet. Typeless, so no armor step makes it more or less than that (a
 * typed hit at armor 0 would land ~2.8 times over); a dealer or
 * source dead or gone by now takes or deals nothing.
 */
function reflectNext(
  change: Extract<StatusChange, { kind: "reflected-next" }>,
  { sourceOf, rng, rules, surroundings }: TriggerContext,
): FiredTrigger[] {
  const dealer = sourceOf(change.toId);
  const source = sourceOf(change.sourceId);
  const reflects = getStatusDefinition(change.statusId).reflectsNextDamage;
  if (dealer === undefined || dealer.dead || source === undefined || reflects === undefined) {
    return [];
  }
  const events = applyEffects(
    [{ kind: "damage", amount: { flat: change.damage }, type: "typeless", armorPenetration: 0 }],
    { caster: source, target: dealer, rng, rules, surroundings, usedSkill: undefined },
  );
  return [{ sourceId: source.id, skillId: reflects.skillId, events }];
}

/**
 * One trigger's effects, in order, from `parties`. Consecutive skill
 * effects resolve together, so one may read what an earlier one did; a
 * spread with nothing gained does nothing. A status that ends when
 * triggered (#1022), or has fired as many times as it may (#1423), then
 * ends, logged as its expiry, and fires no more: a second record of the
 * same tick, as a dagger's second strike, finds it gone (#2432). The
 * status itself is the effects' firing status (#1473), which "another
 * hex" leaves out.
 */
function fire(
  trigger: StatusTrigger,
  statusId: StatusId,
  sourceId: string,
  bearer: Combatant,
  otherId: string | undefined,
  spread: ((effect: SpreadGainedConditionEffect, caster: Combatant) => CombatEvent[]) | undefined,
  { sourceOf, rng, rules, surroundings, usedSkill, heldSeconds }: TriggerContext,
): FiredTrigger[] {
  const source = sourceOf(sourceId);
  if (
    source === undefined ||
    (trigger.on !== "ends" &&
      getStatusDefinition(statusId).endsWhenTriggered &&
      !bearer.statuses.has(statusId))
  ) {
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
    events.push(
      ...applyEffects(pending, {
        caster,
        target,
        rng,
        rules,
        surroundings,
        usedSkill,
        firingStatusId: statusId,
        profession: getStatusDefinition(statusId).profession,
        heldSeconds,
        // Pious Renewal's (#2438): an end's `recharge-reset` resets its own skill.
        skillId: trigger.on === "ends" ? trigger.skillId : undefined,
      }),
    );
    pending = [];
  };
  for (const effect of trigger.effects) {
    if (effect.kind === "spread-gained-condition") {
      flush();
      events.push(...(spread?.(effect, caster) ?? []));
    } else if (effect.kind === "echo") {
      flush();
      echo(effect, bearer, trigger.skillId, usedSkill);
    } else if (effect.kind === "mirror-stance") {
      flush();
      // The copy is the hex's caster's own: its source, and where a
      // returning stance (Shadow of Haste) brings it back to. Its numbers
      // are the foe's, at the foe's ranks.
      events.push(
        ...applyEffects(stancesOf(usedSkill), {
          caster: source,
          target: source,
          ranksFrom: bearer,
          rng,
          rules,
          surroundings,
          usedSkill: undefined,
        }),
      );
    } else if (effect.kind === "cancel-attack") {
      flush();
      events.push(...cancelAttack(trigger, sourceId, bearer));
    } else if (effect.kind === "pay-energy-or-end") {
      flush();
      if (source.dead || source.energy < effect.amount) {
        bearer.statuses.end(statusId);
        events.push({ kind: "status-expired", targetId: bearer.id, statusId });
        return [{ sourceId, skillId: trigger.skillId, events }];
      }
      source.energy -= effect.amount;
      events.push({ kind: "energy-loss", targetId: source.id, amount: effect.amount });
    } else {
      pending.push(effect);
    }
  }
  flush();
  if (getStatusDefinition(statusId).endsWhenTriggered && bearer.statuses.has(statusId)) {
    bearer.statuses.end(statusId);
    events.push({ kind: "status-expired", targetId: bearer.id, statusId });
  } else if (bearer.statuses.spendTrigger(statusId)) {
    events.push({ kind: "status-expired", targetId: bearer.id, statusId });
  }
  return events.length === 0 ? [] : [{ sourceId, skillId: trigger.skillId, events }];
}

/**
 * Clumsiness's cancel (#1593) of the attack the bearer is beginning: an
 * attack skill is interrupted by `sourceId`, unless it cannot be; a plain
 * swing, which begins while nothing is cast, says so, and the simulation
 * drops the blow. Answering any other event, nothing is beginning.
 */
function cancelAttack(trigger: StatusTrigger, sourceId: string, bearer: Combatant): CombatEvent[] {
  const events: CombatEvent[] = [];
  if (trigger.on !== "bearer-attack-begins") {
    return events;
  }
  if (bearer.cast.isCasting) {
    interruptAttackSkill(bearer, sourceId, events);
  } else {
    events.push({ kind: "attack-interrupted", targetId: bearer.id });
  }
  return events;
}

/**
 * What of `used` a Mirrored Stance copies (#1965): each `apply-status` of
 * a stance, onto its target, whatever the skill put it on.
 */
function stancesOf(used: SlotSkill | undefined): SkillEffect[] {
  const skill = used === undefined ? undefined : getSkill(used.skillId);
  return (skill?.effects ?? []).flatMap((effect) =>
    effect.kind === "apply-status" && getStatusDefinition(effect.statusId).category === "stance"
      ? [
          {
            kind: "apply-status",
            statusId: effect.statusId,
            durationSeconds: effect.durationSeconds,
          },
        ]
      : [],
  );
}

/**
 * An echo answers `used` (#469): the slot of `echoSkillId` on the bearer's
 * bar holds a copy of it for `effect.seconds` (`standIn`). With
 * `spellsOnly`, only for a spell.
 */
function echo(
  effect: EchoEffect,
  bearer: Combatant,
  echoSkillId: string,
  used: SlotSkill | undefined,
): void {
  const skill = used === undefined ? undefined : getSkill(used.skillId);
  if (skill === undefined || (effect.spellsOnly && !isSpell(skill.type))) {
    return;
  }
  standIn(bearer, echoSkillId, skill.id, effect.seconds);
}
