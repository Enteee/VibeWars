import { RANGE_MELEE, RANGE_SPELL } from "../../distances.js";
import { wieldsFor } from "../../equipment/weapons.js";
import { getSkill } from "../../skills/catalog.js";
import type { Skill } from "../../skills/types.js";
import { distance, normalize, sub, ZERO } from "../../vec2.js";
import type {
  Behaviour,
  BehaviourContext,
  BehaviourCursor,
  BehaviourIntent,
} from "../behaviour.js";
import type { Participant } from "../simulation.js";
import { botUses, onlyInterrupts, removedCategories, removesFromCaster } from "./skill-intent.js";

/**
 * `play-build` (#1189): a participant playing its own skill bar the way a
 * sensible GW1 hero does. Each think it does the first of: interrupt a
 * foe's cast, heal or protect the most hurt ally, take a hex or condition
 * off an ally, raise a dead one, use an offensive skill on the team
 * target, attack it with the weapon, and otherwise close in (melee) or
 * hold (anything else). A ranged bot with a foe at its elbow backs off
 * instead of attacking, until a wall stops it.
 *
 * It reads only what a player reads off the screen: positions, teams,
 * health fractions, the statuses on a body and a foe's cast bar. Never a
 * foe's energy, recharges or bar. Its own state, in full.
 */

type PlayBuild = Extract<Behaviour, { kind: "play-build" }>;

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

/** How much longer than the interrupt itself a cast must have left. */
const INTERRUPT_MARGIN_SECONDS = 0.25;

/** A ranged bot backs off from a living foe this close. */
const KITE_UNITS = RANGE_MELEE * 3;

export function playBuild(
  behaviour: PlayBuild,
  cursor: BehaviourCursor,
  context: BehaviourContext,
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
  cursor.waitSeconds = behaviour.thinkSeconds;
  // Backing off got it nowhere: a wall or a corner. It turns and fights,
  // and keeps fighting while a foe is that close: backing off again would
  // cancel each swing it began.
  if (nearestFoeWithin(self, context.participants, KITE_UNITS) === undefined) {
    cursor.cornered = false;
  } else if (cursor.backingOff && !self.combatant.moving) {
    cursor.cornered = true;
  }
  const intent = think(context, cursor.cornered);
  cursor.heldMove = { moveDirection: intent.moveDirection, moveTo: intent.moveTo };
  // The only push `think` makes is a back-off.
  cursor.backingOff = intent.moveDirection.x !== 0 || intent.moveDirection.y !== 0;
  return intent;
}

/** The nearest living foe of `self` within `units`, if any. */
function nearestFoeWithin(
  self: Participant,
  participants: readonly Participant[],
  units: number,
): Participant | undefined {
  const near = nearestLiving(
    self,
    participants.filter(
      (other) => !other.combatant.dead && other.combatant.team !== self.combatant.team,
    ),
  );
  return near !== undefined && distance(near.position, self.position) <= units ? near : undefined;
}

function think(context: BehaviourContext, cornered: boolean): BehaviourIntent {
  const self = context.self;
  const team = self.combatant.team;
  const living = context.participants.filter((other) => !other.combatant.dead);
  const foes = living.filter((other) => other.combatant.team !== team);
  const allies = living.filter(
    (other) => other.combatant.team === team && other.creature === undefined,
  );
  const bar = self.skillBar.flatMap((id) => {
    const skill = id === null ? undefined : getSkill(id);
    return skill === undefined ? [] : [skill];
  });
  const nearestFirst = (bodies: readonly Participant[]): Participant[] =>
    [...bodies].sort(
      (a, b) => distance(a.position, self.position) - distance(b.position, self.position),
    );
  // Out of range or out of sight, the simulation walks it in (#499).
  const mayUse = (skill: Skill, targetId: string | undefined): boolean => {
    const check = context.check(skill.id, targetId);
    return check.ok || check.reason === "out-of-range" || check.reason === "no-line-of-sight";
  };
  const use = (skill: Skill, targetId: string | undefined): BehaviourIntent => ({
    ...NOTHING,
    targetId,
    useSkillId: skill.id,
  });
  const targetId = teamTarget(context, foes);

  // 1. Interrupt a cast it can still beat.
  const interrupts = bar.filter((skill) => botUses(skill).includes("interrupt"));
  for (const foe of foes) {
    const activeCast = foe.combatant.cast.activeCast;
    if (activeCast === undefined) {
      continue;
    }
    const skill = interrupts.find(
      (held) =>
        activeCast.remainingSeconds > windUpSeconds(self, held) + INTERRUPT_MARGIN_SECONDS &&
        mayUse(held, foe.id),
    );
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
    for (const role of ["healing", "defence"] as const) {
      const skill = bar.find(
        (held) =>
          botUses(held).includes(role) &&
          (held.target !== "self" || patient.id === self.id) &&
          mayUse(held, patient.id),
      );
      if (skill !== undefined) {
        return use(skill, patient.id);
      }
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

  // 7, first half: a ranged bot with a foe at its elbow backs off,
  // unless backing off has got it nowhere.
  const melee = wieldsFor(self.combatant.equipment.mainHand.weapon.id, "melee");
  if (!melee && !cornered) {
    const near = nearestFoeWithin(self, foes, KITE_UNITS);
    if (near !== undefined) {
      const d = distance(near.position, self.position);
      // On top of it there is no "away": +x, so the choice is deterministic.
      const away = d < 1e-9 ? { x: 1, y: 0 } : normalize(sub(self.position, near.position));
      return { ...NOTHING, targetId, moveDirection: away };
    }
  }

  if (targetId !== undefined) {
    // 5. Offence, in bar order.
    const skill = bar.find(
      (held) =>
        botUses(held).includes("offence") && !onlyInterrupts(held) && mayUse(held, targetId),
    );
    if (skill !== undefined) {
      return use(skill, targetId);
    }
    // 6. The weapon.
    return { ...NOTHING, targetId, attackTargetId: targetId };
  }

  // 7. Nothing to fight in reach: melee closes in, anything else holds.
  const nearest = melee ? nearestLiving(self, foes) : undefined;
  return nearest === undefined ? NOTHING : { ...NOTHING, moveTo: nearest.position };
}

/**
 * The foe the team's bots already target, if one is alive; else the
 * living foe within spell range with the lowest health fraction, ties to
 * the nearer, then simulation order. A creature only while no other foe
 * is in range.
 */
function teamTarget(context: BehaviourContext, foes: readonly Participant[]): string | undefined {
  const self = context.self;
  const inRange = foes.filter((foe) => distance(foe.position, self.position) <= RANGE_SPELL);
  const fightersInRange = inRange.some((foe) => foe.creature === undefined);
  const eligible = (foe: Participant): boolean => !fightersInRange || foe.creature === undefined;
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
  let best: Participant | undefined;
  for (const foe of inRange) {
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
  return best?.id;
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

function healthFraction(participant: Participant): number {
  const { health, maxHealth } = participant.combatant;
  return maxHealth > 0 ? health / maxHealth : 0;
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
