import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The Training Ground (#2 §Verification, cases 1–10): a live arena in the
 * character editor, running the match simulation in the tab.
 *
 * What only a browser can tell: that the arena sits where it should, that
 * it takes the keyboard only when asked, that editing the build re-arms
 * it in place, and that leaving the editor leaves no Phaser game behind.
 */

const WIDE = { width: 1500, height: 950 };

/** A new elementalist with Fireball on the bar, in a wide editor. */
async function openTraining(page: Page): Promise<Locator> {
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator(".editor-row select").first().selectOption("elementalist");
  await page.locator(".skill-box", { hasText: "Fireball" }).click();
  await expect(page.locator(".training-skill")).toHaveText(["1Fireball"]);
  const canvas = page.locator(".training canvas");
  await expect(canvas).toBeVisible();
  return canvas;
}

/**
 * The arena alone, with the overlay masked so the question stays "did the
 * world move?". Always taken with the arena released: the armed highlight
 * touches the canvas edge, and a shot that differs only by it would make a
 * "the player moved" assertion pass with nobody moving.
 */
async function arenaShot(page: Page, canvas: Locator): Promise<Buffer> {
  await expect(page.locator(".training")).not.toHaveClass(/is-armed/);
  return canvas.screenshot({ mask: [page.locator(".training-overlay")] });
}

async function releaseControl(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(".training")).not.toHaveClass(/is-armed/);
}

/** Take control of the arena by clicking a spot with nobody on it. */
async function takeControl(page: Page): Promise<void> {
  await page.locator(".training-stage").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
}

async function holdKey(page: Page, key: string, ms: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

const logRows = (page: Page): Locator => page.locator(".training-log-row");
const meter = (page: Page, name: string): Locator => page.locator(`[data-meter="${name}"]`);

async function castFireballAndLand(page: Page): Promise<void> {
  await takeControl(page);
  await page.keyboard.press("1");
  // The hit arrives once the cast completes, as a damage row naming the skill.
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );
}

test("(1) the arena is a third column, left of the editor and the library", async ({ page }) => {
  await openTraining(page);
  const training = await page.locator(".training").boundingBox();
  const editor = await page.locator(".editor").boundingBox();
  const library = await page.locator(".skill-library").boundingBox();
  expect(training).not.toBeNull();
  expect(editor).not.toBeNull();
  expect(library).not.toBeNull();
  expect(training?.x ?? 0).toBeLessThan(editor?.x ?? 0);
  expect(editor?.x ?? 0).toBeLessThan(library?.x ?? 0);
});

test("(2) the arena ignores the keyboard until it is clicked", async ({ page }) => {
  const canvas = await openTraining(page);

  // Nobody moves on their own in the target-dummy scenario.
  const first = await arenaShot(page, canvas);
  await page.waitForTimeout(700);
  expect(await arenaShot(page, canvas)).toEqual(first);

  // The direct regression test for #2 §6.4: a key pressed with the arena
  // never clicked goes nowhere.
  await holdKey(page, "w", 500);
  await page.waitForTimeout(200);
  expect(await arenaShot(page, canvas)).toEqual(first);

  await takeControl(page);
  await holdKey(page, "w", 500);
  await releaseControl(page);
  expect(await arenaShot(page, canvas)).not.toEqual(first);
});

test("(3) typing in the editor never drives the arena", async ({ page }) => {
  const canvas = await openTraining(page);
  await takeControl(page);
  const name = page.locator("input.editor-name");
  // Clicking a text field takes the keyboard, and with it the arena.
  await name.click();
  const rowsBefore = await logRows(page).count();
  const before = await arenaShot(page, canvas);

  await name.fill("");
  await page.keyboard.type("wasdd");
  await expect(name).toHaveValue("wasdd");

  const search = page.locator("input.skill-search");
  await search.click();
  await page.keyboard.type("1234");
  await expect(search).toHaveValue("1234");

  await page.waitForTimeout(300);
  expect(await arenaShot(page, canvas)).toEqual(before);
  await expect(logRows(page)).toHaveCount(rowsBefore);
  await expect(page.locator(".training")).not.toHaveClass(/is-armed/);
});

test("(4) a cast lands in the log and the meter", async ({ page }) => {
  await openTraining(page);
  await castFireballAndLand(page);
  await expect(meter(page, "dps")).not.toHaveText("0.0");
  await expect(meter(page, "damage")).not.toHaveText("0");
});

test("(5) the chosen scenario survives a reload", async ({ page }) => {
  await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");

  await page.reload();
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("select.training-scenario")).toHaveValue("armor-ladder");
});

test("(6) reset zeroes the meter but keeps the log", async ({ page }) => {
  await openTraining(page);
  await castFireballAndLand(page);
  const rows = await logRows(page).count();

  await page.getByRole("button", { name: "reset" }).click();

  await expect(meter(page, "damage")).toHaveText("0");
  await expect(meter(page, "dps")).toHaveText("0.0");
  await expect(page.locator(".training-log")).toContainText("── reset ──");
  expect(await logRows(page).count()).toBeGreaterThan(rows);
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );
});

test("(7) editing the build re-arms the arena in place", async ({ page }) => {
  await openTraining(page);
  await castFireballAndLand(page);
  const canvasHandle = await page.locator(".training canvas").elementHandle();

  await page.locator(".skill-box", { hasText: "Armor of Earth" }).click();

  // In place: a divider, the earlier rows kept, the meter restarted, and
  // the very same canvas.
  await expect(page.locator(".training-log-row", { hasText: "re-armed" }).last()).toBeVisible();
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );
  await expect(meter(page, "damage")).toHaveText("0");
  await expect(page.locator(".training-skill")).toHaveText(["1Fireball", "2Armor of Earth"]);
  expect(await canvasHandle.evaluate((node) => node.isConnected)).toBe(true);
});

test("(8) leaving the editor leaves no arena behind", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("/");
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "new character" }).click();
    await expect(page.locator(".training canvas")).toBeVisible();
    await page.getByRole("button", { name: "close" }).click();
    await expect(page.locator(".roster")).toBeVisible();
  }
  await expect(page.locator("canvas")).toHaveCount(0);

  const canvas = await openTraining(page);
  await expect(page.locator("canvas")).toHaveCount(1);
  await expect(page.locator("#viewport canvas")).toHaveCount(0);

  // The survivor is alive, not a leftover frame.
  const before = await arenaShot(page, canvas);
  await takeControl(page);
  await holdKey(page, "d", 500);
  await releaseControl(page);
  expect(await arenaShot(page, canvas)).not.toEqual(before);
});

test("(9) a quick match is unaffected", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "quick match" }).click();
  await expect(page.locator("#viewport canvas")).toHaveCount(1);
  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".training")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("(10) on a narrow screen the columns stack: training, editor, library", async ({ page }) => {
  await openTraining(page);
  await page.setViewportSize({ width: 700, height: 900 });

  await expect
    .poll(async () => {
      const [training, editor, library] = await Promise.all([
        page.locator(".training").boundingBox(),
        page.locator(".editor").boundingBox(),
        page.locator(".skill-library").boundingBox(),
      ]);
      return (training?.y ?? 0) < (editor?.y ?? 0) && (editor?.y ?? 0) < (library?.y ?? 0);
    })
    .toBe(true);
  await expect(page.locator("canvas")).toHaveCount(1);
});

test("(11) every skill button shows its skill-type badge, as the HUD does", async ({ page }) => {
  await openTraining(page);
  await page.locator(".skill-box", { hasText: "Armor of Earth" }).click();
  const buttons = page.locator(".training-skill");
  await expect(buttons).toHaveText(["1Fireball", "2Armor of Earth"]);
  for (const [index, type] of ["Spell", "Enchantment"].entries()) {
    const badges = buttons.nth(index).locator(".skill-type-badge");
    await expect(badges).toHaveCount(1);
    await expect(badges).toHaveAttribute("alt", type);
  }
});
