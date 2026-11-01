// One row per status: the plate category and the glyph drawn on it
// (docs/art/art-direction.md). The icon generator (icons.mjs) draws a row; the
// test in apps/web/src/ui/icons.test.ts checks every status has one and that
// each id is in exactly one table.
//
// A card that adds a status adds a file of its own (#2021):
// `status-icons/<profession>/<issue>-<slug>.mjs`, by the game-core file that
// declares its id (packages/game-core/src/skills/statuses/<profession>.ts;
// common.ts goes in common/), whose default export is its rows, and runs
// `node scripts/assets/icons.mjs`. A stand-in goes in `<issue>-stand-in.mjs`,
// which its art card deletes.

import { loadDirectories, mergeRows } from "./merge-rows.mjs";

/** @typedef {readonly [import("./icon-kit.mjs").Category, import("./icon-kit.mjs").Glyph]} StatusIconRow */

/**
 * The tables by profession, so a test can check no id is in two.
 * @type {Readonly<Record<string, Readonly<Record<string, StatusIconRow>>>>}
 */
export const STATUS_ICON_TABLES = /** @type {Record<string, Record<string, StatusIconRow>>} */ (
  await loadDirectories(new URL("./status-icons/", import.meta.url), "icon row")
);

/** @type {Readonly<Record<string, StatusIconRow>>} */
export const STATUS_ICONS = mergeRows(STATUS_ICON_TABLES, { prefixed: false, what: "icon row" });
