import bindSpirit from "./bind-spirit.js";
import boost from "./boost.js";
import carryRelic from "./carry-relic.js";
import cleanse from "./cleanse.js";
import clearGround from "./clear-ground.js";
import closeIn from "./close-in.js";
import dodge from "./dodge.js";
import dropUpkeep from "./drop-upkeep.js";
import energy from "./energy.js";
import fetchRelic from "./fetch-relic.js";
import flee from "./flee.js";
import fight from "./fight.js";
import heal from "./heal.js";
import interrupt from "./interrupt.js";
import leadGhost from "./lead-ghost.js";
import leaveZone from "./leave-zone.js";
import levers from "./levers.js";
import mantra from "./mantra.js";
import mimicElite from "./mimic-elite.js";
import minionCare from "./minion-care.js";
import pickUpGhost from "./pick-up-ghost.js";
import position from "./position.js";
import raise from "./raise.js";
import regroup from "./regroup.js";
import renewSpirit from "./renew-spirit.js";
import rest from "./rest.js";
import rider from "./rider.js";
import gates from "./gates.js";
import runRelic from "./run-relic.js";
import type { BotRule } from "./types.js";
import wardTouch from "./ward-touch.js";
import setup from "./setup.js";
import shrines from "./shrines.js";
import takeMinion from "./take-minion.js";
import wayOut from "./way-out.js";

/**
 * Every `play-build` rule, in the order a think tries them. A new rule is
 * `rules/<name>.ts`, its test, and one line here.
 */
export const BOT_RULES: readonly BotRule[] = inOrder([
  bindSpirit,
  boost,
  carryRelic,
  cleanse,
  clearGround,
  closeIn,
  dodge,
  dropUpkeep,
  energy,
  fetchRelic,
  flee,
  fight,
  heal,
  interrupt,
  leadGhost,
  leaveZone,
  levers,
  mantra,
  mimicElite,
  minionCare,
  pickUpGhost,
  position,
  raise,
  regroup,
  renewSpirit,
  gates,
  rest,
  rider,
  runRelic,
  setup,
  shrines,
  takeMinion,
  wardTouch,
  wayOut,
]);

/** `rules` by `order`; throws on a duplicate `order` or `name`. */
export function inOrder(rules: readonly BotRule[]): readonly BotRule[] {
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  for (const [index, rule] of sorted.entries()) {
    const twin = sorted.find(
      (other, at) => at !== index && (other.order === rule.order || other.name === rule.name),
    );
    if (twin !== undefined) {
      throw new Error(`bot rules ${rule.name} and ${twin.name} share an order or a name`);
    }
  }
  return sorted;
}
