import { getSkill } from "../../../skills/catalog.js";
import { CLAIM_SKILL_ID } from "../../ghost.js";
import type { Skill, SkillEffect } from "../../../skills/types.js";
import { swingProgress } from "../../../skills/weapon-attack.js";
import type { Participant } from "../../simulation.js";
import { distance } from "../../../vec2.js";
import { botUses, interruptAimed } from "../skill-intent.js";
import { botRoll, INTERRUPT_CHANCE } from "./shared.js";
import type { BotRule } from "./types.js";

/** How much longer than the interrupt itself a cast or a swing must have left. */
const INTERRUPT_MARGIN_SECONDS = 0.25;

/**
 * Interrupt a cast worth it that it can still beat (#2633); with none, a
 * foe's swing of an attack skill (#1713). Only what the interrupt would
 * land on, filter and condition read (`interruptAimed`): never a spell
 * interrupt at a signet. It tries `INTERRUPT_CHANCE` of the casts worth
 * it, one roll for each, and leaves the rest alone, as a player misses.
 */
const interrupt: BotRule = {
  order: 10,
  name: "interrupt",
  decide: ({ context, self, bar, foes, mayUse, use }) => {
    const interrupts = bar.filter((skill) => botUses(skill).includes("interrupt"));
    const interrupting = (lands: "cast" | "swing", foe: Participant, leftSeconds: number) =>
      interrupts.find(
        (held) =>
          leftSeconds > windUpSeconds(self, held) + INTERRUPT_MARGIN_SECONDS &&
          interruptAimed(held, self.combatant, foe.combatant) === lands &&
          mayUse(held, foe.id),
      );
    // The most important cast first; then Complicate's (#2165), one that
    // splashes goes where the most foes stand; then the one ending soonest.
    let best:
      { foe: Participant; skill: Skill; worth: number; crowd: number; left: number } | undefined;
    for (const foe of foes) {
      const activeCast = foe.combatant.cast.activeCast;
      const worth = activeCast === undefined ? undefined : worthOf(activeCast.skillId);
      if (
        activeCast === undefined ||
        worth === undefined ||
        botRoll(context.seed, activeCast.ordinal, `${self.id}>${foe.id}`) >= INTERRUPT_CHANCE
      ) {
        continue;
      }
      const skill = interrupting("cast", foe, activeCast.remainingSeconds);
      if (skill === undefined) {
        continue;
      }
      const crowd = crowdAround(skill, foe, foes);
      const left = activeCast.remainingSeconds;
      if (
        best === undefined ||
        worth < best.worth ||
        (worth === best.worth && (crowd > best.crowd || (crowd === best.crowd && left < best.left)))
      ) {
        best = { foe, skill, worth, crowd, left };
      }
    }
    if (best !== undefined) {
      return use(best.skill, best.foe.id);
    }
    // A plain blow is never worth one: only an attack skill's.
    for (const foe of foes) {
      if (foe.armedAttack === undefined) {
        continue;
      }
      const swing = swingProgress(foe.combatant);
      const skill = interrupting("swing", foe, swing.total - swing.elapsed);
      if (skill !== undefined) {
        return use(skill, foe.id);
      }
    }
    return undefined;
  },
};

export default interrupt;

/**
 * How much interrupting the cast of `skillId` is worth (#2633), lower
 * first: a resurrection or a Ghostly Hero's altar claim, a heal or a
 * protection, an elite, a spike. `undefined`: anything else, which is
 * left to land.
 */
function worthOf(skillId: string): number | undefined {
  const skill = getSkill(skillId);
  if (skill === undefined) {
    return undefined;
  }
  const uses = botUses(skill);
  if (skillId === CLAIM_SKILL_ID || uses.includes("resurrect")) {
    return 0;
  }
  if (uses.includes("healing") || uses.includes("defence")) {
    return 1;
  }
  if (skill.elite) {
    return 2;
  }
  return hitsHard(skill) ? 3 : undefined;
}

/**
 * A big hit: an offence skill that deals damage as it lands, an attack
 * skill or a damage spell. Hexes and spirits hurt over time instead.
 */
function hitsHard(skill: Skill): boolean {
  return (
    botUses(skill).includes("offence") &&
    skill.type !== "hex" &&
    (skill.attack !== undefined || skill.effects.some(damagesOnLanding))
  );
}

/** Damage or life steal as it lands, an `if`'s or a splash's among them. */
function damagesOnLanding(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "damage":
    case "life-steal":
      return true;
    case "if":
    case "splash":
      return effect.effects.some(damagesOnLanding);
    default:
      return false;
  }
}

/** How many other foes stand in the area of `skill`'s splash around `foe`; none splashes: 0. */
function crowdAround(skill: Skill, foe: Participant, foes: readonly Participant[]): number {
  const radius = splashRadius(skill.effects);
  return radius === undefined
    ? 0
    : foes.filter((other) => other !== foe && distance(other.position, foe.position) <= radius)
        .length;
}

/** The radius of the first `splash` in `effects`, an `if`'s included. */
function splashRadius(effects: readonly SkillEffect[]): number | undefined {
  for (const effect of effects) {
    const radius =
      effect.kind === "splash"
        ? effect.radius
        : effect.kind === "if"
          ? splashRadius(effect.effects)
          : undefined;
    if (radius !== undefined) {
      return radius;
    }
  }
  return undefined;
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
