import { createRng, seedFromString, type SimulationRng } from "../rng.js";
import { vec2, type Vec2 } from "../vec2.js";
import { canActivate, payCost } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { applyEffects, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { advanceStatuses } from "../skills/tick.js";
import type { Combatant, Skill } from "../skills/types.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";

/**
 * A headless match runner (brief §15, §28).
 *
 * Runs real combat with no server, no socket and no browser, which makes
 * it the tool for answering balance questions ("how long does this fight
 * actually take?") and for reproducing a bug from a seed.
 *
 * The same `game-core` functions the live server calls are used here, so
 * a result from this runner is a result about the real game, not about a
 * simplified copy of it.
 */

export interface HeadlessFighter {
  readonly id: string;
  readonly team: number;
  readonly skillBar: readonly string[];
  readonly attributeRanks: ReadonlyMap<string, number>;
  readonly position: Vec2;
}

export interface HeadlessMatchOptions {
  readonly fighters: readonly HeadlessFighter[];
  /** Match seed; the same seed always produces the same match. */
  readonly seed: string;
  /** Simulated seconds to run before giving up. */
  readonly maxSeconds?: number;
  readonly tickRateHz?: number;
}

export interface HeadlessMatchResult {
  readonly seconds: number;
  readonly ticks: number;
  /** Fighters still alive when the run ended. */
  readonly survivors: readonly string[];
  readonly events: readonly CombatEvent[];
  /** Total damage dealt per fighter id. */
  readonly damageDealt: ReadonlyMap<string, number>;
}

interface RunnerState {
  readonly combatant: Combatant;
  readonly fighter: HeadlessFighter;
  position: Vec2;
}

/**
 * Pick the first skill this fighter can legally cast at `target`.
 *
 * Deliberately simple-minded: the runner is a measurement tool, not an
 * AI. A cleverer chooser would make results depend on the AI's quality
 * rather than on the numbers under test.
 */
function chooseSkill(state: RunnerState, target: RunnerState | undefined): Skill | undefined {
  for (const skillId of state.fighter.skillBar) {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      continue;
    }
    const check = canActivate({
      skill,
      caster: state.combatant,
      casterPosition: state.position,
      target: skill.target === "self" ? state.combatant : target?.combatant,
      targetPosition: skill.target === "self" ? state.position : target?.position,
      rechargeRemaining: state.combatant.cast.rechargeRemaining,
      isCasting: state.combatant.cast.isCasting,
      skillBar: state.fighter.skillBar,
      losBlockers: [],
    });
    if (check.ok) {
      return skill;
    }
  }
  return undefined;
}

export function runHeadlessMatch(options: HeadlessMatchOptions): HeadlessMatchResult {
  const tickRate = options.tickRateHz ?? MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
  const dt = 1 / tickRate;
  const maxTicks = Math.ceil((options.maxSeconds ?? 120) * tickRate);
  const rng: SimulationRng = createRng(seedFromString(options.seed));

  const states = new Map<string, RunnerState>();
  for (const fighter of options.fighters) {
    states.set(fighter.id, {
      fighter,
      position: fighter.position,
      combatant: makeCombatant({
        id: fighter.id,
        team: fighter.team,
        attributeRanks: fighter.attributeRanks,
      }),
    });
  }

  const events: CombatEvent[] = [];
  const damageDealt = new Map<string, number>();
  let ticks = 0;

  const livingTeams = (): Set<number> => {
    const teams = new Set<number>();
    for (const state of states.values()) {
      if (!state.combatant.dead) {
        teams.add(state.combatant.team);
      }
    }
    return teams;
  };

  while (ticks < maxTicks && livingTeams().size > 1) {
    ticks += 1;

    for (const state of states.values()) {
      if (state.combatant.dead) {
        continue;
      }

      // Degeneration can kill between ticks. Keyed off the emitted death
      // event rather than re-reading `dead`: the flag was checked just
      // above, so narrowing would call this branch unreachable and a
      // "simplification" would let corpses keep acting.
      const statusEvents = advanceStatuses(state.combatant, dt);
      events.push(...statusEvents);
      if (statusEvents.some((event) => event.kind === "death")) {
        continue;
      }

      // The live match regenerates energy every tick; the runner must do
      // the same, or every fight here ends in a stalemate the real game
      // would never produce.
      state.combatant.energy = Math.min(
        state.combatant.maxEnergy,
        state.combatant.energy + MINIMAL_GW_INSPIRED_PVP_V1.resources.energyRegenPerSecond * dt,
      );

      // Nearest living enemy, which is the only targeting decision the
      // runner makes.
      let target: RunnerState | undefined;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const other of states.values()) {
        if (other.combatant.dead || other.combatant.team === state.combatant.team) {
          continue;
        }
        const d = Math.hypot(
          other.position.x - state.position.x,
          other.position.y - state.position.y,
        );
        if (d < bestDistance) {
          bestDistance = d;
          target = other;
        }
      }

      const completed = state.combatant.cast.advance(dt);
      if (completed !== undefined) {
        const skill = getSkill(completed.skillId);
        const resolvedTarget =
          completed.targetId === undefined ? undefined : states.get(completed.targetId);
        if (skill !== undefined) {
          const produced = applyEffects(skill.effects, {
            caster: state.combatant,
            target: skill.target === "self" ? state.combatant : resolvedTarget?.combatant,
            rng,
            rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
          });
          for (const event of produced) {
            if (event.kind === "damage" && event.targetId !== state.combatant.id) {
              damageDealt.set(
                state.combatant.id,
                (damageDealt.get(state.combatant.id) ?? 0) + event.amount,
              );
            }
          }
          events.push(...produced);
          state.combatant.cast.startRecharge(skill.id, skill.rechargeSeconds);
        }
      }

      if (!state.combatant.cast.isCasting) {
        const skill = chooseSkill(state, target);
        if (skill !== undefined) {
          payCost(skill, state.combatant);
          state.combatant.cast.beginCast(
            skill.id,
            skill.target === "self" ? state.combatant.id : target?.combatant.id,
            skill.activationSeconds,
          );
        }
      }
    }
  }

  const survivors = [...states.values()]
    .filter((state) => !state.combatant.dead)
    .map((state) => state.combatant.id);

  return { seconds: ticks * dt, ticks, survivors, events, damageDealt };
}

/** Build a fighter with sensible defaults for quick experiments. */
export function fighter(
  id: string,
  team: number,
  skillBar: readonly string[],
  overrides: Partial<HeadlessFighter> = {},
): HeadlessFighter {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map(),
    position: vec2(team === 0 ? 0 : 100, 0),
    ...overrides,
  };
}
