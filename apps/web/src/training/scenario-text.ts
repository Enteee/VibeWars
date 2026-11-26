import type { TrainingScenario } from "@vibewars/game-core";

import { en, type MessageKey } from "../i18n/en.js";
import { t } from "../i18n/index.js";

/**
 * A training scenario's `part` in the player's language (#3036): its
 * picker label, or the one sentence it teaches. game-core holds only the
 * id; the text is `training.scenario.<id>.<part>` in the catalogs.
 */
export function scenarioText(scenario: TrainingScenario, part: "label" | "teaches"): string {
  const key = `training.scenario.${scenario.id}.${part}`;
  if (!isMessageKey(key)) {
    throw new Error(`no ${key} in the catalog`);
  }
  return t(key);
}

function isMessageKey(key: string): key is MessageKey {
  return Object.hasOwn(en, key);
}
