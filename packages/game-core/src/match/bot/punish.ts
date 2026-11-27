import { resolveMagnitudeAtRanks } from "../../skills/scaling.js";
import {
  getStatusDefinition,
  type StatusTrigger,
  type StatusTriggerEvent,
} from "../../skills/status.js";
import type { Participant } from "../simulation.js";

/** Triggers that punish the bearer's attacks (#4199): Empathy's, Spiteful Spirit's. */
const ATTACK_TRIGGERS: readonly StatusTriggerEvent[] = [
  "bearer-attacks",
  "bearer-attack-begins",
  "bearer-hits",
];

/** Triggers that punish the bearer's spells (#4199): Backfire's. */
const SPELL_TRIGGERS: readonly StatusTriggerEvent[] = ["bearer-casts-spell"];

/** Triggers that punish any skill the bearer uses (#4199): Spiteful Spirit's. */
const SKILL_TRIGGERS: readonly StatusTriggerEvent[] = ["bearer-uses-skill"];

/**
 * What a bot's hexes punish it for doing (#4199), so it stops: attacking
 * under Empathy, casting under Backfire, any skill under Spiteful Spirit.
 * `cost` is the most health one punished action takes.
 */
export interface Punishments {
  readonly attacks: boolean;
  readonly spells: boolean;
  readonly skills: boolean;
  readonly cost: number;
}

export function punishments(self: Participant): Punishments {
  // The health each kind of action costs, or `undefined` while unpunished.
  let attacks: number | undefined;
  let spells: number | undefined;
  let skills: number | undefined;
  for (const status of self.combatant.statuses.active) {
    const definition = getStatusDefinition(status.id);
    // An ally's enchantment answering an attack is a buff, never this.
    if (definition.category !== "hex") {
      continue;
    }
    for (const trigger of definition.triggers) {
      if (!punishes(trigger)) {
        continue;
      }
      const cost = healthCost(trigger, status.ranks);
      if (ATTACK_TRIGGERS.includes(trigger.on)) {
        attacks = (attacks ?? 0) + cost;
      } else if (SPELL_TRIGGERS.includes(trigger.on)) {
        spells = (spells ?? 0) + cost;
      } else if (SKILL_TRIGGERS.includes(trigger.on)) {
        skills = (skills ?? 0) + cost;
      }
    }
  }
  return {
    attacks: attacks !== undefined,
    spells: spells !== undefined,
    skills: skills !== undefined,
    cost: Math.max(attacks ?? 0, spells ?? 0, skills ?? 0),
  };
}

/**
 * Whether `trigger` hurts its bearer: damage or life steal on it, or a
 * splash of damage round it (Spiteful Spirit's). Diversion's longer
 * recharge does not.
 */
function punishes(trigger: StatusTrigger): boolean {
  return (
    trigger.target === "bearer" &&
    trigger.effects.some(
      (effect) =>
        effect.kind === "damage" ||
        effect.kind === "life-steal" ||
        (effect.kind === "splash" && effect.effects.some((inner) => inner.kind === "damage")),
    )
  );
}

/** The health `trigger` takes off its bearer once, at the ranks its hex was put on with. */
function healthCost(trigger: StatusTrigger, ranks: ReadonlyMap<string, number>): number {
  let cost = 0;
  for (const effect of trigger.effects) {
    if (effect.kind === "damage" || effect.kind === "life-steal") {
      cost += resolveMagnitudeAtRanks(effect.amount, ranks);
    }
  }
  return cost;
}
