import type { Skill } from "../../../skills/types.js";
import { swingProgress } from "../../../skills/weapon-attack.js";
import type { Participant } from "../../simulation.js";
import { botUses, interruptAimed } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** How much longer than the interrupt itself a cast or a swing must have left. */
const INTERRUPT_MARGIN_SECONDS = 0.25;

/**
 * Interrupt a cast it can still beat; with none worth it, a plain swing
 * (#1713). Only what the interrupt would land on, filter and condition
 * read (`interruptAimed`): never a spell interrupt at a signet.
 */
const interrupt: BotRule = {
  order: 10,
  name: "interrupt",
  decide: ({ self, bar, foes, mayUse, use }) => {
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
        activeCast === undefined
          ? undefined
          : interrupting("cast", foe, activeCast.remainingSeconds);
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
    return undefined;
  },
};

export default interrupt;

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
