import type { Participant } from "../../simulation.js";
import type { Skill } from "../../../skills/types.js";
import type { StatusId } from "../../../skills/status.js";
import { distance } from "../../../vec2.js";
import { botUses, projectsToOthers, summonAura, wardedDamageType } from "../skill-intent.js";
import { airFirst } from "./setup.js";
import { HURT_FRACTION, SPIKE_FOES, healthFraction, spiritUp } from "./shared.js";
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
      const skill = bar.find(
        (held) =>
          botUses(held).includes("defence") &&
          !laidStatuses(held).some((id) =>
            (held.target === "self" ? self : spiked).combatant.statuses.has(id),
          ) &&
          castable(held, spiked),
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
    for (const role of ["healing", "defence"] as const) {
      const skill = bar.find((held) => botUses(held).includes(role) && castable(held, patient));
      if (skill !== undefined) {
        const castOn = skill.target === "self" ? self.id : patient.id;
        // A dear enchantment goes on cheaper with Air of Enchantment first (#1975).
        return use(airFirst(rule, skill, castOn) ?? skill, castOn);
      }
    }
    return undefined;
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
 * The ally at least `SPIKE_FOES` foes target (#2627): the one with the most
 * foes on it, then the most hurt, then the first.
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
      if (foe.targetId === ally.id) {
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

/** The statuses `skill` lays on whoever it is cast on. */
function laidStatuses(skill: Skill): StatusId[] {
  return skill.effects.flatMap((effect) =>
    effect.kind === "apply-status" ? [effect.statusId] : [],
  );
}

/** The radius of the ally aura of the spirit `skill` summons, if it has one. */
function allyAuraRadius(skill: Skill): number | undefined {
  const aura = summonAura(skill);
  return aura?.affects === "allies" ? aura.radius : undefined;
}

export default heal;
