import { expect, test, type Locator, type Page } from "@playwright/test";

import { KEYMAP_PRESETS, codeLabel, type Keymap } from "../apps/web/src/input/keymap.js";
import { key, skillKey } from "./keys.js";

/**
 * The Training Ground (#2 §Verification, cases 1–10): a live arena in the
 * character editor, running the match simulation in the tab.
 *
 * What only a browser can tell: that the arena sits where it should, that
 * it takes the keyboard only when asked, that editing the build re-arms
 * it in place, and that leaving the editor leaves no Phaser game behind.
 */

const WIDE = { width: 1500, height: 950 };

/** The bar's filled slots; an empty one keeps its place and its key (#347). */
const FILLED_SLOTS = ".training-skill:not(.is-empty)";

/** A new elementalist with Fireball on the bar, in a wide editor. */
async function openTraining(
  page: Page,
  keymap: Keymap = KEYMAP_PRESETS.vibewars,
): Promise<Locator> {
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator(".editor-row select").first().selectOption("elementalist");
  await page.locator(".skill-box", { hasText: "Fireball" }).click();
  await expect(page.locator(FILLED_SLOTS)).toHaveText([
    `${codeLabel(skillKey(0, keymap))}Fireball`,
  ]);
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
  await page.keyboard.press(skillKey(0));
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
  await holdKey(page, key("move-up"), 500);
  await page.waitForTimeout(200);
  expect(await arenaShot(page, canvas)).toEqual(first);

  await takeControl(page);
  await holdKey(page, key("move-up"), 500);
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

  const original = await name.inputValue();
  await name.fill("");
  await page.keyboard.type("wasdd");
  await expect(name).toHaveValue("wasdd");
  // The name is drawn over the player's head, live (#53), so it goes back
  // before the frames are compared: what is left to differ is movement.
  await name.fill(original);

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
  await expect(page.locator(FILLED_SLOTS)).toHaveText([
    `${codeLabel(skillKey(0))}Fireball`,
    `${codeLabel(skillKey(1))}Armor of Earth`,
  ]);
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
  await holdKey(page, key("move-right"), 500);
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
  const buttons = page.locator(FILLED_SLOTS);
  await expect(buttons).toHaveText([
    `${codeLabel(skillKey(0))}Fireball`,
    `${codeLabel(skillKey(1))}Armor of Earth`,
  ]);
  for (const [index, type] of ["Spell", "Enchantment"].entries()) {
    const badges = buttons.nth(index).locator(".skill-type-badge");
    await expect(badges).toHaveCount(1);
    await expect(badges).toHaveAttribute("alt", type);
  }
});

/** WCAG relative luminance of a computed `rgb(r, g, b)` colour. */
function luminance(css: string): number {
  const match = /rgba?\((\d+), (\d+), (\d+)/.exec(css);
  expect(match, css).not.toBeNull();
  const linear = (channel: string | undefined): number => {
    const s = Number(channel) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(match?.[1]) + 0.7152 * linear(match?.[2]) + 0.0722 * linear(match?.[3]);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("(12) the health and energy numbers read at 4.5:1 on the fill and the track", async ({
  page,
}) => {
  await openTraining(page);
  for (const kind of ["health", "energy"]) {
    const bar = page.locator(`.training-bar-${kind}`);
    const ink = await bar
      .locator(".training-bar-label")
      .evaluate((node) => getComputedStyle(node).color);
    const fill = await bar
      .locator(".training-bar-fill")
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    const track = await bar.evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(contrast(ink, fill), `${kind} fill`).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ink, track), `${kind} track`).toBeGreaterThanOrEqual(4.5);
  }
});

test("(13) a recharging skill shows the clock-wipe and the seconds left, then clears (#152)", async ({
  page,
}) => {
  await openTraining(page);
  const slot = page.locator(FILLED_SLOTS).first();
  const idleWidth = (await slot.boundingBox())?.width;
  await castFireballAndLand(page);

  const overlay = slot.locator(".recharge-overlay");
  await expect(overlay).toHaveCount(1);
  // The number has room kept for it: the button does not grow and shove
  // its neighbours sideways (#185).
  expect((await slot.boundingBox())?.width).toBe(idleWidth);
  expect(Number(await overlay.locator(".recharge-seconds").textContent())).toBeGreaterThan(0);
  const recharge = await overlay.evaluate((node) => node.style.getPropertyValue("--recharge"));
  expect(Number(recharge)).toBeGreaterThan(0);
  await expect(slot).toHaveAttribute("aria-label", /^Fireball, recharging, \d+ seconds?$/);
  await expect(slot).toHaveClass(/\bis-recharging\b/);

  // Fireball recharges in 7 s of game time, which runs slower than wall
  // time when the CPU is loaded (#327).
  await expect(overlay).toHaveCount(0, { timeout: 20_000 });
  await expect(slot).not.toHaveAttribute("aria-label");
  await expect(slot).not.toHaveClass(/\bis-recharging\b/);
});

test("(14) in Weapon DPS, Space swings and the meter's weapon row counts it (#162)", async ({
  page,
}) => {
  await openTraining(page);
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);

  await page.keyboard.press(key("attack"));
  // "weapon / skills": the weapon's share is no longer 0. The walk and
  // swing take ~1.9 s of game time, which runs slower than wall time when
  // the CPU is loaded (#327), so this waits the default.
  await expect(meter(page, "weapon / skills")).not.toHaveText(/^0 \//);
  // Named for the weapon that swung, by the character who swung it.
  await expect(page.locator(".training-log")).toContainText(/Sword \(.+\) hits Melee dummy/);
});

test("(15) a weapon drill is never dimmed for want of a skill (#162)", async ({ page }) => {
  await openTraining(page);
  const overlay = page.locator(".training-overlay");
  // An empty bar, as a fresh character has.
  await page.locator(".skill-slot", { hasText: "Fireball" }).locator(".skill-slot-clear").click();
  await expect(page.locator(FILLED_SLOTS)).toHaveCount(0);
  await expect(overlay).toHaveText("Equip a skill to start testing.");

  await page.locator("select.training-scenario").selectOption("dodge-drill");
  await expect(page.locator(".training-log")).toContainText("── Dodge drill ──");
  await expect(overlay).toBeHidden();
});

test("(16) Tab targets in the arena and never leaves it for the name field (#268)", async ({
  page,
}) => {
  await openTraining(page);
  const name = page.locator("input.editor-name");
  const original = await name.inputValue();
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);

  // The repro: Tab used to move focus to the name field, and Space then
  // typed into it.
  await page.keyboard.press("Tab");
  await page.keyboard.press(key("attack"));
  await expect(page.locator(".training-stage")).toBeFocused();
  await expect(name).toHaveValue(original);
  // The Space was the arena's: a swing at the dummy Tab picked. ~1.9 s of
  // game time, which runs slower than wall time under load (#327), so
  // this waits the default.
  await expect(meter(page, "weapon / skills")).not.toHaveText(/^0 \//);
  await expect(page.locator(".training-log")).toContainText(/Sword \(.+\) hits Melee dummy/);
});

test("(17) after Esc releases the arena, Tab is the browser's again (#268)", async ({ page }) => {
  await openTraining(page);
  await takeControl(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".training-stage")).toBeFocused();

  // Nothing is attacking, so one Esc releases; no keyboard trap.
  await releaseControl(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".training-stage")).not.toBeFocused();
});

/** The armor ladder's six still dummies, in world units (training-scenarios.ts). */
const LADDER = [
  { x: 360, y: 90 },
  { x: 360, y: 210 },
  { x: 360, y: 330 },
  { x: 460, y: 90 },
  { x: 460, y: 210 },
  { x: 460, y: 330 },
] as const;
const TRAINING_HALL_WIDTH = 560;

/**
 * The band a dummy's name is drawn in, as screenshots: 11 px text whose
 * bottom sits 36 above the body's centre (`nameLabelBottom`), and narrower
 * than the 100 between columns, so a neighbour's name never reaches it.
 * Labels are Phaser text, not DOM, so a pixel diff is the only way to see one.
 */
async function nameBands(page: Page, canvas: Locator): Promise<Buffer[]> {
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const scale = box.width / TRAINING_HALL_WIDTH;
  return Promise.all(
    LADDER.map((dummy) =>
      page.screenshot({
        clip: {
          x: box.x + (dummy.x - 30) * scale,
          y: box.y + (dummy.y - 52) * scale,
          width: 60 * scale,
          height: 16 * scale,
        },
      }),
    ),
  );
}

test("(18) names show only on the target, under the cursor, and under Shift (#253, #302)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);

  // No target, and the cursor on the empty corner takeControl clicked:
  // these bands hold no name.
  const blank = await nameBands(page, canvas);
  const named = async (): Promise<number> =>
    (await nameBands(page, canvas)).filter((band, i) => !band.equals(blank[i] ?? band)).length;

  // Tab picks one dummy: its name, and only its, appears.
  await page.keyboard.press("Tab");
  await expect.poll(named).toBe(1);

  // Shift shows every name, and letting go hides all but the target's.
  await page.keyboard.down(key("show-names"));
  await expect.poll(named).toBe(LADDER.length);
  await page.keyboard.up(key("show-names"));
  await expect.poll(named).toBe(1);

  // The cursor over a dummy shows that one too. Two lie on the target
  // or the cursor, whichever dummy Tab picked, unless they are the same.
  const box = await canvas.boundingBox();
  const scale = (box?.width ?? 0) / TRAINING_HALL_WIDTH;
  const [first] = LADDER;
  await page.mouse.move((box?.x ?? 0) + first.x * scale, (box?.y ?? 0) + first.y * scale);
  await expect.poll(named).toBeGreaterThanOrEqual(1);
  const withHover = await named();
  expect(withHover === 1 || withHover === 2).toBe(true);
  const hovered = (await nameBands(page, canvas))[0];
  expect(hovered?.equals(blank[0] ?? Buffer.alloc(0))).toBe(false);

  // The cursor leaving the arena takes its name with it.
  await page.mouse.move(1, 1);
  await expect.poll(named).toBe(1);
});

test("(19) a move mid-cast cancels it: logged, and the cast never lands (#279)", async ({
  page,
}) => {
  await openTraining(page);
  await takeControl(page);
  await page.keyboard.press(skillKey(0));
  // Fireball takes a second; a step aside well inside it gives it up.
  await holdKey(page, key("move-up"), 150);

  const log = page.locator(".training-log");
  await expect(log).toContainText(/cancels Fireball/);
  // Long past when it would have landed.
  await page.waitForTimeout(1500);
  await expect(page.locator('.training-log-row[data-tone="damage"]')).toHaveCount(0);
  await expect(meter(page, "damage")).toHaveText("0");
});

test("(20) a double-click on a far enemy attacks it: you walk there and swing (#298)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);

  // The bow-range dummy, at (480, 210): far out of a sword's reach.
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const scale = box.width / TRAINING_HALL_WIDTH;
  await page.mouse.dblclick(box.x + 480 * scale, box.y + 210 * scale);

  await expect(page.locator(".training-adrenaline")).toContainText("· attacking");
  // Only a body that walked the whole way there can land this. The walk
  // is in game time, which runs slower than wall time under load (#327).
  await expect(page.locator(".training-log")).toContainText(/Sword \(.+\) hits Bow-range dummy/, {
    timeout: 20_000,
  });
});

test("(21) the casting slot is lit, and Esc cancels the cast and flashes it (#300)", async ({
  page,
}) => {
  // Troll Unguent: a 3 s self-cast, so a slow runner still has the whole
  // window to see the ring and press Esc inside it.
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator(".editor-row select").first().selectOption("ranger");
  await page.locator(".skill-box", { hasText: "Troll Unguent" }).click();
  await expect(page.locator(FILLED_SLOTS)).toHaveText([`${codeLabel(skillKey(0))}Troll Unguent`]);
  await takeControl(page);
  const slot = page.locator(FILLED_SLOTS).first();
  await page.keyboard.press(skillKey(0));
  await expect(slot).toHaveClass(/is-casting/);

  // Esc inside the cast gives it up, and the arena stays armed: there was
  // a cast to cancel, so Esc did not release it.
  await page.keyboard.press("Escape");
  await expect(slot).toHaveClass(/is-cancelled/);
  await expect(slot).not.toHaveClass(/is-casting/);
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
  await expect(page.locator(".training-log")).toContainText(/cancels Troll Unguent/);
  // The flash is 400 ms, then the slot is plain again.
  await expect(slot).not.toHaveClass(/is-cancelled/);
  // Cancelled, not cast: it does not recharge, so the bar casts it again.
  await expect(slot).not.toHaveClass(/\bis-recharging\b/);
  await page.keyboard.press(skillKey(0));
  await expect(slot).toHaveClass(/is-casting/);
  await page.keyboard.press("Escape");
  await expect(slot).not.toHaveClass(/is-casting/);

  // With nothing running, Esc releases the arena as before.
  await releaseControl(page);
});

test("(22) a stored Classic keymap casts on the number row (#302)", async ({ page }) => {
  // The server-served build stores under the plain `vibewars` namespace.
  await page.addInitScript((classic) => {
    localStorage.setItem("vibewars.keymap", JSON.stringify(classic));
  }, KEYMAP_PRESETS.classic);
  await openTraining(page, KEYMAP_PRESETS.classic);
  await expect(page.locator(".training-skill-key").first()).toHaveText("1");
  await takeControl(page);
  await expect(page.locator(".training-hint")).toHaveText(
    "WASD move · 1–8 cast · tab/click to target · space/double-click attack · esc to release",
  );

  await page.keyboard.press(skillKey(0, KEYMAP_PRESETS.classic));
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );
});

/**
 * The arena once it holds still: two shots 700 ms apart that match. The
 * walk marker's 400 ms fade and any walk are game time, which runs slower
 * than wall time under load (#327), so this polls rather than waits once.
 * Armed or not, as long as both shots are taken the same way.
 */
async function stillArena(page: Page, canvas: Locator): Promise<Buffer> {
  const shot = (): Promise<Buffer> =>
    canvas.screenshot({ mask: [page.locator(".training-overlay")] });
  let previous = await shot();
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(700);
        const next = await shot();
        const still = next.equals(previous);
        previous = next;
        return still;
      },
      { message: "the arena should hold still", intervals: [0], timeout: 15_000 },
    )
    .toBe(true);
  return previous;
}

test("(23) Esc stops a walk to a clicked point, and the next Esc releases the arena (#342)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await takeControl(page);
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  // Empty ground in the far corner, a long walk from the spawn.
  const scale = box.width / TRAINING_HALL_WIDTH;
  const corner = { x: box.x + 520 * scale, y: box.y + 30 * scale };
  await page.mouse.click(corner.x, corner.y);
  await page.waitForTimeout(300);

  // There was a walk to stop, so Esc did not release the arena.
  await page.keyboard.press("Escape");
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
  await releaseControl(page);
  await stillArena(page, canvas);
  const stopped = await arenaShot(page, canvas);

  // Stopped short of the corner: walking the rest of the way moves the
  // hero on. A hero Esc never stopped would stand there already, and
  // still, so stillness alone would not tell the two apart.
  await takeControl(page);
  await page.mouse.click(corner.x, corner.y);
  await stillArena(page, canvas);
  await releaseControl(page);
  const arrived = await arenaShot(page, canvas);
  expect(arrived.equals(stopped), "Esc should have stopped the hero short of the corner").toBe(
    false,
  );
});

test("(24) an empty slot's key does nothing; the next key casts its own skill (#347)", async ({
  page,
}) => {
  await openTraining(page);
  // Fireball on Q, nothing on W, Armor of Earth on E.
  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .dragTo(page.locator(".skill-slot").nth(2));
  const slots = page.locator(".training-skill");
  await expect(slots).toHaveCount(8);
  await expect(slots.nth(1)).toHaveClass(/is-empty/);
  await expect(slots.nth(1)).toHaveText(codeLabel(skillKey(1)));
  await expect(slots.nth(2)).toHaveText(`${codeLabel(skillKey(2))}Armor of Earth`);
  await takeControl(page);
  const energy = page.locator(".training-bar-energy .training-bar-label");
  const full = await energy.textContent();

  await page.keyboard.press(skillKey(1));
  await page.waitForTimeout(500);
  await expect(page.locator(".training-skill.is-casting")).toHaveCount(0);
  await expect(page.locator(".training-skill .recharge-overlay")).toHaveCount(0);
  await expect(energy).toHaveText(full ?? "");

  // E casts Armor of Earth, not some skill closed up into W.
  await page.keyboard.press(skillKey(2));
  await expect(slots.nth(2).locator(".recharge-overlay")).toHaveCount(1);
  await expect(energy).not.toHaveText(full ?? "");
});
