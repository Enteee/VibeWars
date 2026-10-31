// One row per status: the plate category and the glyph drawn on it
// (docs/art/art-direction.md). The icon generator (icons.mjs) draws a row; the
// test in apps/web/src/ui/icons.test.ts checks every status has one and that
// each id is in exactly one table.
//
// A card that adds a status adds its row to `status-icons/<profession>.mjs`,
// by the game-core file that declares its id
// (packages/game-core/src/skills/statuses/<profession>.ts; common.ts goes in
// common.mjs), and runs `node scripts/assets/icons.mjs`.

import { WARRIOR_STATUS_ICONS } from "./status-icons/warrior.mjs";
import { RANGER_STATUS_ICONS } from "./status-icons/ranger.mjs";
import { MONK_STATUS_ICONS } from "./status-icons/monk.mjs";
import { NECROMANCER_STATUS_ICONS } from "./status-icons/necromancer.mjs";
import { MESMER_STATUS_ICONS } from "./status-icons/mesmer.mjs";
import { ELEMENTALIST_STATUS_ICONS } from "./status-icons/elementalist.mjs";
import { ASSASSIN_STATUS_ICONS } from "./status-icons/assassin.mjs";
import { RITUALIST_STATUS_ICONS } from "./status-icons/ritualist.mjs";
import { PARAGON_STATUS_ICONS } from "./status-icons/paragon.mjs";
import { DERVISH_STATUS_ICONS } from "./status-icons/dervish.mjs";
import { COMMON_STATUS_ICONS } from "./status-icons/common.mjs";

/** The tables by file name, so a test can check no id is in two. */
export const STATUS_ICON_TABLES = {
  warrior: WARRIOR_STATUS_ICONS,
  ranger: RANGER_STATUS_ICONS,
  monk: MONK_STATUS_ICONS,
  necromancer: NECROMANCER_STATUS_ICONS,
  mesmer: MESMER_STATUS_ICONS,
  elementalist: ELEMENTALIST_STATUS_ICONS,
  assassin: ASSASSIN_STATUS_ICONS,
  ritualist: RITUALIST_STATUS_ICONS,
  paragon: PARAGON_STATUS_ICONS,
  dervish: DERVISH_STATUS_ICONS,
  common: COMMON_STATUS_ICONS,
};

/** @type {Readonly<Record<string, [import("./icon-kit.mjs").Category, import("./icon-kit.mjs").Glyph]>>} */
export const STATUS_ICONS = {
  ...WARRIOR_STATUS_ICONS,
  ...RANGER_STATUS_ICONS,
  ...MONK_STATUS_ICONS,
  ...NECROMANCER_STATUS_ICONS,
  ...MESMER_STATUS_ICONS,
  ...ELEMENTALIST_STATUS_ICONS,
  ...ASSASSIN_STATUS_ICONS,
  ...RITUALIST_STATUS_ICONS,
  ...PARAGON_STATUS_ICONS,
  ...DERVISH_STATUS_ICONS,
  ...COMMON_STATUS_ICONS,
};
