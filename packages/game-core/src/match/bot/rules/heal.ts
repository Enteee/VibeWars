import type { Participant } from "../../simulation.js";
import type { Skill } from "../../../skills/types.js";
import type { StatusId } from "../../../skills/status.js";
import { isAttacking, isCastingSpell } from "../../../skills/attacking.js";
import { RANGE_SPELL } from "../../../distances.js";
import { distance } from "../../../vec2.js";
import {
  botUses,
  defenceAgainst,
  projectsToOthers,
  summonAura,
  wardedDamageType,
  type DefenceAgainst,
} from "../skill-intent.js";
import { airFirst } from "./setup.js";
import {
  EMERGENCY_FRACTION,
  HURT_FRACTION,
  SPIKE_FOES,
  healthFraction,
  keepsReserve,
  spiritUp,
} from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Protect the ally the foes are spiking before the damage lands (#2627),
 * else heal or protect the most hurt ally, itself included.
 */
const heal: BotRule = {
  order: 20,
  name: "heal",
  decide: (rule) => {
    const { context, self, bar, allies, foes, mayUse, use } = rule;
    const castable = (held: Skill, patient: Participant): boolean =>
      wardedDamageType(held) === undefined &&
      reaches(self, patient, held) &&
      !spiritUp(context, self, held) &&
      mayUse(held, held.target === "self" ? self.id : patient.id);
    const spiked = spikedAlly(allies, foes);
    if (spiked !== undefined) {
      const skill = matchingDefence(
        bar.filter(
          (held) =>
            botUses(held).includes("defence") &&
            !laidStatuses(held).some((id) =>
              (held.target === "self" ? self : spiked).combatant.statuses.has(id),
            ) &&
            castable(held, spiked),
        ),
        threatOn(spiked, foes),
      );
      if (skill !== undefined) {
        const castOn = skill.target === "self" ? self.id : spiked.id;
        return use(airFirst(rule, skill, castOn) ?? skill, castOn);
      }
    }
    let hurt: Participant | undefined;
    for (const ally of allies) {
      if (hurt === undefined || healthFraction(ally) < healthFraction(hurt)) {
        hurt = ally;
      }
    }
    if (hurt === undefined || healthFraction(hurt) >= HURT_FRACTION) {
      return undefined;
    }
    const patient = hurt;
    // Above EMERGENCY_FRACTION and not spiked, a healer keeps its reserve (#4275).
    const emergency = patient === spiked || healthFraction(patient) < EMERGENCY_FRACTION;
    const affords = (held: Skill): boolean =>
      castable(held, patient) && (emergency || !keepsReserve(self, held, patient));
    const skill =
      bar.find((held) => botUses(held).includes("healing") && affords(held)) ??
      matchingDefence(
        bar.filter((held) => botUses(held).includes("defence") && affords(held)),
        threatOn(patient, foes),
      );
    if (skill === undefined) {
      return undefined;
    }
    const castOn = skill.target === "self" ? self.id : patient.id;
    // A dear enchantment goes on cheaper with Air of Enchantment first (#1975).
    return use(airFirst(rule, skill, castOn) ?? skill, castOn);
  },
};

/**
 * Whether a self-targeted skill reaches `patient`: the caster, unless its
 * area spares the caster (Healing Ring, #1870): then only an ally beside it,
 * so it is never cast for the caster alone or into foes only. Protector's
 * Defense (#2096) only for an ally beside it, and never while it has a move
 * pending.
 */
function reaches(self: Participant, patient: Participant, held: Skill): boolean {
  if (held.target !== "self") {
    return true;
  }
  const beside = projectsToOthers(held);
  if (beside !== undefined) {
    return (
      patient.id !== self.id &&
      self.walkGoal === undefined &&
      distance(patient.position, self.position) <= beside
    );
  }
  // A spirit whose aura reaches allies (#2491), Shelter's or Recovery's,
  // is for a patient inside that aura, the caster among them.
  const aura = allyAuraRadius(held);
  if (aura !== undefined) {
    return distance(patient.position, self.position) <= aura;
  }
  const area = held.area;
  if (area?.origin !== "caster" || area.includesCaster) {
    return patient.id === self.id;
  }
  return patient.id !== self.id && distance(patient.position, self.position) <= area.radius;
}

/**
 * The ally at least `SPIKE_FOES` foes within spell range of it target
 * (#2627): the one with the most foes on it, then the most hurt, then the
 * first.
 */
function spikedAlly(
  allies: readonly Participant[],
  foes: readonly Participant[],
): Participant | undefined {
  let spiked: Participant | undefined;
  let most = SPIKE_FOES - 1;
  for (const ally of allies) {
    let on = 0;
    for (const foe of foes) {
      if (foe.targetId === ally.id && distance(foe.position, ally.position) <= RANGE_SPELL) {
        on += 1;
      }
    }
    if (
      on > most ||
      (on === most && spiked !== undefined && healthFraction(ally) < healthFraction(spiked))
    ) {
      spiked = ally;
      most = on;
    }
  }
  return spiked;
}

/** How many attackers and casters target an ally (#4214). */
interface Threat {
  readonly attackers: number;
  readonly casters: number;
}

/**
 * The foes within spell range of `ally` targeting it, as `spikedAlly`
 * counts them (#4214): a caster if it is casting a spell, a wand order
 * standing behind it or not; else an attacker if it is attacking or
 * running up to swing, a warrior closing in before its first swing; else
 * a caster.
 */
function threatOn(ally: Participant, foes: readonly Participant[]): Threat {
  let attackers = 0;
  let casters = 0;
  for (const foe of foes) {
    if (foe.targetId === ally.id && distance(foe.position, ally.position) <= RANGE_SPELL) {
      const { combatant } = foe;
      if (
        !isCastingSpell(combatant) &&
        (isAttacking(combatant) || combatant.attack !== undefined)
      ) {
        attackers += 1;
      } else {
        casters += 1;
      }
    }
  }
  return { attackers, casters };
}

/**
 * The defence skill of `candidates` that fits `threat` (#4214). Under a
 * threat, none that stops only attacks with no attacker on the ally, or
 * only spells with no caster. Then the first that stops only what most of
 * the threat is, a block stance against warriors; on a tie, or with no
 * threat, the first general one; then bar order.
 */
function matchingDefence(candidates: readonly Skill[], threat: Threat): Skill | undefined {
  const threatened = threat.attackers + threat.casters > 0;
  const fitting = candidates.filter((held) => {
    const against = defenceAgainst(held);
    return (
      !threatened ||
      ((against.spells || threat.attackers > 0) && (against.attacks || threat.casters > 0))
    );
  });
  const first = (fits: (against: DefenceAgainst) => boolean): Skill | undefined =>
    fitting.find((held) => fits(defenceAgainst(held)));
  const preferred =
    threat.attackers > threat.casters
      ? first((against) => against.attacks && !against.spells)
      : threat.casters > threat.attackers
        ? first((against) => against.spells && !against.attacks)
        : first((against) => against.attacks && against.spells);
  return preferred ?? fitting[0];
}

/**
 * The statuses `skill` lays on whoever it is cast on, maintained ones
 * included (Protective Bond); none its caster wears instead.
 */
function laidStatuses(skill: Skill): StatusId[] {
  return skill.effects.flatMap((effect) =>
    (effect.kind === "apply-status" && effect.on === undefined) ||
    (effect.kind === "maintain-status" && effect.on === "target")
      ? [effect.statusId]
      : [],
  );
}

/** The radius of the ally aura of the spirit `skill` summons, if it has one. */
function allyAuraRadius(skill: Skill): number | undefined {
  const aura = summonAura(skill);
  return aura?.affects === "allies" ? aura.radius : undefined;
}

export default heal;
