import { expect, test, type Locator, type Page } from "@playwright/test";

import { KEYMAP_PRESETS, codeLabel, type Keymap } from "../apps/web/src/input/keymap.js";
import { DEFAULT_STEP, zoomFor } from "../apps/web/src/render/camera-rig.js";
import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { chooseProfession, professionField } from "./helpers/professions.js";
import { startSoloMatch } from "./helpers/peers.js";
import { openRail } from "./helpers/menu.js";
import { projection, type Projection } from "./camera.js";
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

/**
 * The filled slots, each by its hotkey and its name. The bar shows icons,
 * not names (#719), so the name is the slot's accessible one.
 */
async function expectFilledSlots(page: Page, names: readonly string[]): Promise<void> {
  const filled = page.locator(FILLED_SLOTS);
  await expect(filled).toHaveText(names.map((_, index) => codeLabel(skillKey(index))));
  for (const [index, name] of names.entries()) {
    await expect(filled.nth(index)).toHaveAccessibleName(name);
  }
}

/** A new elementalist, holding its Wand (#614), with Fireball on the bar, in a wide editor. */
async function openTraining(
  page: Page,
  keymap: Keymap = KEYMAP_PRESETS.vibewars,
): Promise<Locator> {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "elementalist");
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(FILLED_SLOTS)).toHaveText([codeLabel(skillKey(0, keymap))]);
  await expect(page.locator(FILLED_SLOTS).first()).toHaveAccessibleName("Fireball");
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

/**
 * Release the arena without Esc, so the target stays (#1151): by clicking
 * into the name field, as a player would.
 */
async function releaseByClickAway(page: Page): Promise<void> {
  await page.locator("input.editor-name").click();
  await expect(page.locator(".training")).not.toHaveClass(/is-armed/);
}

/** Take control of the arena by clicking a spot with nobody on it. */
async function takeControl(page: Page): Promise<void> {
  await page.locator(".training-stage").click({ position: { x: 12, y: 12 } });
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
}

/**
 * Step out to Wide, the pointer on the centre, and wait for the camera to
 * settle. The stage draws at a match's scale (#709) and follows you past
 * the map's edge (#721): at Wide it shows about 590 by 580 round you.
 */
async function wholeMap(page: Page): Promise<void> {
  const stage = page.locator(".training-stage");
  await stage.hover();
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAttribute("data-zoom-step", "Wide");
  await settleCamera(page);
}

/** Until the camera's zoom and centre hold still. */
async function settleCamera(page: Page): Promise<void> {
  const stage = page.locator(".training-stage");
  let last = "";
  await expect
    .poll(
      async () => {
        const now = `${String(await stage.getAttribute("data-zoom"))} ${String(await stage.getAttribute("data-camera"))}`;
        const settled = now === last;
        last = now;
        return settled;
      },
      { intervals: [250] },
    )
    .toBe(true);
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
  // Wait for the arena to hold still before the frames are compared.
  await stillArena(page, canvas);
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
  await openRail(page, "Character Builder");
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

  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .locator(".skill-box-equip")
    .click();

  // In place: a divider, the earlier rows kept, the meter restarted, and
  // the very same canvas.
  await expect(page.locator(".training-log-row", { hasText: "re-armed" }).last()).toBeVisible();
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    "Fireball",
  );
  await expect(meter(page, "damage")).toHaveText("0");
  await expectFilledSlots(page, ["Fireball", "Armor of Earth"]);
  expect(await canvasHandle.evaluate((node) => node.isConnected)).toBe(true);
});

test("(8) leaving the editor leaves no arena behind", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  for (let i = 0; i < 3; i += 1) {
    await openRail(page, "Character Builder");
    await page.getByRole("button", { name: "new character" }).click();
    await expect(page.locator(".training canvas")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".screen-characters")).toBeVisible();
  }
  // The cards' character figures are canvases too (#1250); no arena is.
  await expect(page.locator("canvas:not(.character-figure)")).toHaveCount(0);

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

test("(9) a match is unaffected", async ({ page }) => {
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator("#viewport canvas:not(.compass)")).toHaveCount(1);
  await expect(page.locator(".hud-skills .hud-skill")).toHaveCount(8);
  await expect(page.locator(".training")).toHaveCount(0);
  // The hidden Team Lobby's character figures are canvases too (#1864); no
  // second arena is.
  await expect(page.locator("canvas:not(.compass):not(.character-figure)")).toHaveCount(1);
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
  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .locator(".skill-box-equip")
    .click();
  await expectFilledSlots(page, ["Fireball", "Armor of Earth"]);
  const buttons = page.locator(FILLED_SLOTS);
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
  // Named by its skill again: the bar shows no name (#719).
  await expect(slot).toHaveAttribute("aria-label", "Fireball");
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
  await expect(page.locator(".training-log")).toContainText(/Wand \(.+\) hits Melee dummy/);
});

test("(33) in Block, the Guardian dummy blocks some swings, and the log says so (#534)", async ({
  page,
}) => {
  await openTraining(page);
  await page.locator("select.training-scenario").selectOption("block");
  await expect(page.locator(".training-log")).toContainText("── Block ──");
  await takeControl(page);

  await page.keyboard.press(key("attack"));
  // It keeps Guardian up, and casts it on itself, logged as it lands.
  await expect(page.locator(".training-log")).toContainText(
    /Guardian dummy \(60 armor\) gains Guardian/,
  );
  // Half the swings: a handful is plenty to see one blocked and one land.
  await expect(page.locator(".training-log")).toContainText(
    /Guardian dummy \(60 armor\) blocks Wand \(.+\)/,
    {
      timeout: 20_000,
    },
  );
  await expect(page.locator(".training-log")).toContainText(/Wand \(.+\) hits Guardian dummy/, {
    timeout: 20_000,
  });
});

test("(15) an empty bar is never dimmed, and Space still swings (#360)", async ({ page }) => {
  await openTraining(page);
  const overlay = page.locator(".training-overlay");
  // An empty bar, as a fresh character has.
  await page.locator(".skill-slot", { hasText: "Fireball" }).locator(".skill-slot-clear").click();
  // The bar repaints in the same re-arm as the overlay.
  await expect(page.locator(FILLED_SLOTS)).toHaveCount(0);
  await expect(overlay).toBeHidden();

  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await expect(overlay).toBeHidden();
  await takeControl(page);
  await page.keyboard.press(key("attack"));
  // The walk and swing are game time, slower than wall time under load
  // (#327), so this waits the default.
  await expect(meter(page, "weapon / skills")).not.toHaveText(/^0 \//);
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
  await expect(page.locator(".training-log")).toContainText(/Wand \(.+\) hits Melee dummy/);
});

test("(17) after Esc releases the arena, Tab is the browser's again (#268)", async ({ page }) => {
  await openTraining(page);
  await takeControl(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".training-stage")).toBeFocused();

  // Nothing is attacking: one Esc lets the target go (#1151), the next
  // releases; no keyboard trap.
  await page.keyboard.press("Escape");
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
  await releaseControl(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(".training-stage")).not.toBeFocused();
});

/** The armor ladder's dummies' ids, in `LADDER`'s order (training-scenarios.ts). */
const LADDER_IDS = ["armor-40", "armor-60", "armor-70", "armor-80", "armor-84", "armor-104"];

/** The armor ladder's six still dummies, in world units (training-scenarios.ts). */
const LADDER = [
  { x: 360, y: 90 },
  { x: 360, y: 210 },
  { x: 360, y: 330 },
  { x: 460, y: 90 },
  { x: 460, y: 210 },
  { x: 460, y: 330 },
] as const;

/** World units to the page, through the Training Ground's camera (#440). */
function trainingView(page: Page, canvas: Locator): Promise<Projection> {
  return projection(page.locator(".training-stage"), canvas);
}

/**
 * Whose names the arena draws (#253), from the stage's `data-names` hook:
 * names keep their screen size at every zoom (#456), so on the crowded
 * ladder one overlaps its neighbour's column and a pixel band per dummy
 * cannot say whose a name is.
 */
async function shownNames(page: Page): Promise<string[]> {
  const value = (await page.locator(".training-stage").getAttribute("data-names")) ?? "";
  return value === "" ? [] : value.split(",");
}

/**
 * The band a dummy's name is drawn in, as a screenshot: 11 px text at
 * every zoom (#456), whose bottom sits 3 px over the cast bar's top, 19
 * world units over the body's 14 radius (`nameLabelBottom`). Labels are
 * Phaser text, not DOM, so a pixel diff is the only way to see one.
 */
async function nameBand(
  page: Page,
  canvas: Locator,
  dummy: { readonly x: number; readonly y: number },
): Promise<Buffer> {
  const bar = (await trainingView(page, canvas)).onPage({ x: dummy.x, y: dummy.y - 14 - 19 });
  return page.screenshot({ clip: { x: bar.x - 40, y: bar.y - 3 - 20, width: 80, height: 22 } });
}

test("(18) names show only on the target, under the cursor, and under Shift (#253, #302)", async ({
  page,
}) => {
  // A walk and three waits for a still camera (#721), each a second or more.
  test.setTimeout(90_000);
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);
  // The view follows you (#721): nearer the ladder, all of it is on the stage.
  await wholeMap(page);
  await walkTo(page, canvas, { x: 250, y: 210 });

  // No target, and the cursor off the arena: no name.
  await page.mouse.move(1, 1);
  const named = async (): Promise<number> => (await shownNames(page)).length;
  await expect.poll(named).toBe(0);
  const [first] = LADDER;

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
  // The cursor leans the camera (#721), sliding the dummy from under it:
  // aim again until it holds.
  await expect
    .poll(async () => {
      const over = (await trainingView(page, canvas)).onPage(first);
      await page.mouse.move(over.x, over.y);
      await settleCamera(page);
      return shownNames(page);
    })
    .toContain(LADDER_IDS[0]);
  const withHover = await named();
  expect(withHover === 1 || withHover === 2).toBe(true);

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

test("(20) a double right click on a far enemy attacks it: you walk there and swing (#298, #438)", async ({
  page,
}) => {
  // A new character is a warrior with a Sword: the walk has to happen. An
  // elementalist's Wand (#614) reaches this dummy from the spawn point.
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await expect(professionField(page, "primary")).toHaveAttribute("data-value", "warrior");
  const canvas = page.locator(".training canvas");
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);
  await wholeMap(page);
  // Near enough that the view, which follows you (#721), shows the dummy.
  await walkTo(page, canvas, { x: 250, y: 210 });

  // The bow-range dummy, at (480, 210): far out of a sword's reach.
  const dummy = (await trainingView(page, canvas)).onPage({ x: 480, y: 210 });
  await page.mouse.dblclick(dummy.x, dummy.y, { button: "right" });

  await expect(page.locator(".training-attacking")).toContainText("attacking");
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
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page
    .locator(".skill-box", { hasText: "Troll Unguent" })
    .locator(".skill-box-equip")
    .click();
  await expectFilledSlots(page, ["Troll Unguent"]);
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
  await page.addInitScript(
    ({ key, classic }) => {
      localStorage.setItem(key, JSON.stringify(classic));
    },
    { key: `${STORAGE_NAMESPACE}.keymap`, classic: KEYMAP_PRESETS.classic },
  );
  await openTraining(page, KEYMAP_PRESETS.classic);
  await expect(page.locator(".training-skill-key").first()).toHaveText("1");
  await takeControl(page);
  await expect(page.locator(".training-hint")).toHaveText(
    "WASD move · 1–8 cast · tab/right-click to target · space/double right-click attack · esc to release",
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

/** Walk to `world` with a click on the ground, and wait until all holds still. */
async function walkTo(
  page: Page,
  canvas: Locator,
  world: { readonly x: number; readonly y: number },
): Promise<void> {
  const at = (await trainingView(page, canvas)).onPage(world);
  await page.mouse.click(at.x, at.y);
  await stillArena(page, canvas);
}

test("(23) Esc stops a walk to a clicked point, and the next Esc releases the arena (#342)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await takeControl(page);
  await wholeMap(page);
  // Empty ground near the top edge, a long walk from the spawn, and on
  // the stage of a view that follows you (#721).
  const goal = { x: 330, y: 30 };
  const corner = (await trainingView(page, canvas)).onPage(goal);
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
  const rest = (await trainingView(page, canvas)).onPage(goal);
  await page.mouse.click(rest.x, rest.y);
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
  await expect(slots.nth(2)).toHaveText(codeLabel(skillKey(2)));
  await expect(slots.nth(2)).toHaveAccessibleName("Armor of Earth");
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

test("(25) the wheel over the arena steps the zoom; over the build panel it does not (#440)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  const stage = page.locator(".training-stage");
  await expect(stage).toHaveAttribute("data-zoom-step", "Default");
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  const scrolled = () => page.evaluate(() => [window.scrollX, window.scrollY]);
  const before = await scrolled();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAttribute("data-zoom-step", "Wide");
  // Each notch after the wheel's lockout, so none is swallowed.
  for (const _ of [1, 2]) {
    await page.waitForTimeout(200);
    await page.mouse.wheel(0, -100);
  }
  await expect(stage).toHaveAttribute("data-zoom-step", "Near");
  expect(await scrolled()).toEqual(before);

  const editor = await page.locator(".editor").boundingBox();
  if (editor === null) {
    throw new Error("the build panel has no box");
  }
  await page.mouse.move(editor.x + editor.width / 2, editor.y + editor.height / 2);
  await page.waitForTimeout(200);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(300);
  await expect(stage).toHaveAttribute("data-zoom-step", "Near");
});

test("(26) left click walks, even onto a dummy, and never targets; right click targets (#438)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);
  await wholeMap(page);
  const [first] = LADDER;

  // The cursor off the arena. Shot armed throughout, as Esc first stops
  // the walk rather than release.
  await page.mouse.move(1, 1);
  const shot = (): Promise<Buffer> =>
    canvas.screenshot({ mask: [page.locator(".training-overlay")] });
  const start = await stillArena(page, canvas);

  // A left click on the dummy walks toward it, and targets nobody.
  const dummy = (await trainingView(page, canvas)).onPage(first);
  await page.mouse.click(dummy.x, dummy.y);
  await page.mouse.move(1, 1);
  await page.waitForTimeout(300);
  expect((await shot()).equals(start), "the hero should be walking").toBe(false);

  // The view follows the walk (#721), so the walk is stopped and the
  // camera left to settle before the names are read. No name is shown:
  // nobody is targeted.
  await page.keyboard.press("Escape");
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
  await stillArena(page, canvas);
  expect(await shownNames(page)).toEqual([]);

  // A right click on it targets it: its name shows with the cursor gone.
  // Through the camera as it is now: it has followed the walk.
  const moved = (await trainingView(page, canvas)).onPage(first);
  await page.mouse.click(moved.x, moved.y, { button: "right" });
  await page.mouse.move(1, 1);
  await expect.poll(() => shownNames(page)).toEqual([LADDER_IDS[0]]);
  await expect(page.locator(".training-attacking")).not.toContainText("attacking");
});

test("(27) a right click on the ground moves nobody and keeps the target (#438)", async ({
  page,
}) => {
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);
  // Off the arena, so no name shows under the cursor.
  await page.mouse.move(1, 1);
  const named = async (): Promise<number> => (await shownNames(page)).length;

  await page.keyboard.press("Tab");
  await expect.poll(named).toBe(1);
  // Not by Esc, which would let the target go (#1151).
  await releaseByClickAway(page);
  const before = await stillArena(page, canvas);

  // Empty ground between the spawn and the ladder.
  await takeControl(page);
  const ground = (await trainingView(page, canvas)).onPage({ x: 220, y: 330 });
  await page.mouse.click(ground.x, ground.y, { button: "right" });
  await page.mouse.move(1, 1);
  await releaseByClickAway(page);
  const after = await stillArena(page, canvas);
  expect(await named()).toBe(1);
  expect(after.equals(before), "nobody should have moved").toBe(true);
});

test("(28) a left click while the right button is held still walks (#438)", async ({ page }) => {
  const canvas = await openTraining(page);
  await takeControl(page);
  const shot = (): Promise<Buffer> =>
    canvas.screenshot({ mask: [page.locator(".training-overlay")] });
  const start = await shot();

  // Empty ground in the far corner, with the right button down first.
  const corner = (await trainingView(page, canvas)).onPage({ x: 520, y: 30 });
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.down({ button: "left" });
  await page.mouse.up({ button: "left" });
  await page.mouse.up({ button: "right" });
  await page.waitForTimeout(500);
  expect((await shot()).equals(start), "the hero should be walking").toBe(false);
});

test("(29) an attack skill pressed out of reach walks in, then lands (#415)", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  // A new character is a warrior; Swift Chop needs an axe.
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await page.locator(".gear-box").filter({ hasText: "Axe" }).first().click();
  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await page.getByRole("button", { name: "skills", exact: true }).click();
  await page.locator(".skill-box", { hasText: "Swift Chop" }).locator(".skill-box-equip").click();
  await expectFilledSlots(page, ["Swift Chop"]);
  const canvas = page.locator(".training canvas");
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);
  await wholeMap(page);
  // Near enough that the view, which follows you (#721), shows the dummy.
  await walkTo(page, canvas, { x: 250, y: 210 });

  // Target the bow-range dummy, at (480, 210), far out of an axe's reach.
  const dummy = (await trainingView(page, canvas)).onPage({ x: 480, y: 210 });
  await page.mouse.click(dummy.x, dummy.y, { button: "right" });
  await page.keyboard.press(skillKey(0));

  // Not refused: no "out of range", and the hero walks there to chop. The
  // walk is in game time, which runs slower than wall time under load (#327).
  await expect(page.locator(".training-log")).toContainText(/Swift Chop .*Bow-range dummy/, {
    timeout: 20_000,
  });
  await expect(page.locator(".training-log")).not.toContainText("out of range");
});

test("(30) a spell pressed out of range walks in, then goes off (#499)", async ({ page }) => {
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);
  await wholeMap(page);

  // Target the bow-range dummy, at (480, 210), from where the view, which
  // follows you (#721), shows it.
  await walkTo(page, canvas, { x: 250, y: 210 });
  const dummy = (await trainingView(page, canvas)).onPage({ x: 480, y: 210 });
  await page.mouse.click(dummy.x, dummy.y, { button: "right" });

  // A left click walks and keeps the target (#438): to the top-left
  // corner, about 500 from the dummy, out of Fireball's 420.
  await walkTo(page, canvas, { x: 20, y: 20 });
  await page.keyboard.press(skillKey(0));

  // Not refused: the hero walks back in and casts. In game time, which
  // runs slower than wall time under load (#327).
  await expect(page.locator('.training-log-row[data-tone="damage"]').first()).toContainText(
    /Fireball.*Bow-range dummy/,
    { timeout: 20_000 },
  );
  await expect(page.locator(".training-log")).not.toContainText("out of range");
});

test("(31) a slot out of reach of the target is marked, and the mark goes once in reach (#485)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  // A new character is a warrior; Swift Chop needs an axe.
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await page.locator(".gear-box").filter({ hasText: "Axe" }).first().click();
  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await page.getByRole("button", { name: "skills", exact: true }).click();
  await page.locator(".skill-box", { hasText: "Swift Chop" }).locator(".skill-box-equip").click();
  const canvas = page.locator(".training canvas");
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);
  await wholeMap(page);
  const slot = page.locator(FILLED_SLOTS).first();
  // Near enough that the view, which follows you (#721), shows the dummy.
  await walkTo(page, canvas, { x: 250, y: 210 });
  // No target, no mark.
  await expect(slot).not.toHaveClass(/is-out-of-range/);

  // The bow-range dummy, at (480, 210), far out of an axe's reach.
  const dummy = (await trainingView(page, canvas)).onPage({ x: 480, y: 210 });
  await page.mouse.click(dummy.x, dummy.y, { button: "right" });
  await expect(slot).toHaveClass(/is-out-of-range/);
  // A shape, not only a colour: the `↔` in the corner (#719).
  const glyph = await slot
    .locator(".skill-range-mark")
    .evaluate((node) => getComputedStyle(node, "::after").content);
  expect(glyph).toBe('"↔"');

  // A hint, not a gate: the press walks in (#415), and in reach the mark goes.
  await page.keyboard.press(skillKey(0));
  await expect(slot).not.toHaveClass(/is-out-of-range/, { timeout: 20_000 });
});

test("(32) the casting slot fills as the cast goes, hovering it shows its tooltip, and a cast hides it (#485)", async ({
  page,
}) => {
  // Troll Unguent: a 3 s self-cast, long enough to see the fill rise.
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page
    .locator(".skill-box", { hasText: "Troll Unguent" })
    .locator(".skill-box-equip")
    .click();
  await expectFilledSlots(page, ["Troll Unguent"]);
  await takeControl(page);
  const slot = page.locator(FILLED_SLOTS).first();

  await slot.hover();
  const tip = page.locator(".skill-tip:visible");
  await expect(tip).toContainText("Troll Unguent");

  await page.keyboard.press(skillKey(0));
  await expect(slot).toHaveClass(/is-casting/);
  await expect(tip).toHaveCount(0);
  const fill = (): Promise<number> =>
    slot.evaluate((node) => Number((node as HTMLElement).style.getPropertyValue("--cast-fill")));
  const early = await fill();
  await expect.poll(fill).toBeGreaterThan(early);
  expect(await fill()).toBeLessThanOrEqual(1);

  // The fill goes the frame the cast does.
  await expect(slot).not.toHaveClass(/is-casting/, { timeout: 10_000 });
  expect(await fill()).toBe(0);
});

test("(34) Backbreaker lays the melee dummy flat until it rises (#545)", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  // A new character is a warrior; Backbreaker needs a hammer.
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await page.locator(".gear-box").filter({ hasText: "Hammer" }).first().click();
  await expect(page.locator(".gear-slot").first()).toContainText("Hammer");
  await page.getByRole("button", { name: "skills", exact: true }).click();
  await page.locator(".skill-box", { hasText: "Backbreaker" }).locator(".skill-box-equip").click();
  const canvas = page.locator(".training canvas");
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);

  // The melee dummy, at (136, 210), in reach from spawn.
  const dummy = (await trainingView(page, canvas)).onPage({ x: 136, y: 210 });
  await page.mouse.dblclick(dummy.x, dummy.y, { button: "right" });
  // Backbreaker costs 9 strikes, one a landed blow (#463): about 16 s of
  // swinging, in game time, which runs slower than wall time under load
  // (#327). Its slot stops greying once it is charged.
  await expect(page.locator(".training-skill").first()).not.toHaveClass(/is-unaffordable/, {
    timeout: 40_000,
  });

  // One pixel inside the standing disc, across the dummy's facing (it
  // faces the player, along x): body colour while it stands, floor once
  // it lies flattened along its facing. Read where the camera is now.
  const probe = (await trainingView(page, canvas)).onPage({ x: 136, y: 210 + 0.8 * 14 });
  const pixel = (): Promise<Buffer> =>
    page.screenshot({
      clip: { x: Math.round(probe.x), y: Math.round(probe.y), width: 1, height: 1 },
    });
  const standing = await pixel();

  await page.keyboard.press(skillKey(0));
  await expect(page.locator(".training-log")).toContainText(
    /Backbreaker \(.+\) knocks down Melee dummy \(60 armor\) \(4 s\)/,
  );
  expect(await pixel()).not.toEqual(standing);
  // Up again after its 4 s, drawn from the snapshot alone.
  await expect.poll(pixel, { timeout: 15_000 }).toEqual(standing);
});

test("(35) the bars show net regeneration as arrows: an Elementalist's 4 energy pips (#504)", async ({
  page,
}) => {
  await openTraining(page);
  const energy = page.locator(".training-bar-energy .vital-pips");
  await expect(energy).toHaveText("››››");
  await expect(energy).toHaveClass(/is-regen/);
  // Full health and nothing on you: no health arrows.
  await expect(page.locator(".training-bar-health .vital-pips")).toBeHidden();
});

test("(36) the arena draws at a match's scale: the stage shows less of the world, not all of it shrunk (#709)", async ({
  page,
}) => {
  const size = { width: 1280, height: 720 };
  await page.setViewportSize(size);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  const stage = page.locator(".training-stage");
  await expect(page.locator(".training canvas")).toBeVisible();
  // What a match's canvas, the whole window (#454), shows at Default.
  const match = size;
  await expect(stage).toHaveAttribute("data-zoom", zoomFor(DEFAULT_STEP, match).toFixed(4));
  const box = await stage.boundingBox();
  expect(box?.height ?? Infinity).toBeLessThan(size.height / 2);

  // A step still steps it, at the match's zoom for that step.
  await stage.hover();
  await page.mouse.wheel(0, 100);
  await expect(stage).toHaveAttribute("data-zoom-step", "Wide");
  await expect(stage).toHaveAttribute("data-zoom", zoomFor(DEFAULT_STEP + 1, match).toFixed(4));
});

/**
 * The rows of `named` where name ink appeared over `blank`, two shots of
 * one band: how tall the name is, in screen px. Only a pixel that was
 * not there and is brighter than the grid (#1a212c) counts, so a camera
 * that moved a pixel between the shots shifts the grid without counting
 * as ink, while the name's anti-aliased top and bottom rows still do.
 */
async function inkHeight(page: Page, blank: Buffer, named: Buffer): Promise<number> {
  return page.evaluate(
    async ([before, after]) => {
      const pixels = async (base64: string): Promise<ImageData> => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
        const context = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
        if (context === null) {
          throw new Error("no 2d context");
        }
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [{ data: a }, { data: b, width }] = await Promise.all([pixels(before), pixels(after)]);
      const rows: number[] = [];
      for (let i = 0; i < a.length; i += 4) {
        const bright = Math.max(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0) > 60;
        const changed = a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2];
        if (bright && changed) {
          rows.push(Math.floor(i / 4 / width));
        }
      }
      return rows.length === 0 ? 0 : Math.max(...rows) - Math.min(...rows) + 1;
    },
    [blank.toString("base64"), named.toString("base64")] as const,
  );
}

/** Wait out a wheel's zoom ease: `data-camera` holds still. */
async function cameraSettled(page: Page): Promise<void> {
  const stage = page.locator(".training-stage");
  await page.waitForTimeout(600);
  await expect
    .poll(async () => {
      const before = await stage.getAttribute("data-camera");
      await page.waitForTimeout(200);
      return before === (await stage.getAttribute("data-camera"));
    })
    .toBe(true);
}

test("(37) a name keeps its screen size at every zoom (#456)", async ({ page }) => {
  // A walk and four waits for a still camera, each a second or more.
  test.setTimeout(90_000);
  const canvas = await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);
  const stage = page.locator(".training-stage");
  const [first] = LADDER;
  const box = await canvas.boundingBox();
  if (box === null) {
    throw new Error("the arena canvas has no box");
  }
  /** One wheel notch over the arena's corner, then the cursor off it. */
  const wheel = async (deltaY: number): Promise<void> => {
    await page.mouse.move(box.x + 8, box.y + box.height - 8);
    await page.mouse.wheel(0, deltaY);
    await page.mouse.move(1, 1);
  };

  // Nearer the ladder first: from the spawn, Default shows the stage up
  // to x 333, and the first dummy's name, at 360, would be cut by its edge.
  await wholeMap(page);
  await walkTo(page, canvas, { x: 250, y: 210 });
  await wheel(-100);

  // Nobody named, at Default and at Wide.
  await page.mouse.move(1, 1);
  await expect(stage).toHaveAttribute("data-zoom-step", "Default");
  await cameraSettled(page);
  const blankDefault = await nameBand(page, canvas, first);
  await wheel(100);
  await expect(stage).toHaveAttribute("data-zoom-step", "Wide");
  await cameraSettled(page);
  const blankWide = await nameBand(page, canvas, first);

  // Target the first dummy: its name, alone, at Wide, then at Default.
  const dummy = (await trainingView(page, canvas)).onPage(first);
  await page.mouse.click(dummy.x, dummy.y, { button: "right" });
  await page.mouse.move(1, 1);
  await expect.poll(() => shownNames(page)).toEqual([LADDER_IDS[0]]);
  await cameraSettled(page);
  const wide = await inkHeight(page, blankWide, await nameBand(page, canvas, first));
  await page.waitForTimeout(200);
  await wheel(-100);
  await expect(stage).toHaveAttribute("data-zoom-step", "Default");
  await cameraSettled(page);
  const near = await inkHeight(page, blankDefault, await nameBand(page, canvas, first));

  // An 11 px name, not one the zoom shrank to a few pixels.
  expect(near).toBeGreaterThanOrEqual(7);
  expect(near).toBeLessThanOrEqual(14);
  expect(Math.abs(wide - near)).toBeLessThanOrEqual(1);
});

test("(38) Expand fills the window at the same zoom; Esc collapses it back, still armed (#495)", async ({
  page,
}) => {
  await openTraining(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  const training = page.locator(".training");
  const stage = page.locator(".training-stage");
  await page.locator(".training-scenario").selectOption({ index: 1 });
  const scenario = await page.locator(".training-scenario").inputValue();
  const step = await stage.getAttribute("data-zoom-step");
  const collapsed = await stage.boundingBox();

  await page.getByRole("button", { name: "expand training ground" }).click();
  await expect(training).toHaveClass(/is-expanded/);
  // Expanding takes control, as a click on the stage does.
  await expect(training).toHaveClass(/is-armed/);
  await expect(stage).toBeFocused();
  await expect
    .poll(async () => (await stage.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(0.7 * 720);
  // The canvas follows the stage at once, at a match's scale (#709).
  await expect
    .poll(async () => (await page.locator(".training canvas").boundingBox())?.height ?? 0)
    .toBeCloseTo((await stage.boundingBox())?.height ?? -1, -1);
  await expect(stage).toHaveAttribute("data-zoom-step", step ?? "");
  await expect(page.locator("#screens")).toHaveCSS("overflow-y", "hidden");

  // Esc elsewhere on the page collapses too.
  await page.getByRole("button", { name: "collapse training ground" }).focus();
  await page.keyboard.press("Escape");
  await expect(training).not.toHaveClass(/is-expanded/);
  await expect(page.locator("#screens")).toHaveCSS("overflow-y", "auto");

  // On the stage: nothing to cancel, so the first Esc collapses and keeps
  // control; the next releases it.
  await page.getByRole("button", { name: "expand training ground" }).click();
  await expect(training).toHaveClass(/is-expanded/);
  await page.keyboard.press("Escape");
  await expect(training).not.toHaveClass(/is-expanded/);
  await expect(training).toHaveClass(/is-armed/);
  await expect(page.locator(".editor-layout > .training")).toHaveCount(1);
  await expect(page.locator(".training-scenario")).toHaveValue(scenario);
  await expect.poll(async () => (await stage.boundingBox())?.height).toBe(collapsed?.height);
  await page.keyboard.press("Escape");
  await expect(training).not.toHaveClass(/is-armed/);
});

test("(39) a dummy's regeneration after a hit folds into one growing row (#590)", async ({
  page,
}) => {
  await openTraining(page);
  await castFireballAndLand(page);
  // Natural regeneration starts 5 s out of combat and writes a row a
  // second; the run reads as one row that keeps growing.
  const regeneration = page.locator(".training-log-row", { hasText: "regeneration heals" });
  await expect(regeneration.first()).toContainText(/ over \d+ s$/, { timeout: 15_000 });
  await expect(regeneration).toHaveCount(1);
});

test("(40) an adrenaline skill's slot fills from dark to lit as it charges (#826)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  // A new character is a warrior; Sever Artery needs a sword, and 4 strikes.
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await page.locator(".gear-box").filter({ hasText: "Sword" }).first().click();
  await expect(page.locator(".gear-slot").first()).toContainText("Sword");
  await page.getByRole("button", { name: "skills", exact: true }).click();
  await page.locator(".skill-box", { hasText: "Sever Artery" }).locator(".skill-box-equip").click();
  await expectFilledSlots(page, ["Sever Artery"]);
  const canvas = page.locator(".training canvas");
  await page.locator("select.training-scenario").selectOption("weapon-dps");
  await expect(page.locator(".training-log")).toContainText("── Weapon DPS ──");
  await takeControl(page);

  const slot = page.locator(FILLED_SLOTS).first();
  const gauge = slot.locator(".adrenaline-gauge");
  const fill = (): Promise<number> =>
    slot.evaluate((node) =>
      Number((node as HTMLElement).style.getPropertyValue("--adrenaline-fill")),
    );
  // Empty: the whole icon dark, not the slot dimmed as an unaffordable spell is.
  await expect(gauge).toBeVisible();
  expect(await fill()).toBe(0);
  await expect(slot).toHaveCSS("opacity", "1");

  // The melee dummy, at (136, 210), in reach from spawn. Each landed blow
  // is a strike (#463), in game time, which runs slower than wall time
  // under load (#327).
  const dummy = (await trainingView(page, canvas)).onPage({ x: 136, y: 210 });
  await page.mouse.dblclick(dummy.x, dummy.y, { button: "right" });
  await expect.poll(fill, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(await fill()).toBeLessThan(1);
  await expect(gauge).toBeVisible();

  // Charged, it looks as a usable energy skill does: no gauge, not dimmed.
  await expect.poll(fill, { timeout: 30_000 }).toBe(1);
  await expect(slot).not.toHaveClass(/is-unaffordable/);
  await expect(gauge).toBeHidden();
});

test("(41) a well with no corpse near sacrifices Health and goes off anyway (#1104, #1730)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "necromancer");
  await page
    .locator(".skill-box", { hasText: "Well of Suffering" })
    .locator(".skill-box-equip")
    .click();
  // Target dummy, the default: one immortal dummy, so no body ever lies
  // in the well's reach.
  await expect(page.locator(".training-log")).toContainText("── Target dummy ──");
  await takeControl(page);

  // No corpse: not refused. The well costs 66% of your Health
  // instead, and lands where you stand. Game time runs slower than wall
  // time under load (#327).
  const slot = page.locator(FILLED_SLOTS).first();
  await page.keyboard.press(skillKey(0));
  await expect(page.locator(".training-log-row", { hasText: "sacrifices" })).toHaveCount(1, {
    timeout: 20_000,
  });
  await expect(slot).toHaveAttribute("aria-label", /^Well of Suffering, recharging/);
  await expect(page.locator(".training-message")).not.toHaveText("No corpse in range.");
});

test("(42) Symbol of Wrath strikes the dummy it was cast at once a second, five times (#1113)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "monk");
  await page
    .locator(".skill-box", { hasText: "Symbol of Wrath" })
    .locator(".skill-box-equip")
    .click();
  await takeControl(page);

  // No target: the cast picks the nearest dummy, and the symbol lands
  // under it. Each pulse is a damage row naming the skill.
  await page.keyboard.press(skillKey(0));
  const hits = page.locator('.training-log-row[data-tone="damage"]', {
    hasText: "Symbol of Wrath",
  });
  // Game time runs slower than wall time under load (#327).
  await expect(hits).toHaveCount(5, { timeout: 20_000 });
  await page.waitForTimeout(2_000);
  await expect(hits).toHaveCount(5);
});

test("(44) a burning dummy wears flames on its top edge until the burning ends (#1138)", async ({
  page,
}) => {
  // A walk and a wait for a still camera (#721), then 6 s of burning.
  test.setTimeout(90_000);
  // Frozen flames, so a shot of them holds still.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const canvas = await openTraining(page);
  await page
    .locator(".skill-box", { hasText: "Searing Flames" })
    .locator(".skill-box-equip")
    .click();
  await expectFilledSlots(page, ["Fireball", "Searing Flames"]);
  // Its burning lasts 1 s at Fire Magic 0 and 6 s at 12 (#2041).
  const fire = page.getByRole("slider", { name: "Fire Magic" });
  await fire.locator('.attribute-pip[data-pip="12"]').click();
  await expect(fire.locator(".editor-attribute-rank")).toHaveText("12");
  await takeControl(page);
  // The view follows you (#721): nearer the dummy, it is on the stage.
  await wholeMap(page);
  await walkTo(page, canvas, { x: 250, y: 210 });
  await page.mouse.move(1, 1);
  // Targeted first, so its target ring is in the before shot too.
  await page.keyboard.press("Tab");
  await expect.poll(() => shownNames(page)).toHaveLength(1);

  // All three flames of the target dummy at (380, 210): from its top edge,
  // r above the centre, to under its health bar, r + 8.
  const flame = async (): Promise<Buffer> => {
    const view = await trainingView(page, canvas);
    const from = view.onPage({ x: 380 - 10, y: 210 - 22 });
    const to = view.onPage({ x: 380 + 10, y: 210 - 14 });
    return page.screenshot({
      clip: { x: from.x, y: from.y, width: to.x - from.x, height: to.y - from.y },
    });
  };
  const before = await flame();

  // Searing Flames sets it burning for 6 s.
  await page.keyboard.press(skillKey(1));
  await expect.poll(async () => (await flame()).equals(before)).toBe(false);
  // Still there once any floating text over it has gone.
  await page.waitForTimeout(1_500);
  expect((await flame()).equals(before), "the flames should still show").toBe(false);
  // Game time runs slower than wall time under load (#327).
  await expect.poll(async () => (await flame()).equals(before), { timeout: 20_000 }).toBe(true);
});

test("(43) Esc stops the attack and keeps the target, then a second Esc clears it (#1151)", async ({
  page,
}) => {
  await openTraining(page);
  await page.locator("select.training-scenario").selectOption("armor-ladder");
  await expect(page.locator(".training-log")).toContainText("── Armor ladder ──");
  await takeControl(page);
  // Off the arena, so no name shows under the cursor: only the target's.
  await page.mouse.move(1, 1);
  const attacking = page.locator(".training-attacking");

  await page.keyboard.press("Tab");
  await expect.poll(() => shownNames(page)).toHaveLength(1);
  await page.keyboard.press(key("attack"));
  await expect(attacking).toContainText("attacking");

  await page.keyboard.press("Escape");
  await expect(attacking).not.toContainText("attacking");
  await expect.poll(() => shownNames(page)).toHaveLength(1);
  await expect(page.locator(".training")).toHaveClass(/is-armed/);

  await page.keyboard.press("Escape");
  await expect.poll(() => shownNames(page)).toEqual([]);
  await expect(page.locator(".training")).toHaveClass(/is-armed/);

  // Nothing left to stop or let go: Esc releases the arena.
  await releaseControl(page);
});

test("2 swaps to weapon set 2, the empty 3 does nothing, and a slot's click swaps back (#489)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  // A new character is a warrior with a sword and shield in set 1.
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await page.getByRole("tab", { name: /^2/ }).click();
  await page.locator(".gear-box").filter({ hasText: "Recurve Bow" }).first().click();
  await expect(page.locator(".training canvas")).toBeVisible();
  const slots = page.locator(".training .weapon-set");
  await expect(slots).toHaveText(["1", "2", "3", "4"]);
  await expect(slots.nth(0)).toHaveClass(/is-active/);
  await expect(slots.nth(1)).toHaveAccessibleName("Weapon set 2: Recurve Bow");
  await expect(slots.nth(2)).toHaveClass(/is-empty/);
  await takeControl(page);

  await page.keyboard.press(key("weapon-set-2"));
  await expect(slots.nth(1)).toHaveClass(/is-active/);
  await expect(slots.nth(0)).not.toHaveClass(/is-active/);

  await page.keyboard.press(key("weapon-set-3"));
  await expect(page.locator(".training-message")).toHaveText("");
  await expect(slots.nth(1)).toHaveClass(/is-active/);

  await slots.nth(0).click();
  await expect(slots.nth(0)).toHaveClass(/is-active/);
  // The click left the keyboard with the arena.
  await expect(page.locator(".training")).toHaveClass(/is-armed/);
});

test("a pet attack arms the wolf's next bite, and the log says so (#1107)", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  for (const name of ["Charm Animal", "Brutal Strike"]) {
    await page.locator(".skill-box", { hasText: name }).locator(".skill-box-equip").click();
  }
  await expectFilledSlots(page, ["Charm Animal", "Brutal Strike"]);
  await takeControl(page);
  // An equip re-arms the arena a moment later, which drops what was
  // pressed before it: press again until the armed bite lands. The walk
  // and the bite are game time, slower than wall time under load (#327).
  await expect(async () => {
    await page.keyboard.press(key("target-next"));
    await page.keyboard.press(key("attack"));
    await page.keyboard.press(skillKey(1));
    await expect(page.locator(".training-log")).toContainText(/Brutal Strike \(Wolf\) hits/, {
      timeout: 8000,
    });
  }).toPass();
});

test("(45) your wolf's row in the party window takes Heel, and lights it (#1110)", async ({
  page,
}) => {
  await page.setViewportSize(WIDE);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page.locator(".skill-box", { hasText: "Charm Animal" }).locator(".skill-box-equip").click();
  await expectFilledSlots(page, ["Charm Animal"]);
  const orders = page.getByRole("group", { name: "Pet orders" });
  const guard = orders.getByRole("button", { name: "Guard" });
  const heel = orders.getByRole("button", { name: "Heel" });
  await expect(guard).toHaveAttribute("aria-pressed", "true");
  // An equip re-arms the arena a moment later, which can drop an order
  // sent before it: press again until the wolf's mode comes back lit.
  await expect(async () => {
    await heel.click();
    await expect(heel).toHaveAttribute("aria-pressed", "true", { timeout: 2000 });
  }).toPass();
  await expect(guard).toHaveAttribute("aria-pressed", "false");
});

/** Where the arena draws `id`, from the stage's `data-positions` hook (#497). */
async function shownAt(page: Page, id: string): Promise<string | undefined> {
  const value = (await page.locator(".training-stage").getAttribute("data-positions")) ?? "";
  const entry = value.split(";").find((each) => each.startsWith(`${id}:`));
  return entry?.slice(id.length + 1);
}

test("(46) in Moving targets, the patroller walks on its own (#497)", async ({ page }) => {
  await openTraining(page);
  await page.locator("select.training-scenario").selectOption("moving-targets");
  await expect(page.locator(".training-log")).toContainText("── Moving targets ──");
  await expect.poll(() => shownAt(page, "patroller")).toBeDefined();
  const start = await shownAt(page, "patroller");
  // Nobody touches the keyboard: 2 s of its loop, 360 at full speed.
  await page.waitForTimeout(2000);
  await expect.poll(() => shownAt(page, "patroller")).not.toBe(start);
});
