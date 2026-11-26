import { getSkill } from "../../../skills/catalog.js";
import { distance } from "../../../vec2.js";
import { wardsTouch } from "../skill-intent.js";
import type { BotRule } from "./types.js";

/** A foe this close with a touch skill on its bar is one to ward off (#1966). */
const TOUCH_THREAT_UNITS = 300;

/**
 * A foe at hand with a touch skill (#1966): ward it off first, as "Can't
 * Touch This!", unless it already is.
 */
const wardTouch: BotRule = {
  order: 40,
  name: "ward-touch",
  decide: ({ self, bar, foes, mayUse, use }) => {
    const touching = foes.some(
      (foe) =>
        distance(foe.position, self.position) <= TOUCH_THREAT_UNITS &&
        foe.skillBar.some((id) => id !== null && getSkill(id)?.touch === true),
    );
    if (!touching) {
      return undefined;
    }
    const ward = bar.find(
      (held) =>
        wardsTouch(held) &&
        !held.effects.some(
          (effect) =>
            effect.kind === "apply-status" && self.combatant.statuses.has(effect.statusId),
        ) &&
        mayUse(held, self.id),
    );
    return ward === undefined ? undefined : use(ward, self.id);
  },
};

export default wardTouch;
