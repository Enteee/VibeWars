import type { Skill } from "../../../skills/types.js";
import type { BehaviourContext, BehaviourIntent } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";

/** What every rule reads in one think, built once per think. */
export interface RuleContext {
  readonly context: BehaviourContext;
  readonly self: Participant;
  /** The skills on its own bar, its empty slots left out. */
  readonly bar: readonly Skill[];
  /** The foes it fights this think. */
  readonly foes: readonly Participant[];
  /** The allies it looks after, itself included. */
  readonly allies: readonly Participant[];
  /** The foe to fight, if any is in reach. */
  readonly targetId: string | undefined;
  /** `bodies`, nearest to it first. */
  readonly nearestFirst: (bodies: readonly Participant[]) => Participant[];
  /** Whether it may begin `skill` at `targetId` now, walking in if need be. */
  readonly mayUse: (skill: Skill, targetId: string | undefined) => boolean;
  readonly use: (skill: Skill, targetId: string | undefined) => BehaviourIntent;
}

/** One step of `play-build`'s think: the first rule with an answer decides. */
export interface BotRule {
  /** Lower runs first; gaps of 10 so a new rule slots between without renumbering. */
  readonly order: number;
  /** Matches the file name, e.g. "interrupt". */
  readonly name: string;
  readonly decide: (rule: RuleContext) => BehaviourIntent | undefined;
}
