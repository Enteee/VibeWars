import { expect, test, type Page } from "@playwright/test";

import { showRail } from "./helpers/menu.js";
import { PIXEL_8A_LANDSCAPE, PIXEL_8A_PORTRAIT, TOUCH_TARGET } from "./helpers/phone.js";

/**
 * The team builder on a phone (#3928): a member's eight skills never
 * overlap each other or its ✎, each is a finger wide, the counters take
 * one row, and the name has room to be read. Measured, in every language
 * the audit found it broken in.
 */

const DEVICES = [
  {
    held: "upright at 360",
    device: { ...PIXEL_8A_PORTRAIT, viewport: { width: 360, height: 800 } },
  },
  { held: "on its side", device: PIXEL_8A_LANDSCAPE },
] as const;

/** A new team build open in the team builder, in the browser's language. */
async function newTeam(page: Page): Promise<void> {
  await page.goto("./");
  // Upright, the rail is a drawer (#3924).
  await showRail(page);
  await page.locator('.mode-rail [data-entry="teams"]').tap();
  await page.locator('[data-tutorial="team-new"]').tap();
  await expect(page.locator(".team-grid .team-row").first()).toBeVisible();
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Measured {
  rows: { skills: Box[]; open: Box }[];
  counters: Box[];
  names: number[];
}

async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const box = (node: Element): Box => {
      const { left, top, right, bottom } = node.getBoundingClientRect();
      return { left, top, right, bottom };
    };
    const rows = [...document.querySelectorAll(".team-grid .team-row")].map((row) => ({
      skills: [...row.querySelectorAll(".team-skill")].map(box),
      open: box(row.querySelector(".team-row-open") ?? row),
    }));
    return {
      rows,
      counters: [...document.querySelectorAll(".team-counter")].map(box),
      names: [...document.querySelectorAll(".team-grid .team-row-name")].map(
        (name) => name.getBoundingClientRect().width,
      ),
    };
  });
}

/** Whether two boxes share any area; touching edges do not count. */
function overlaps(a: Box, b: Box): boolean {
  return (
    a.left < b.right - 0.5 &&
    b.left < a.right - 0.5 &&
    a.top < b.bottom - 0.5 &&
    b.top < a.bottom - 0.5
  );
}

for (const { held, device } of DEVICES) {
  for (const locale of ["en", "de", "ar"]) {
    test.describe(`held ${held}, in ${locale}`, () => {
      test.use({ ...device, locale });

      test(`the rows, skills and counters fit the phone (#3928)`, async ({ page }) => {
        await newTeam(page);
        const { rows, counters, names } = await measure(page);
        expect(rows.length).toBeGreaterThanOrEqual(4);
        for (const [index, { skills, open }] of rows.entries()) {
          expect(skills).toHaveLength(8);
          for (const [slot, skill] of skills.entries()) {
            const at = `member ${String(index + 1)}, slot ${String(slot + 1)}`;
            expect(skill.right - skill.left, `${at} wide`).toBeGreaterThanOrEqual(TOUCH_TARGET);
            expect(skill.bottom - skill.top, `${at} tall`).toBeGreaterThanOrEqual(TOUCH_TARGET);
            expect(overlaps(skill, open), `${at} clear of ✎`).toBe(false);
            for (const other of skills.slice(slot + 1)) {
              expect(overlaps(skill, other), `${at} clear of the others`).toBe(false);
            }
          }
        }
        // One row of counters: every pill starts at the same height.
        expect(new Set(counters.map((counter) => Math.round(counter.top))).size).toBe(1);
        if (device.viewport.width === 360) {
          for (const width of names) {
            expect(width).toBeGreaterThanOrEqual(120);
          }
        }
      });
    });
  }
}
