import { relicErrand } from "./fetch-relic.js";
import { ghostErrand } from "./pick-up-ghost.js";
import { onErrand, pressed } from "./shared.js";
import type { BotRule } from "./types.js";

/**
 * Relic Run and King of the Hill (#3749): a bot on its `fetch-relic` or
 * `pick-up-ghost` errand keeps on it when the foe `fight` would turn
 * it to is one behind it that leaves its team be (`onErrand`), and no
 * other presses it. Before `fight`, which those two rules come after.
 */
const keepErrand: BotRule = {
  order: 99.8,
  name: "keep-errand",
  decide: (rule) => {
    const target = rule.foes.find((foe) => foe.id === rule.targetId);
    if (target === undefined) {
      return undefined;
    }
    const errand = relicErrand(rule) ?? ghostErrand(rule);
    if (errand === undefined) {
      return undefined;
    }
    const on = onErrand(rule, errand.at);
    return on.foes.includes(target) || pressed(on) ? undefined : errand.intent;
  },
};

export default keepErrand;
