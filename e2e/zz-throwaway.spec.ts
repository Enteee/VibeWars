import { expect, test } from "@playwright/test";

test("throwaway: deliberately failing (#3386)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("this text is not on the page")).toBeVisible({ timeout: 2000 });
});
