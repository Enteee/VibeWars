import { expect, test } from "@playwright/test";

import { chooseProfession } from "./helpers/professions.js";
import { openLibraryGroup } from "./helpers/library.js";
import { openRail } from "./helpers/menu.js";

test("light bench", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "elementalist");
  await openLibraryGroup(page, "Fire Magic");
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(".training canvas")).toBeVisible();
  await page.locator("select.training-scenario").selectOption("heights");
  await expect(page.locator(".training-log")).toContainText("── Heights ──");
  await page.waitForFunction(() => (globalThis as any).__lightBench !== undefined, null, { timeout: 240_000 });
  const r = await page.evaluate(() => (globalThis as any).__lightBench);
  const stat = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]!;
    return `mean ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1)} p50 ${q(0.5).toFixed(1)} p95 ${q(0.95).toFixed(1)} max ${s[s.length - 1]!.toFixed(1)}`;
  };
  console.log(`BENCH renderer: ${r.renderer}`);
  for (const [stage, v] of Object.entries<any>(r.runs)) {
    console.log(`BENCH ${stage} layers=${v.layers} shadowed=${v.shadowedCount}`);
    console.log(`BENCH ${stage} +finish: ${stat(v.finish)}`);
    console.log(`BENCH ${stage} cpu:     ${stat(v.cpu)}`);
  }
  console.log(`BENCH errors: ${JSON.stringify(errors)}`);
});
