import { test } from "@playwright/test";
const DEUTAN =
  '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0"><filter id="deutan"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"/></filter></svg>';
test("sheet", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.goto("./?stack");
  await page.waitForFunction(() => "__stackSheet" in window);
  await page.evaluate(() => (window as unknown as { __stackSheet: () => void }).__stackSheet());
  await page.locator("#stack-sheet").screenshot({ path: "/tmp/3977-sheet.png" });
});
for (const [name, query] of [["today", ""], ["stacked", "&stack"]] as const) {
  test(`fight ${name}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 2400, height: 1500 });
    await page.goto(`./?splash&menu-background=arena-crossroads${query}`);
    for (const wait of [16, 24, 32]) {
      await page.waitForTimeout(8_000);
      await page.screenshot({ path: `/tmp/3977-fight-${name}-${wait}.png` });
    }
    await page.evaluate((svg) => {
      document.body.insertAdjacentHTML("beforeend", svg);
      document.documentElement.style.filter = "url(#deutan)";
    }, DEUTAN);
    await page.screenshot({ path: `/tmp/3977-fight-${name}-deutan.png` });
  });
}
