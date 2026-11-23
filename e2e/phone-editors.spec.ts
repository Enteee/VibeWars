import { expect, test, type Page } from "@playwright/test";

import { openRail } from "./helpers/menu.js";
import { PIXEL_8A_LANDSCAPE, PIXEL_8A_PORTRAIT, expectFitsPhone } from "./helpers/phone.js";

/**
 * The build, gear and team editors on a Pixel 8a (#3777), by finger
 * alone: every step a `tap()`, never a click or a hover. A build is made
 * from nothing, its bar filled, saved and opened again; a skill's details
 * open and close by tap; and each editor passes #3776's three checks.
 */

test.use(PIXEL_8A_PORTRAIT);

/** The Character Builder on the phone, with a new character open. */
async function newCharacter(page: Page): Promise<void> {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).tap();
  await expect(page.locator("input.editor-name")).toBeVisible();
}

/** The names on the bar, slot by slot; "" for an empty one. */
async function barNames(page: Page): Promise<string[]> {
  return page
    .locator(".editor-skills .skill-slot")
    .evaluateAll((slots) =>
      slots.map((slot) => slot.querySelector(".skill-slot-name")?.textContent ?? ""),
    );
}

for (const [held, device] of [
  ["upright", PIXEL_8A_PORTRAIT],
  ["on its side", PIXEL_8A_LANDSCAPE],
] as const) {
  test.describe(`held ${held}`, () => {
    test.use(device);

    test(`a build is made by tap, its 8 slots filled, saved and reopened (#3777)`, async ({
      page,
    }) => {
      await newCharacter(page);
      await page.locator("input.editor-name").fill("Thumbs");
      await page.locator(".editor-attribute").first().locator('.attribute-pip[data-pip="8"]').tap();
      await expect(page.locator(".editor-points-text")).not.toContainText("0/200");

      // Tap a slot, then a skill's Equip: it goes to that slot.
      await page.locator('.editor-skills .skill-slot[data-slot="4"]').tap();
      await page.locator(".skill-library button.skill-group-header").first().tap();
      const equip = page.locator(
        ".skill-library .skill-box:not(.is-elite) .skill-box-equip:visible",
      );
      await expect(equip.first()).toContainText("5");
      await equip.first().tap();
      await expect(page.locator('.editor-skills .skill-slot[data-slot="4"]')).not.toHaveClass(
        /is-empty/,
      );
      // The rest fill in order, one Equip a skill.
      for (let filled = 1; filled < 8; filled += 1) {
        await equip.first().tap();
      }
      const names = await barNames(page);
      expect(names.filter((name) => name !== "")).toHaveLength(8);

      await page.getByRole("button", { name: "Save", exact: true }).tap();
      await expect(page.locator(".toast")).toHaveText("Saved");
      await page
        .locator(".character-card", { hasText: "Thumbs" })
        .getByRole("button", { name: "edit" })
        .tap();
      await expect(page.locator("input.editor-name")).toHaveValue("Thumbs");
      expect(await barNames(page)).toEqual(names);
    });

    test(`a skill's details open and close by tap, and no tooltip covers the list (#3777)`, async ({
      page,
    }) => {
      await newCharacter(page);
      await page.locator(".skill-library button.skill-group-header").first().tap();
      const card = page.locator(".skill-library .skill-box-card").first();
      await card.tap();
      await expect(card).toHaveAttribute("aria-expanded", "true");
      await expect(page.locator(".skill-library .skill-box-details:visible")).toHaveCount(1);
      await expect(page.locator(".skill-tip")).toBeHidden();
      await card.tap();
      await expect(card).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator(".skill-library .skill-box-details:visible")).toHaveCount(0);
    });
  });
}

test("upright, the bar stays in view above the list while the page scrolls (#3777)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator(".skill-library button.skill-group-header").first().tap();
  const bar = page.locator(".editor-skills");
  // The training panel above it has drawn, so nothing moves the bar after.
  await expect(page.locator(".editor-attributes")).toBeVisible();
  await expect(page.locator(".training canvas")).toBeVisible();
  // Scroll whatever scrolls the screen past where a bar that is not
  // sticky would have left it.
  const scroll = await bar.evaluate((node) => {
    let scroller = node.parentElement;
    while (scroller !== null) {
      const { overflowY } = getComputedStyle(scroller);
      const scrolls = overflowY === "auto" || overflowY === "scroll";
      if (scrolls && scroller.scrollHeight > scroller.clientHeight) break;
      scroller = scroller.parentElement;
    }
    if (scroller === null) return null;
    scroller.scrollTop = 0;
    // A sticky bar pins inside the scroller's padding.
    const top =
      scroller.getBoundingClientRect().top + parseFloat(getComputedStyle(scroller).paddingTop);
    const needed = node.getBoundingClientRect().bottom - top;
    scroller.scrollTop = needed + 50;
    return { top, needed, scrolled: scroller.scrollTop };
  });
  expect(scroll).not.toBeNull();
  const box = await bar.boundingBox();
  expect(box).not.toBeNull();
  if (scroll !== null && box !== null) {
    expect(scroll.scrolled).toBeGreaterThan(scroll.needed);
    // The whole bar is pinned to the top of the screen, drawn over the
    // library scrolling under it.
    expect(Math.abs(box.y - scroll.top)).toBeLessThanOrEqual(1);
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".editor-skills") !== null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    );
    expect(onTop).toBe(true);
  }
});

test("the build editor, its skills and its gear, fits the phone (#3777)", async ({ page }) => {
  await newCharacter(page);
  await page.locator(".skill-library button.skill-group-header").first().tap();
  for (let filled = 0; filled < 8; filled += 1) {
    await page
      .locator(".skill-library .skill-box:not(.is-elite) .skill-box-equip:visible")
      .first()
      .tap();
  }
  await expectFitsPhone(page, "build editor, skills");
  await page.locator(".library-tab", { hasText: "gear" }).tap();
  await expect(page.locator(".gear-box").first()).toBeVisible();
  await page.locator(".gear-box").first().tap();
  // What a bonus comes from shows under its attribute, with no hover to ask.
  await expect(page.locator(".editor-attribute-sources:visible").first()).not.toBeEmpty();
  await expectFitsPhone(page, "build editor, gear");
});

test("the team editor fits the phone, its bars on screen (#3777)", async ({ page }) => {
  await page.goto("./");
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).tap();
  await expect(page.locator(".team-editor")).toBeVisible();
  // Every member's eighth slot is inside the screen, not scrolled off it.
  const width = page.viewportSize()?.width ?? 0;
  for (const slot of await page.locator('.team-row .team-skill[data-slot="7"]').all()) {
    const box = await slot.boundingBox();
    expect((box?.x ?? width) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
  await expectFitsPhone(page, "team editor");
});

test("a saved character goes into a team by tap, then Put here (#3876)", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Thumbs");
  await page.getByRole("button", { name: "Save", exact: true }).tap();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).tap();
  const rows = page.locator(".team-grid .team-row");
  await expect(rows.first()).toBeVisible();
  const put = page.getByRole("button", { name: "Put here", exact: true });
  await expect(put).toHaveCount(0);

  const pick = page.locator(".team-pick", { hasText: "Thumbs" });
  await pick.tap();
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await expect(put.first()).toBeVisible();
  await rows.nth(1).getByRole("button", { name: "Put here", exact: true }).tap();
  await expect(rows.nth(1).locator(".team-row-name")).toHaveText("Thumbs");
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(put).toHaveCount(0);
});
