import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The Options screen (#423) and its Controls section (#309): what only a
 * browser can tell is that a key bound there is the key the Training Ground
 * casts with, and that it is still bound after a reload.
 */

const WIDE = { width: 1500, height: 950 };

const cell = (page: Page, action: string, index = 0): Locator =>
  page.locator(`.key-cell[data-action="${action}"][data-index="${String(index)}"]`);

async function openKeys(page: Page): Promise<void> {
  await page.getByRole("button", { name: "options" }).click();
  await expect(page.locator(".options-screen")).toBeVisible();
  // Options opens on its first section, Sound (#424).
  await page.locator('.options-entry[data-section="controls"]').click();
  await expect(page.locator('.options-entry[data-section="controls"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".keys-screen")).toBeVisible();
}

test("(1) Skill 1 bound to Z in Controls casts on Z, not Q, and survives a reload", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openKeys(page);
  await expect(cell(page, "skill-1")).toHaveText("Q");

  await cell(page, "skill-1").click();
  await expect(cell(page, "skill-1")).toHaveText("press a key...");
  await page.keyboard.press("z");
  await expect(cell(page, "skill-1")).toHaveText("Z");
  await expect(page.locator(".keys-preset")).toHaveValue("custom");

  // Esc outside a capture is the way back.
  await page.keyboard.press("Escape");
  await expect(page.locator(".options-screen")).toHaveCount(0);

  await page.getByRole("button", { name: "new character" }).click();
  await page.locator(".editor-row select").first().selectOption("elementalist");
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(".training-skill").first()).toHaveText("ZFireball");
  await page.locator(".training-stage").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".training")).toHaveClass(/is-armed/);

  // Q is nobody's key now. Fireball is a 1 s cast; were Q still Skill 1,
  // its hit would be in the log well inside this wait.
  await page.keyboard.press("q");
  await page.waitForTimeout(2500);
  await expect(page.locator(".training-log-row", { hasText: "Fireball" })).toHaveCount(0);

  await page.keyboard.press("z");
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );

  await page.reload();
  await openKeys(page);
  await expect(cell(page, "skill-1")).toHaveText("Z");
});

test("(2) taking a key from another action empties its cell and says so", async ({ page }) => {
  await page.goto("./");
  await openKeys(page);
  await cell(page, "skill-2").click();
  await page.keyboard.press("q");
  await expect(cell(page, "skill-2")).toHaveText("Q");
  await expect(cell(page, "skill-1")).toHaveText("-");
  await expect(cell(page, "skill-1")).toHaveClass(/is-flashing/);
  await expect(page.locator(".keys-line")).toHaveText("Q was Skill 1; Skill 1 now has no key.");
  await expect(page.locator('tr:has(.key-cell[data-action="skill-1"]) .keys-warning')).toHaveText(
    "no key",
  );

  // Esc in a capture cancels it, and stays on the screen.
  await cell(page, "skill-3").click();
  await page.keyboard.press("Escape");
  await expect(cell(page, "skill-3")).toHaveText("E");
  await expect(page.locator(".keys-screen")).toBeVisible();

  await page.getByRole("button", { name: "reset to VibeWars" }).click();
  await expect(cell(page, "skill-1")).toHaveText("Q");
  await expect(page.locator(".keys-preset")).toHaveValue("vibewars");
});

test("(3) Space binds and stays bound: its keyup does not click the cell again", async ({
  page,
}) => {
  await page.goto("./");
  await openKeys(page);
  await cell(page, "mute").click();
  await page.keyboard.press("Space");
  await expect(cell(page, "mute")).toHaveText("Space");
  await expect(page.locator(".key-cell.is-capturing")).toHaveCount(0);
  await expect(cell(page, "attack")).toHaveText("-");
});

test("(4) Back leaves Options for the menu; on a narrow screen the sections sit above", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 800 });
  await page.goto("./");
  await openKeys(page);
  const entry = await page.locator('.options-entry[data-section="controls"]').boundingBox();
  const pane = await page.locator(".options-pane").boundingBox();
  expect(entry).not.toBeNull();
  expect(pane).not.toBeNull();
  if (entry !== null && pane !== null) {
    expect(entry.y + entry.height).toBeLessThanOrEqual(pane.y);
  }

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.locator(".options-screen")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "options" })).toBeVisible();
});
