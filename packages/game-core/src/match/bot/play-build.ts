import { AREA_IN_THE_AREA, RANGE_SPELL, RANGE_SPIRIT } from "../../distances.js";
import { getSkill } from "../../skills/catalog.js";
import { mimickedElite } from "../../skills/stand-in.js";
import { raisedMaxHealth } from "../../skills/tick.js";
import type { Skill } from "../../skills/types.js";
import { swingProgress } from "../../skills/weapon-attack.js";
import { distance, ZERO } from "../../vec2.js";
import type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
} from "../behaviour.js";
import type { Participant } from "../simulation.js";
import {
  botUses,
  guardsInterrupt,
  mirrorsStance,
  takenOffFoe,
  interruptAimed,
  mainDamageType,
  onlyInterrupts,
  ownStatuses,
  removedCategories,
  removesFromCaster,
  renewsSpirit,
  sacrificedFraction,
  sacrificesTooMuch,
  WELL_SACRIFICE_FLOOR,
  ownTrapBoost,
  sendsPet,
  wardsTouch,
  wardedDamageType,
} from "./skill-intent.js";

/**
 * `play-build` (#1189): a participant playing its own skill bar the way a
 * sensible GW1 hero does. Each think it does the first of: interrupt a
 * foe's cast or else its swing, heal or protect the most hurt ally, step
 * away when hurt with a foe at hand, take
 * a hex or condition off an ally, raise a dead one, renew a spirit of
 * its own about to expire, boost its attacks as the fight is on, use an offensive
 * skill on the team target, attack it with the weapon, and otherwise walk
 * to the nearest foe. A ranged bot stands and fights a foe at its elbow: at equal speed,
 * backing off would never end.
 *
 * It reads only what a player reads off the screen: positions, teams,
 * health fractions, the statuses on a body, a foe's cast bar and its
 * swing. Never a foe's energy, recharges or bar. Its own state, in full.
 */

type PlayBuild = Extract<Behaviour, { kind: "play-build" }>;
type Guard = Extract<Behaviour, { kind: "guard" }>;

const NOTHING: BehaviourIntent = {
  moveDirection: ZERO,
  moveTo: undefined,
  targetId: undefined,
  useSkillId: undefined,
  attackTargetId: undefined,
  applyStatuses: [],
};

/** Below this share of its health, an ally is worth a heal. */
const HURT_FRACTION = 0.6;

/** Below this share of its lifetime left, a spirit of a bot's own is worth renewing (#1947). */
const RENEW_FRACTION = 0.25;

/** At this Health or less, a bot takes no foe's spirit (#1965): Signet of Binding costs up to 200. */
const BIND_HEALTH_FLOOR = 200;

/** Below this share of its own health, a bot with a foe at hand steps away (#1930). */
const ESCAPE_FRACTION = 0.5;

/** A foe this near is at hand (#1930): GW1's "in the area". */
const ESCAPE_THREAT_UNITS = AREA_IN_THE_AREA;

/** How much longer than the interrupt itself a cast or a swing must have left. */
const INTERRUPT_MARGIN_SECONDS = 0.25;

/** A cast this long or longer is worth a guard against interrupts (#1964). */
const GUARDED_CAST_SECONDS = 2;

/**
 * A guard walking back acts again within this of its post (#1222), or
 * its leash if shorter: not at the leash's edge, so it does not flicker.
 */
const GUARD_HOME_UNITS = 30;

/** A foe this close with a touch skill on its bar is one to ward off (#1966). */
const TOUCH_THREAT_UNITS = 300;

/** A pet at least this far from the foe is worth sending to it (#1966): Strike as One. */
const PET_SEND_UNITS = 300;

export function playBuild(
  behaviour: PlayBuild,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  return paced(behaviour.thinkSeconds, cursor, context, () => {
    const foes = livingFoes(context);
    return think(context, foes, livingMembers(context), teamTarget(context, foes));
  });
}

/**
 * `guard` (#1222): `play-build` against only the foes within `aggroUnits`
 * of its post, the weakest of them its target, never the team's. Past the
 * leash it walks back, dropping its target, until home again; with no foe
 * near and no ally to heal, it walks back too. Rooted, it never moves, and
 * fights only the foes it sees: it cannot walk round a wall to one. Its
 * allies are its team's bodies near its post, the map's NPCs among them
 * (#1223), its Guild Lord first, so a tie heals the lord.
 */
export function guard(
  behaviour: Guard,
  cursor: BehaviourCursor,
  context: BehaviourContext,
): BehaviourIntent {
  const self = context.self;
  const home = distance(self.position, behaviour.post);
  if (cursor.returning && home <= Math.min(GUARD_HOME_UNITS, behaviour.leashUnits)) {
    cursor.returning = false;
  } else if (!cursor.returning && home > behaviour.leashUnits) {
    cursor.returning = true;
  }
  const foes = livingFoes(context).filter(
    (foe) =>
      distance(foe.position, behaviour.post) <= behaviour.aggroUnits &&
      (!behaviour.rooted || context.sees(foe.position)),
  );
  const team = self.combatant.team;
  const allies = context.participants
    .filter(
      (other) =>
        !other.combatant.dead &&
        other.combatant.team === team &&
        other.creature?.ownerId === undefined &&
        (other.id === self.id || distance(other.position, behaviour.post) <= behaviour.aggroUnits),
    )
    .sort((a, b) => lordFirst(a) - lordFirst(b));
  const healing = allies.some((ally) => healthFraction(ally) < HURT_FRACTION);
  if (cursor.returning || (foes.length === 0 && !healing)) {
    cursor.heldMove = { moveTo: undefined };
    return behaviour.rooted || home <= context.stepUnits
      ? NOTHING
      : { ...NOTHING, moveTo: behaviour.post };
  }
  const intent = paced(behaviour.thinkSeconds, cursor, context, () =>
    think(context, foes, allies, weakest(self, foes)?.id),
  );
  return behaviour.rooted ? { ...intent, moveDirection: ZERO, moveTo: undefined } : intent;
}

/**
 * Think every `thinkSeconds` with `decide`, and in between hold what it
 * last asked for; nothing new while its last skill is still going.
 */
function paced(
  thinkSeconds: number,
  cursor: BehaviourCursor,
  context: BehaviourContext,
  decide: () => BehaviourIntent,
): BehaviourIntent {
  const self = context.self;
  const cast = self.combatant.cast;
  const holding = { ...NOTHING, targetId: self.targetId };
  cursor.waitSeconds = Math.max(0, cursor.waitSeconds - context.dt);
  // Nothing new while what it last asked for is still going: the retry
  // bound, so it never presses twice for one skill.
  if (cast.isCasting || cast.inAftercast || self.pendingSkill !== undefined) {
    return holding;
  }
  if (cursor.waitSeconds > 0) {
    return { ...holding, ...cursor.heldMove };
  }
  cursor.waitSeconds = thinkSeconds;
  const intent = decide();
  cursor.heldMove = { moveTo: intent.moveTo };
  return intent;
}

/** 0 for a Guild Lord, 1 for anyone else: a stable sort puts the lord first. */
function lordFirst(participant: Participant): number {
  return participant.creature?.kind === "guild-lord" ? 0 : 1;
}

/** The living players of `context.self`'s team, itself included, in simulation order. */
function livingMembers(context: BehaviourContext): Participant[] {
  const team = context.self.combatant.team;
  return context.participants.filter(
    (other) =>
      !other.combatant.dead && other.combatant.team === team && other.creature === undefined,
  );
}

/** The living foes of `context.self`, in simulation order. */
function livingFoes(context: BehaviourContext): Participant[] {
  const team = context.self.combatant.team;
  return context.participants.filter(
    (other) => !other.combatant.dead && other.combatant.team !== team,
  );
}

/**
 * One decision against `foes`, for `allies` (its own included), with
 * `targetId` the one to fight.
 */
function think(
  context: BehaviourContext,
  foes: readonly Participant[],
  allies: readonly Participant[],
  targetId: string | undefined,
): BehaviourIntent {
  const self = context.self;
  const team = self.combatant.team;
  const bar = skillsOf(self);
  const nearestFirst = (bodies: readonly Participant[]): Participant[] =>
    [...bodies].sort(
      (a, b) => distance(a.position, self.position) - distance(b.position, self.position),
    );
  // Out of range or out of sight, the simulation walks it in (#499). Never
  // a well by a sacrifice it cannot afford (#1730).
  const mayUse = (skill: Skill, targetId: string | undefined): boolean => {
    if (sacrificesTooMuch(skill, self.position, healthFraction(self), context.participants)) {
      return false;
    }
    const check = context.check(skill.id, targetId);
    return check.ok || check.reason === "out-of-range" || check.reason === "no-line-of-sight";
  };
  const use = (skill: Skill, targetId: string | undefined): BehaviourIntent => ({
    ...NOTHING,
    targetId,
    useSkillId: skill.id,
  });
  // 1. Interrupt a cast it can still beat; with none worth it, a plain
  // swing (#1713). Only what the interrupt would land on, filter and
  // condition read (`interruptAimed`): never a spell interrupt at a signet.
  const interrupts = bar.filter((skill) => botUses(skill).includes("interrupt"));
  const interrupting = (lands: "cast" | "swing", foe: Participant, leftSeconds: number) =>
    interrupts.find(
      (held) =>
        leftSeconds > windUpSeconds(self, held) + INTERRUPT_MARGIN_SECONDS &&
        interruptAimed(held, self.combatant, foe.combatant) === lands &&
        mayUse(held, foe.id),
    );
  for (const foe of foes) {
    const activeCast = foe.combatant.cast.activeCast;
    const skill =
      activeCast === undefined ? undefined : interrupting("cast", foe, activeCast.remainingSeconds);
    if (skill !== undefined) {
      return use(skill, foe.id);
    }
  }
  for (const foe of foes) {
    const swing = swingProgress(foe.combatant);
    const skill = interrupting("swing", foe, swing.total - swing.elapsed);
    if (skill !== undefined) {
      return use(skill, foe.id);
    }
  }

  // 2. Heal or protect the most hurt ally, itself included.
  let hurt: Participant | undefined;
  for (const ally of allies) {
    if (hurt === undefined || healthFraction(ally) < healthFraction(hurt)) {
      hurt = ally;
    }
  }
  if (hurt !== undefined && healthFraction(hurt) < HURT_FRACTION) {
    const patient = hurt;
    // A self-targeted skill reaches the caster, unless its area spares the
    // caster (Healing Ring, #1870): then only an ally beside it, so it is
    // never cast for the caster alone or into foes only.
    const reaches = (held: Skill): boolean => {
      if (held.target !== "self") {
        return true;
      }
      const area = held.area;
      if (area?.origin !== "caster" || area.includesCaster) {
        return patient.id === self.id;
      }
      return patient.id !== self.id && distance(patient.position, self.position) <= area.radius;
    };
    for (const role of ["healing", "defence"] as const) {
      const skill = bar.find(
        (held) =>
          botUses(held).includes(role) &&
          wardedDamageType(held) === undefined &&
          reaches(held) &&
          mayUse(held, held.target === "self" ? self.id : patient.id),
      );
      if (skill !== undefined) {
        return use(skill, skill.target === "self" ? self.id : patient.id);
      }
    }
  }

  // 2b. Hurt with a foe at hand, and nothing to heal it (#1930): step
  // away to the creature of its side farthest from that foe, one farther
  // than it stands, in reach now; never a walk towards one.
  const threat = nearestLiving(self, foes);
  if (
    healthFraction(self) < ESCAPE_FRACTION &&
    threat !== undefined &&
    distance(threat.position, self.position) <= ESCAPE_THREAT_UNITS
  ) {
    const fromThreat = (body: Participant): number => distance(body.position, threat.position);
    const havens = context.participants
      .filter(
        (other) =>
          !other.combatant.dead &&
          other.combatant.team === team &&
          other.creature !== undefined &&
          fromThreat(other) > fromThreat(self),
      )
      .sort((a, b) => fromThreat(b) - fromThreat(a));
    for (const skill of bar.filter((held) => botUses(held).includes("escape"))) {
      const haven = havens.find((other) => context.check(skill.id, other.id).ok);
      if (haven !== undefined) {
        return use(skill, haven.id);
      }
    }
  }

  // 2c. A foe at hand with a touch skill (#1966): ward it off first, as
  // "Can't Touch This!", unless it already is.
  const touching = foes.some(
    (foe) =>
      distance(foe.position, self.position) <= TOUCH_THREAT_UNITS &&
      foe.skillBar.some((id) => id !== null && getSkill(id)?.touch === true),
  );
  if (touching) {
    const ward = bar.find(
      (held) =>
        wardsTouch(held) &&
        !held.effects.some(
          (effect) =>
            effect.kind === "apply-status" && self.combatant.statuses.has(effect.statusId),
        ) &&
        mayUse(held, self.id),
    );
    if (ward !== undefined) {
      return use(ward, self.id);
    }
  }

  // 3. Take a hex or a condition off the nearest ally bearing one.
  for (const ally of nearestFirst(allies)) {
    const statuses = ally.combatant.statuses;
    for (const skill of bar) {
      const takesOff = removedCategories(skill).some(
        (category) => statuses.countByCategory(category) > 0,
      );
      if (!takesOff) {
        continue;
      }
      // Off the caster: only for itself, cast where the skill says.
      const castOn = removesFromCaster(skill)
        ? ally.id === self.id
          ? skill.target === "single-enemy"
            ? targetId
            : self.id
          : undefined
        : skill.target === "self" && ally.id !== self.id
          ? undefined
          : ally.id;
      if (castOn !== undefined && mayUse(skill, castOn)) {
        return use(skill, castOn);
      }
    }
  }

  // 4. Raise the nearest dead ally.
  const raises = bar.filter((skill) => botUses(skill).includes("resurrect"));
  if (raises.length > 0) {
    const corpses = context.participants.filter(
      (other) =>
        other.combatant.dead &&
        other.combatant.team === team &&
        other.creature === undefined &&
        other.id !== self.id,
    );
    for (const corpse of nearestFirst(corpses)) {
      const skill = raises.find((held) => mayUse(held, corpse.id));
      if (skill !== undefined) {
        return use(skill, corpse.id);
      }
    }
  }

  // 4b. Renew a spirit of its own near its end with a foe in its reach
  // (#1947), as Gaze of Fury: the new one fights on where it stood.
  const renews = bar.filter(renewsSpirit);
  if (renews.length > 0) {
    const ending = context.participants.filter(
      ({ combatant, creature, position }) =>
        creature?.kind === "spirit" &&
        creature.ownerId === self.id &&
        !combatant.dead &&
        creature.expiresInSeconds <
          RENEW_FRACTION * (creature.ageSeconds + creature.expiresInSeconds) &&
        foes.some((foe) => distance(foe.position, position) <= RANGE_SPIRIT),
    );
    for (const spirit of ending) {
      const skill = renews.find((held) => mayUse(held, spirit.id));
      if (skill !== undefined) {
        return use(skill, spirit.id);
      }
    }
  }

  // 4c. A mantra before it is needed (#1964), never one already up: a
  // guard against interrupts with a long cast on its bar and a foe in
  // reach that holds an interrupt, or one damage type's cut with a foe in
  // reach that deals mostly that type.
  const mantras = bar.filter(
    (held) => guardsInterrupt(held) || wardedDamageType(held) !== undefined,
  );
  if (mantras.length > 0) {
    const inReach = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
    const longCast = bar.some((held) => held.activationSeconds >= GUARDED_CAST_SECONDS);
    for (const skill of mantras) {
      if (
        ownStatuses(skill).some((id) => self.combatant.statuses.has(id)) ||
        !mayUse(skill, self.id)
      ) {
        continue;
      }
      const type = wardedDamageType(skill);
      const wanted =
        type === undefined
          ? longCast &&
            inReach.some((foe) => skillsOf(foe).some((held) => botUses(held).includes("interrupt")))
          : inReach.some((foe) => mainDamageType(skillsOf(foe)) === type);
      if (wanted) {
        return use(skill, self.id);
      }
    }
  }

  // 4d. Take a foe's spirit in reach (#1965), as Signet of Binding, with
  // Health to spare for its price.
  const binds = bar.filter((skill) => skill.target === "enemy-spirit");
  if (binds.length > 0 && self.combatant.health > BIND_HEALTH_FLOOR) {
    const theirs = context.participants.filter(
      ({ combatant, creature, position }) =>
        creature?.kind === "spirit" &&
        creature.ownerId !== undefined &&
        combatant.team !== team &&
        !combatant.dead &&
        distance(position, self.position) <= RANGE_SPELL,
    );
    for (const spirit of nearestFirst(theirs)) {
      const skill = binds.find((held) => mayUse(held, spirit.id));
      if (skill !== undefined) {
        return use(skill, spirit.id);
      }
    }
  }

  // 4e. Boost the side's attacks (#2000), never one already up, as the
  // fight is on: a foe in the caster's weapon reach, or for a party or an
  // area round it, in reach of a member's weapon there. Never paid for in
  // Health the caster cannot spare.
  const swinging = (body: Participant): boolean =>
    foes.some(
      (foe) =>
        distance(foe.position, body.position) <= body.combatant.equipment.mainHand.weapon.range,
    );
  const boost = bar.find((held) => {
    if (
      !botUses(held).includes("boost") ||
      ownStatuses(held).some((id) => self.combatant.statuses.has(id)) ||
      healthFraction(self) - sacrificedFraction(held) < WELL_SACRIFICE_FLOOR
    ) {
      return false;
    }
    const area = held.area;
    const members =
      area === undefined
        ? [self]
        : area.origin === "party"
          ? allies
          : allies.filter((ally) => distance(ally.position, self.position) <= area.radius);
    return members.some(swinging) && mayUse(held, self.id);
  });
  if (boost !== undefined) {
    return use(boost, self.id);
  }

  if (targetId !== undefined) {
    // 5. Offence, in bar order. A copier or a stripper only at a foe with
    // what it takes (#1928, #1954): Inspired Enchantment and Mirror of
    // Disenchantment at an enchanted one. Mirrored Stance only at a foe
    // with a stance to use (#1965).
    const foe = context.participants.find((other) => other.id === targetId)?.combatant;
    const copies = (held: Skill): boolean => {
      const category = takenOffFoe(held);
      return category === undefined || (foe?.statuses.countByCategory(category) ?? 0) > 0;
    };
    // Strike as One (#1966) only with a living pet far enough from the foe
    // to be worth the leap.
    const pet = context.participants.find(
      ({ combatant, creature }) =>
        creature?.ownerId === self.id && creature.companionSkillId !== undefined && !combatant.dead,
    );
    const target = context.participants.find((other) => other.id === targetId);
    const petFar =
      pet !== undefined &&
      target !== undefined &&
      distance(pet.position, target.position) >= PET_SEND_UNITS;
    const hasStance =
      foe?.skillBar.some((id) => id !== null && getSkill(id)?.type === "stance") ?? false;
    const skill = bar.find(
      (held) =>
        botUses(held).includes("offence") &&
        !onlyInterrupts(held) &&
        copies(held) &&
        (!sendsPet(held) || petFar) &&
        (hasStance || !mirrorsStance(held)) &&
        mayUse(held, targetId),
    );
    // A trap goes down under Trapper's Focus or Speed when the bar has one
    // not yet up (#1966).
    if (skill?.type === "trap") {
      const boost = bar.find((held) => {
        const statusId = ownTrapBoost(held);
        return (
          statusId !== undefined && !self.combatant.statuses.has(statusId) && mayUse(held, self.id)
        );
      });
      if (boost !== undefined) {
        return use(boost, self.id);
      }
    }
    if (skill !== undefined) {
      return use(skill, targetId);
    }
    // 6. The weapon.
    return { ...NOTHING, targetId, attackTargetId: targetId };
  }

  // 6b. No foe in reach: borrow an ally's elite (#1965), as Arcane
  // Mimicry, one that is no attack and not on its own bar already.
  const mimics = bar.filter((skill) =>
    skill.effects.some((effect) => effect.kind === "copy-elite"),
  );
  for (const ally of mimics.length === 0 ? [] : nearestFirst(allies)) {
    const elite = ally.id === self.id ? undefined : mimickedElite(ally.combatant.skillBar);
    if (
      elite === undefined ||
      getSkill(elite)?.type === "attack" ||
      self.skillBar.includes(elite)
    ) {
      continue;
    }
    const skill = mimics.find((held) => mayUse(held, ally.id));
    if (skill !== undefined) {
      return use(skill, ally.id);
    }
  }

  // 7. Nothing to fight in reach: walk to the nearest foe, whatever the
  // weapon. Maps spawn teams beyond spell range.
  const nearest = nearestLiving(self, foes);
  return nearest === undefined ? NOTHING : { ...NOTHING, moveTo: nearest.position };
}

/**
 * The foe the team called (#1193), while it is alive; else the foe the
 * team's bots already target, if one is alive; else the living foe within
 * spell range with the lowest health fraction, ties to the nearer, then
 * simulation order. A creature only while no other foe is in range.
 */
function teamTarget(context: BehaviourContext, foes: readonly Participant[]): string | undefined {
  const called = foes.find((foe) => foe.id === context.calledTargetId);
  if (called !== undefined) {
    return called.id;
  }
  const self = context.self;
  const inRange = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
  const eligible = fightable(inRange);
  for (const ally of context.participants) {
    if (
      ally.combatant.team !== self.combatant.team ||
      ally.combatant.dead ||
      !context.isBot(ally.id)
    ) {
      continue;
    }
    const held = foes.find((foe) => foe.id === ally.targetId);
    if (held !== undefined && eligible(held)) {
      return held.id;
    }
  }
  return weakest(self, inRange)?.id;
}

/** Of `foes`, a creature only while none of them is a fighter. */
function fightable(foes: readonly Participant[]): (foe: Participant) => boolean {
  const fighters = foes.some((foe) => foe.creature === undefined);
  return (foe) => !fighters || foe.creature === undefined;
}

/**
 * Of `foes`, the one with the lowest health fraction, ties to the nearer
 * to `self`, then simulation order; a creature only while none is a fighter.
 */
function weakest(self: Participant, foes: readonly Participant[]): Participant | undefined {
  const eligible = fightable(foes);
  let best: Participant | undefined;
  for (const foe of foes) {
    if (!eligible(foe)) {
      continue;
    }
    if (
      best === undefined ||
      healthFraction(foe) < healthFraction(best) ||
      (healthFraction(foe) === healthFraction(best) &&
        distance(foe.position, self.position) < distance(best.position, self.position))
    ) {
      best = foe;
    }
  }
  return best;
}

function nearestLiving(self: Participant, foes: readonly Participant[]): Participant | undefined {
  let best: Participant | undefined;
  for (const foe of foes) {
    if (
      best === undefined ||
      distance(foe.position, self.position) < distance(best.position, self.position)
    ) {
      best = foe;
    }
  }
  return best;
}

/** The skills on `participant`'s bar, its empty slots left out. */
function skillsOf(participant: Participant): Skill[] {
  return participant.skillBar.flatMap((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return skill === undefined ? [] : [skill];
  });
}

function healthFraction(participant: Participant): number {
  const maxHealth = raisedMaxHealth(participant.combatant);
  return maxHealth > 0 ? participant.combatant.health / maxHealth : 0;
}

/**
 * How long `skill` takes to land once begun: its activation, or for an
 * attack skill half of it, or of a swing of the weapon in hand when it
 * states none (ADR-0029). Attack speed is left out.
 */
function windUpSeconds(self: Participant, skill: Skill): number {
  if (skill.attack === undefined) {
    return skill.activationSeconds;
  }
  const base =
    skill.activationSeconds > 0
      ? skill.activationSeconds
      : self.combatant.equipment.mainHand.weapon.attackIntervalSeconds;
  return base / 2;
}
