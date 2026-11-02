import { expect, test, type Locator, type Page } from "@playwright/test";

import { key } from "./keys.js";
import { openLibraryGroup } from "./helpers/library.js";
import { joinFriend, openRail, pickCharacter } from "./helpers/menu.js";
import { hostLobby, playOwnTeams, startSoloMatch } from "./helpers/peers.js";
import { chooseProfession } from "./helpers/professions.js";
import { bringStarter, starterKey } from "./helpers/starter.js";

/** A starter build (#852) whose Armor of Earth puts Armor Boost on yourself (#302). */
const ARMORED = "Elementalist/Mesmer";
const ARMOR_OF_EARTH = starterKey(ARMORED, "elementalist.armor-of-earth");

type Text = string | RegExp;

/**
 * Hover `icon` until one tooltip says every one of `says` and none of
 * `omits`. A solo match's foe is a random starter build (#2148): a hex it
 * lands mid-hover reflows the list and the pointer ends on another icon, so
 * every check on the text sits inside the retry.
 */
async function hoverEffect(
  page: Page,
  icon: Locator,
  says: readonly Text[],
  omits: readonly Text[] = [],
): Promise<void> {
  const tip = page.getByRole("tooltip");
  await expect(async () => {
    await icon.hover();
    for (const text of says) await expect(tip).toContainText(text, { timeout: 1000 });
    for (const text of omits) await expect(tip).not.toContainText(text, { timeout: 1000 });
  }).toPass();
}

/**
 * The effects monitor (#834): your statuses as icons under your bars,
 * each with a bar that drains, and a hover that says what it is.
 */

test("your enchantment shows as an icon, marked yours, its bar draining; the hover names it (#834)", async ({
  page,
}) => {
  await bringStarter(page, ARMORED);
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" });
  await expect(effects.getByRole("listitem")).toHaveCount(0);

  await page.keyboard.press(ARMOR_OF_EARTH);
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  await expect(icon).toBeVisible();
  await expect(icon).toHaveClass(/is-yours/);
  // No seconds on the icon (GW1): they are in the hover.
  await expect(icon).toHaveText("");

  const fill = icon.locator(".effect-bar-fill");
  const width = async (): Promise<number> => (await fill.boundingBox())?.width ?? -1;
  const first = await width();
  expect(first).toBeGreaterThan(0);
  await expect.poll(width).toBeLessThan(first);

  await hoverEffect(page, icon, ["Armor Boost", "Enchantment", "from you", /\d+ s left/]);
});

test("a maintained enchantment has no bar, its hover says maintained, costs you an energy pip, and a double-click ends it (#837, #838)", async ({
  page,
}) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "monk");
  await page.locator("input.editor-name").fill("Mender");
  await openLibraryGroup(page, "Healing Prayers");
  // Exactly Mending: Mending Touch is a Monk skill too (#1039).
  await page
    .locator(".skill-box", { has: page.locator(".skill-box-name", { hasText: /^Mending$/ }) })
    .locator(".skill-box-equip")
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Mender");
  await startSoloMatch(page);
  const energyPips = page.locator(".hud-bar-energy .vital-pips");
  await expect(energyPips).toHaveAttribute("data-pips", "4");

  // No target: Mending goes on yourself.
  await page.keyboard.press(key("skill-1"));
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Mending") });
  await expect(icon).toBeVisible();
  await expect(icon.locator(".effect-bar")).toBeHidden();
  await expect(energyPips).toHaveAttribute("data-pips", "3");

  await hoverEffect(page, icon, ["Mending", "maintained, −1 energy"], [/s left/]);

  // A double-click ends it, and the pip comes back (#838).
  await icon.dblclick();
  await expect(icon).toHaveCount(0);
  await expect(energyPips).toHaveAttribute("data-pips", "4");
});

test("a spirit's aura shows with no bar, from the spirit, while you stand in its range (#1064)", async ({
  page,
}) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "ranger");
  await page.locator("input.editor-name").fill("Winnower");
  await openLibraryGroup(page, "Wilderness Survival");
  await page.locator(".skill-box", { hasText: "Winnowing" }).locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Winnower");
  await startSoloMatch(page);

  // A 2 s ritual: the spirit stands where you do, so you are in its range.
  await page.keyboard.press(key("skill-1"));
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Winnowing") });
  await expect(icon).toBeVisible({ timeout: 10_000 });
  await expect(icon.locator(".effect-bar")).toBeHidden();

  await hoverEffect(
    page,
    icon,
    ["take +4 from physical damage", "from Winnowing", "while in its range"],
    ["maintained"],
  );
});

test("a ward's aura shows with no bar while you stand in it (#1087)", async ({ page }) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await chooseProfession(page, "primary", "elementalist");
  await page.locator("input.editor-name").fill("Warder");
  await openLibraryGroup(page, "Earth Magic");
  await page
    .locator(".skill-box", { hasText: "Ward Against Melee" })
    .locator(".skill-box-equip")
    .click();
  // Earth Magic 12: the ward lasts 17 s, not rank 0's 5 s, which a hover
  // on a loaded CI runner could outlast before its tooltip opened (#1659).
  await page
    .locator(".editor-attribute", { hasText: "Earth Magic" })
    .locator('.attribute-pip[data-pip="12"]')
    .click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Warder");
  await startSoloMatch(page);

  // A 1 s ward spell: the ward lands where you stand, so you are in it.
  await page.keyboard.press(key("skill-1"));
  const effects = page.getByRole("list", { name: "your effects" });
  const icon = effects
    .getByRole("listitem")
    .filter({ has: page.getByAltText("Ward Against Melee") });
  await expect(icon).toBeVisible({ timeout: 10_000 });

  // Hover first, while the ward still stands: each check on the loaded
  // match page can take seconds (#1659). The tooltip stays open for the
  // bar check after it.
  await hoverEffect(page, icon, ["50% chance to block melee attacks", "while in its range"]);
  await expect(icon.locator(".effect-bar")).toBeHidden();
});

test("the target frame shows a foe's enchantment, at 16 px and not marked yours (#835)", async ({
  page,
}) => {
  // One context, so the two pages find each other (helpers/peers.ts).
  const foe = await page.context().newPage();
  // The pages share one storage, so the foe plays this starter too.
  await bringStarter(page, ARMORED);
  // Each side of one plays it, the active character, as a 1v1 does (#2141).
  const code = await hostLobby(page);
  await foe.goto("./");
  await joinFriend(foe, code);
  await foe.getByRole("button", { name: "join team 2" }).click();
  await foe.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  await playOwnTeams([{ page }, { page: foe }]);

  const effects = page.getByRole("list", { name: "your target's effects" });
  await expect(effects).toBeHidden();
  await page.keyboard.press(key("target-next"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
  await expect(effects).toBeHidden();

  await foe.keyboard.press(ARMOR_OF_EARTH);
  const icon = effects.getByRole("listitem").filter({ has: page.getByAltText("Armor Boost") });
  await expect(icon).toBeVisible();
  await expect(icon).not.toHaveClass(/is-yours/);
  expect((await icon.getByRole("img").boundingBox())?.width).toBe(16);
  await foe.close();
});
