import { expect, type Page } from "@playwright/test";

/**
 * Open the skill library's attribute group `name` (#2161), matched on its
 * heading whatever the case, or with no name every group still folded.
 * Groups start folded, and a folded one lays out no cards, so a spec
 * opens the group it reaches into first. Under a filter every group is
 * open already, and this has nothing to do. A group with no fold
 * (`aria-expanded` absent) is open, and is left as it is: the specs take
 * this up before the library folds, which #2161 lands on its own because
 * one PR with every spec it touches is over the e2e-repeat budget.
 */
export async function openLibraryGroup(page: Page, name?: string): Promise<void> {
  // Only the open tab is in the page.
  const headers = page.locator(".skill-library .skill-group-header");
  await expect(headers.first()).toBeVisible();
  if (name !== undefined) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const header = headers.filter({
      has: page.locator(".skill-group-name", { hasText: new RegExp(`^${escaped}$`, "i") }),
    });
    await expect(header).toBeVisible();
    if ((await header.getAttribute("aria-expanded")) === "false") {
      await header.click();
      await expect(header).toHaveAttribute("aria-expanded", "true");
    }
    return;
  }
  const folded = page.locator('.skill-library .skill-group-header[aria-expanded="false"]');
  while ((await folded.count()) > 0) {
    await folded.first().click();
  }
  await expect(folded).toHaveCount(0);
}
