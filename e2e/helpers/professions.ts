import type { Locator, Page } from "@playwright/test";

/**
 * The build editor's profession fields (#568): each a button that opens a
 * grid of professions. `id` `null` is the secondary's "(none)".
 */
export function professionField(page: Page, which: "primary" | "secondary"): Locator {
  return page.locator(`.editor-profession[data-which="${which}"]`);
}

/** Open the `which` field's grid and pick `id` in it. */
export async function chooseProfession(
  page: Page,
  which: "primary" | "secondary",
  id: string | null,
): Promise<void> {
  await professionField(page, which).click();
  await page
    .locator(`.editor-profession-field:has(.editor-profession[data-which="${which}"])`)
    .locator(`.profession-grid .profession-cell[data-profession="${id ?? "none"}"]`)
    .click();
}
