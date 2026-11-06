import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Open the skill library's attribute group `name` (#2161), matched on its
 * heading whatever the case, or with no name every group still folded.
 * Groups start folded, and a folded one lays out no cards, so a spec
 * opens the group it reaches into first. Under a filter every group is
 * open already, and this has nothing to do.
 */
export async function openLibraryGroup(page: Page, name?: string): Promise<void> {
  // Only the open tab is in the page, and only the skills tab's headers are buttons.
  const headers = page.locator(".skill-library button.skill-group-header");
  await expect(headers.first()).toBeVisible();
  if (name !== undefined) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const header = headers.filter({
      has: page.locator(".skill-group-name", { hasText: new RegExp(`^${escaped}$`, "i") }),
    });
    if ((await header.getAttribute("aria-expanded")) === "false") {
      await header.click();
    }
    await expect(header).toHaveAttribute("aria-expanded", "true");
    return;
  }
  const folded = page.locator('.skill-library button.skill-group-header[aria-expanded="false"]');
  while ((await folded.count()) > 0) {
    await folded.first().click();
  }
  await expect(folded).toHaveCount(0);
}

/** A chip in the skill library's Filters popover (#2463): a skill type, Elite only, or Not in the game yet. */
export function filterChip(page: Page, label: string): Locator {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(".skill-filter-popover .skill-type-chip", {
    hasText: new RegExp(`^${escaped}$`),
  });
}
