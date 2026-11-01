import { expect, test, type Locator, type Page } from "@playwright/test";

import { codeLabel } from "../apps/web/src/input/keymap.js";
import { exportBuild } from "../apps/web/src/storage/build-transfer.js";
import { CHARACTER_SCHEMA_VERSION } from "../apps/web/src/storage/schema.js";
import { defaultEquipmentFor } from "../packages/game-core/src/equipment/loadout.js";
import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { chooseProfession, professionField } from "./helpers/professions.js";
import { openRail, pickCharacter } from "./helpers/menu.js";
import { startSoloMatch } from "./helpers/peers.js";
import { bringStarter } from "./helpers/starter.js";
import { expectTopbarFits } from "./helpers/topbar.js";
import { skillKey } from "./keys.js";

/**
 * Browser tests for local build management (brief §31: create character,
 * create team; §24: import/export).
 *
 * These are the parts that depend on IndexedDB, which no headless test
 * exercises — the repository tests run against an in-memory store. What
 * is being checked here is that persistence actually works in a browser
 * and survives a reload.
 */

/** Character Builder's cards and what it says is wrong (#1525), where a saved character shows. */
const roster = (page: Page): Locator => page.locator(".screen-characters .rail-body");

/** Character Builder makes the characters (#1525), so the editor is one click away. */
async function newCharacter(page: Page): Promise<void> {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
}

/** An attribute row's pip for `rank` (#565): clicking it sets that rank. */
function pip(row: Locator, rank: number): Locator {
  return row.locator(`.attribute-pip[data-pip="${String(rank)}"]`);
}

test("Esc leaves at once without edits, and asks before it discards them; Save leaves too (#566, #1902)", async ({
  page,
}) => {
  await newCharacter(page);
  // Save and ⋯ are the bar's only buttons: no Close.
  const bar = page.locator("#topbar");
  await expect(bar.getByRole("button", { name: "Close", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "more actions" }).click();
  await expect(bar.locator(".editor-more button")).toHaveText([
    "Share",
    "Share as GW1 code",
    "Load GW1 code",
    "Duplicate",
    "Delete",
  ]);
  await page.keyboard.press("Escape");
  await expect(bar.locator(".editor-more")).toBeHidden();
  await expect(page.locator(".editor-unsaved")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(roster(page)).toBeVisible();

  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Draft");
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Draft");
  // Cancel hands the focus back to Save, which the question stood in for.
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "discard" }).click();
  await expect(roster(page)).toBeVisible();
  await expect(page.locator(".character-card", { hasText: "Draft" })).toHaveCount(0);

  // Save stores and goes back where the editor was opened from.
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Kept");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(roster(page)).toContainText("Kept");
});

test("the top bar's question stands in for the crumbs and fits the window at any width (#1320)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Draft");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await expect(page.locator(".topbar-crumbs")).toBeHidden();
  for (const width of [360, 700, 721, 800, 940]) {
    await page.setViewportSize({ width, height: 700 });
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, `no sideways scroll at ${String(width)} px`).toBe(true);
    // At 720 px and under, Help folds into the ⋯, which takes its place.
    const icon = page.locator(width <= 720 ? ".topbar-more" : ".topbar-help");
    const box = await icon.boundingBox();
    expect(box, `the bar's icon shows at ${String(width)} px`).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(page.locator(".topbar-crumbs")).toBeVisible();
});

test("the editor's bar puts its status on a second row from 721 to 1200 px, nothing overlapping (#1334)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Draft");
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  const chip = page.locator(".problems-chip-toggle");
  await page.setViewportSize({ width: 1500, height: 700 });
  const oneLine = (await chip.boundingBox())?.height ?? 0;
  for (const width of [721, 800, 940, 1100, 1201]) {
    await expectTopbarFits(
      page,
      width,
      "#topbar > :not(.topbar-status), #topbar .editor-profession-field, #topbar .editor-budget, #topbar .problems-chip, #topbar .editor-unsaved",
    );
    const chipBox = await chip.boundingBox();
    expect(chipBox?.height ?? 0, `the chip is one line at ${String(width)} px`).toBeLessThanOrEqual(
      oneLine,
    );
  }
});

test("Delete in the ⋯ menu always asks, and cancel keeps the character (#566)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Doomed");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .locator(".character-card", { hasText: "Doomed" })
    .getByRole("button", { name: "edit" })
    .click();

  const more = page.getByRole("button", { name: "more actions" });
  await more.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Delete Doomed?")).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Doomed");

  await more.click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(roster(page)).toBeVisible();
  await expect(page.locator(".character-card", { hasText: "Doomed" })).toHaveCount(0);
});

test("the problems chip says what is wrong in a sentence and shows where (#566)", async ({
  page,
}) => {
  await newCharacter(page);
  const name = page.locator("input.editor-name");
  await name.fill("");
  const chip = page.locator(".problems-chip-toggle");
  await expect(chip).toHaveText("1 problem");
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("title", "Give the character a name.");

  await chip.click();
  await page.getByRole("button", { name: "Give the character a name." }).click();
  await expect(name).toBeFocused();
  await expect(name).toHaveClass(/is-flagged/);

  // Unspent points and empty slots are hints: they never block the save.
  await name.fill("Ready");
  await expect(chip).toHaveText("2 hints");
  await expect(save).toBeEnabled();
});

test("a character can be created, named and saved", async ({ page }) => {
  await newCharacter(page);

  const nameInput = page.locator("input.editor-name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Test Warrior");

  // A fresh character has no attributes spent and an empty bar, which is
  // a legal build — so it must be saveable.
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(roster(page)).toContainText("Test Warrior");
});

test("a saved character survives a page reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Persistent");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roster(page)).toContainText("Persistent");

  // The real assertion: it came back from IndexedDB, not from memory.
  await page.reload();
  await expect(roster(page)).toContainText("Persistent");
});

test("a character shown in the roster survives leaving the page at once, even on a slow disk", async ({
  page,
}) => {
  // Every other test waits on the roster before navigating, trusting that
  // the roster only shows a save once it has committed. Hold each write
  // transaction open ~500 ms, as a loaded CI runner can (#100), and check
  // that trust holds: leaving straight away must not lose the character.
  await page.addInitScript(`
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      const until = Date.now() + 500;
      const keepOpen = () => {
        if (Date.now() < until) this.count().onsuccess = keepOpen;
      };
      keepOpen();
      return request;
    };
  `);
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Slow Disk");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roster(page)).toContainText("Slow Disk");

  await page.goto("./");
  await expect(roster(page)).toContainText("Slow Disk");
});

test("spending attribute points updates the remaining budget", async ({ page }) => {
  await newCharacter(page);

  const budget = page.locator(".editor-points-text");
  const before = (await budget.textContent()) ?? "";

  await pip(page.locator(".editor-attribute").first(), 1).click();
  await page.mouse.move(0, 0);

  await expect(budget).not.toHaveText(before);
});

/** Whether `icon` loaded a picture, not a broken image. */
async function loaded(icon: Locator): Promise<boolean> {
  return icon.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
}

test("the library, the bar and the tooltip show each skill's icon (#727)", async ({ page }) => {
  await newCharacter(page);
  await chooseProfession(page, "primary", "elementalist");
  const box = page.locator(".skill-box", { hasText: "Armor of Earth" });
  const rowIcon = box.locator(".skill-box-card img.skill-icon");
  await expect(rowIcon).toHaveAttribute(
    "src",
    /\/icons\/skill\/elementalist\.armor-of-earth\.svg$/,
  );
  await expect(rowIcon).toHaveAttribute("width", "24");
  await expect.poll(() => loaded(rowIcon)).toBe(true);

  // A headline sits beside the cost, not on a third line under the icon:
  // the row is no taller than it was (#581).
  const card = page
    .locator(".skill-box-card", { has: page.locator(".skill-box-headline:not(:empty)") })
    .first();
  const cost = await card.locator(".skill-box-cost").boundingBox();
  const headline = await card.locator(".skill-box-headline").boundingBox();
  const cardIcon = await card.locator("img.skill-icon").boundingBox();
  expect(cost).not.toBeNull();
  expect(headline).not.toBeNull();
  expect(cardIcon).not.toBeNull();
  if (cost !== null && headline !== null && cardIcon !== null) {
    expect(Math.abs(headline.y - cost.y)).toBeLessThan(4);
    expect(headline.x).toBeGreaterThan(cost.x);
    expect(headline.y + headline.height).toBeLessThanOrEqual(cardIcon.y + cardIcon.height + 10);
  }

  await box.locator(".skill-box-equip").click();
  const slots = page.locator(".skill-slot");
  const slotIcon = slots.first().locator("img.skill-icon");
  await expect(slotIcon).toHaveAttribute("src", /elementalist\.armor-of-earth\.svg$/);
  await expect(slotIcon).toHaveAttribute("width", "48");
  await expect.poll(() => loaded(slotIcon)).toBe(true);
  await expect(slots.nth(1).locator("img.skill-icon")).toHaveCount(0);

  await box.hover();
  const tipIcon = page.locator(".skill-tip .tip-header img.skill-icon");
  await expect(tipIcon).toHaveAttribute("src", /elementalist\.armor-of-earth\.svg$/);
  await expect(page.locator(".skill-tip .tip-title")).toHaveText("Armor of Earth");
});

test("12/12/3 spends all 200 points, GW1's split (#470)", async ({ page }) => {
  await newCharacter(page);

  const row = (index: number) => page.locator(".editor-attribute").nth(index);
  for (const [index, rank] of [
    [0, 12],
    [1, 12],
    [2, 3],
  ] as const) {
    await pip(row(index), rank).click();
  }
  await page.mouse.move(0, 0);

  await expect(page.locator(".editor-points-text")).toHaveText("0 attribute points remaining");
  await expect(pip(row(2), 4)).toHaveClass(/is-dim/);
  await expect(pip(row(3), 1)).toHaveClass(/is-dim/);
  // The budget bar is the 200 points, split three ways.
  await expect(page.locator(".attribute-budget-segment")).toHaveCount(3);
});

test("a rune's bonus stays clear of max, and the pips stay in line (#1102)", async ({ page }) => {
  // The Warrior/Monk starter wears a rune: its rank reads "12 +1".
  await bringStarter(page, "Warrior/Monk");
  await openRail(page, "Character Builder");
  await page
    .locator(".character-card", { hasText: "Warrior/Monk" })
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const boosted = page.locator(".editor-attribute", {
    has: page.locator(".editor-attribute-bonus"),
  });
  await expect(boosted.first()).toBeVisible();

  const box = async (locator: Locator) => {
    const found = await locator.boundingBox();
    if (found === null) {
      throw new Error("not laid out");
    }
    return found;
  };
  // The bonus's own box, not its cell's: the cell is the column, text spills past it.
  const bonus = await box(boosted.first().locator(".editor-attribute-bonus"));
  const next = await box(boosted.first().locator(".editor-attribute-next"));
  expect(bonus.x + bonus.width).toBeLessThanOrEqual(next.x);

  const pipLefts = await page
    .locator(".editor-attribute .attribute-pips")
    .evaluateAll((all) => all.map((pips) => pips.getBoundingClientRect().left));
  expect(new Set(pipLefts).size).toBe(1);
});

/** Save characters named `names` from the main menu, one after another. */
async function saveCharacters(page: Page, names: readonly string[]): Promise<void> {
  for (const name of names) {
    await newCharacter(page);
    await page.locator("input.editor-name").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // The roster re-renders only once the save has committed. Without
    // this wait, the next newCharacter's page.goto unloads the page
    // mid-write and the character is lost.
    await expect(roster(page)).toContainText(name);
  }
}

/** The character the first start rolls (#853) has a random name (#1149): "Kaelen Ashvale". */
const ROLLED_STARTER = /^[A-Z][a-z]+ [A-Z][a-z]+$/;

/** The team editor's member rows, and their names. */
const memberRows = (page: Page) => page.locator(".team-grid .team-row");
const memberNames = (page: Page) => page.locator(".team-grid .team-row-name");
/** Team Builder on the rail (#1525), where the Team Builds are made. */
async function openTeamBuilder(page: Page): Promise<void> {
  await openRail(page, "Team Builder");
}
/**
 * Team Builder's Team Build cards (#1453, #1525), without New team build
 * and the random starter team (#2036): "Duo · 2 members".
 */
const teamRows = (page: Page) =>
  page.locator(".screen-teams .play-card:not(.play-card-new):not(.is-random)");
/** The random starter team's card (#2036), which every first start rolls. */
const starterTeamCard = (page: Page) => page.locator(".screen-teams .play-card.is-random");
async function teamList(page: Page): Promise<string[]> {
  return teamRows(page).evaluateAll((cards) =>
    cards.map((card) => {
      const count = card.querySelectorAll(".play-card-member").length;
      return `${card.querySelector(".play-card-name")?.textContent ?? ""} · ${String(count)} ${count === 1 ? "member" : "members"}`;
    }),
  );
}

test("on a phone both editors keep Save and their ⋯ in the bar, and ⋯ opens (#1902)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto("./");
  const bar = page.locator("#topbar");
  await openRail(page, "Team Builder");
  await page.getByRole("button", { name: "New team build", exact: true }).click();
  await bar.getByRole("button", { name: "more actions" }).click();
  await expect(bar.getByRole("button", { name: "Share", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "New character", exact: true }).click();
  await expect(bar.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "more actions" }).click();
  await expect(bar.getByRole("button", { name: "Share as GW1 code", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Share", exact: true }).click();
  await expect(bar.locator(".editor-share")).toBeVisible();
});

test("a new team is stored only on Save, which leaves the editor (#573, #1902)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();

  // The name is the last crumb, and Save and ⋯ are the bar's only buttons.
  const bar = page.locator("#topbar");
  await expect(bar.locator("span.topbar-crumb")).toHaveText(["VibeWars", "Team Builder"]);
  await expect(bar.locator(".topbar-crumb").last()).toHaveAttribute("aria-label", "team name");
  await expect(bar.getByRole("textbox", { name: "team name", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Back", exact: true })).toHaveCount(0);

  // Nothing stored yet: Esc leaves at once and the list is still empty.
  const save = page.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("title", "A team needs at least one member.");
  // Nothing stored to copy or delete, so neither can store a half-made team.
  await page.getByRole("button", { name: "more actions" }).click();
  await expect(bar.locator(".editor-more button")).toHaveText(["Share", "Duplicate", "Delete"]);
  await expect(page.getByRole("button", { name: "duplicate" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "delete" })).toBeDisabled();
  // The first Esc puts ⋯ away, the second leaves.
  await page.keyboard.press("Escape");
  await expect(bar.locator(".editor-more")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();
  await expect(teamRows(page)).toHaveCount(0);

  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("");
  await page.getByRole("button", { name: "add Alpha" }).click();
  await expect(save).toHaveAttribute("title", "Give the team a name.");
  await page.getByLabel("team name").fill("Duo");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(page.locator(".screen-teams")).toBeVisible();
  await expect.poll(() => teamList(page)).toEqual(["Duo · 1 member"]);

  // Edit, rename and Save: back on Team Builder, the card renamed.
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("team name").fill("Trio");
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await page.getByRole("button", { name: "more actions" }).click();
  await expect(page.getByRole("button", { name: "duplicate" })).toBeDisabled();
  await page.getByRole("button", { name: "more actions" }).click();
  await save.click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(page.locator(".screen-teams")).toBeVisible();
  await expect(teamRows(page).first().locator(".play-card-name")).toHaveText("Trio");

  await page.reload();
  await openTeamBuilder(page);
  await expect.poll(() => teamList(page)).toEqual(["Trio · 1 member"]);
});

test("a toast goes with its screen; one the next screen raises stays (#710)", async ({ page }) => {
  await saveCharacters(page, ["Alpha"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("Duo");
  await page.getByRole("button", { name: "add Alpha" }).click();
  // Save leaves (#1902); its Saved shows on Team Builder.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".screen-teams")).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect.poll(() => teamList(page)).toEqual(["Duo · 1 member"]);

  // Opening the editor at once: well inside the toast's 5 s, so only the
  // screen change can take it.
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".toast")).toHaveCount(0, { timeout: 1_000 });
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const code = await page.getByLabel("team to share").inputValue();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.locator(".screen-teams")).toBeVisible();

  // A pasted team's note is raised once the team editor is up, so it stays.
  await paste(page.locator(".screen"), code);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await expect(page.locator(".toast")).toHaveText("Pasted Duo, 1 member. Save to keep it.");
});

test("Team Builder's cards: New team build; a card shows its members, and it or its Edit opens it (#1453, #1515)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo"]);
  await openTeamBuilder(page);
  // None of your own yet: the random starter team (#2036) and New team
  // build, and no None.
  await expect(page.getByRole("heading", { name: "Team Builds" })).toBeVisible();
  await expect(teamRows(page)).toHaveCount(0);
  await expect(starterTeamCard(page)).toHaveCount(1);
  await expect(page.locator(".screen-teams .play-cards")).not.toContainText("None");
  await expect(page.getByRole("button", { name: "new team" })).toHaveCount(1);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("Duo");
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "add Bravo" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect.poll(() => teamList(page)).toEqual(["Duo · 2 members"]);
  // Each member holds its weapons, as the roster's cards do (#1864).
  await expect(teamRows(page).locator("canvas.character-figure[data-weapon-id]")).toHaveCount(2);
  await expect(page.locator(".team-play-hint")).toHaveCount(0);
  // A card is no pick: Enter on it opens it in the editor, as Edit does.
  const duo = teamRows(page).first().locator(".play-card-open");
  await expect(duo).not.toHaveAttribute("aria-pressed");
  await duo.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("team name")).toHaveValue("Duo");
  await page.keyboard.press("Escape");
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("team name")).toHaveValue("Duo");
});

test("the random Team Build: last, Reroll changes it in place, Clone opens a copy to edit (#2036)", async ({
  page,
}) => {
  await page.goto("./");
  await openTeamBuilder(page);
  const starter = starterTeamCard(page);
  await expect(starter).toHaveCount(1);
  await expect(starter.locator(".roster-random-tag")).toHaveText("Random");
  await expect(starter.getByRole("button", { name: "Edit" })).toHaveCount(0);
  // Last of the Team Builds, New team build after it.
  await expect(page.locator(".screen-teams .play-card").nth(-2)).toHaveClass(/is-random/);

  const name = starter.locator(".play-card-name");
  const before = (await name.textContent()) ?? "";
  await starter.getByRole("button", { name: "Reroll", exact: true }).click();
  await expect(name).not.toHaveText(before);
  await expect(starter).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Reroll", exact: true })).toBeFocused();

  const rerolled = (await name.textContent()) ?? "";
  await starter.getByRole("button", { name: "Clone", exact: true }).click();
  await expect(page.getByLabel("team name")).toHaveValue(`${rerolled} (copy)`);
  await page.keyboard.press("Escape");
  await expect(teamRows(page).locator(".play-card-name")).toHaveText([`${rerolled} (copy)`]);
  await expect(name).toHaveText(rerolled);
});

test("on a phone, a Team Build card's Edit sits below its members, never on them (#1786)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await saveCharacters(page, ["Alpha"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("Quad");
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "add Alpha" }).click();
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => teamList(page)).toEqual(["Quad · 4 members"]);

  const card = teamRows(page).first();
  const members = await card
    .locator(".play-card-member")
    .evaluateAll((rows) => Math.max(...rows.map((row) => row.getBoundingClientRect().bottom)));
  const edit = await card.getByRole("button", { name: "Edit" }).boundingBox();
  expect(edit).not.toBeNull();
  expect(members).toBeLessThanOrEqual(edit?.y ?? 0);
});

test("team edits stay on screen until Save, which leaves; Esc and Delete ask first (#573, #1902)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("GvG Practice");

  // Add both: each is a copy (#1452), so the picker still offers them,
  // and the first start's rolled starter, oldest and last (#853).
  const picks = page.locator(".team-picker .team-pick-name");
  await expect(picks).toHaveText(["Bravo", "Alpha", ROLLED_STARTER]);
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "add Bravo" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha", "Bravo"]);
  await expect(picks).toHaveText(["Bravo", "Alpha", ROLLED_STARTER]);

  // Reorder, still on the editor.
  const up = memberRows(page).nth(1).getByRole("button", { name: "move up" });
  await up.click();
  await expect(memberNames(page)).toHaveText(["Bravo", "Alpha"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(page.locator(".screen-teams")).toBeVisible();

  // Remove a member: unsaved, and Esc asks.
  const more = page.getByRole("button", { name: "more actions" });
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await memberRows(page).first().getByRole("button", { name: "remove" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha"]);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await more.click();
  const duplicate = page.getByRole("button", { name: "duplicate" });
  await expect(duplicate).toBeDisabled();
  await expect(duplicate).toHaveAttribute("title", "Save first to duplicate");
  await page.keyboard.press("Escape");
  await expect(duplicate).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "discard" }).click();
  await expect.poll(() => teamList(page)).toEqual(["GvG Practice · 2 members"]);

  // Duplicate.
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await more.click();
  await page.getByRole("button", { name: "duplicate" }).click();
  await expect(teamRows(page)).toHaveCount(2);

  // Delete asks; cancel keeps the team.
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await more.click();
  await page.getByRole("button", { name: "delete" }).click();
  await expect(page.getByText(/^Delete .*\?$/)).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await more.click();
  await page.getByRole("button", { name: "delete" }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(teamRows(page)).toHaveCount(1);
});

test("the team editor's bar puts its status on a second row from 721 to 1200 px, nothing overlapping (#1452)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("team name").fill("GvG Practice");
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  for (const width of [721, 800, 900, 1100, 1201]) {
    await expectTopbarFits(
      page,
      width,
      "#topbar > :not(.topbar-status), #topbar .problems-chip, #topbar .editor-unsaved",
    );
  }
});

test("the team grid: eight cells a member, drag or ↑ ↓ to reorder, places left (#574)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo", "Charlie"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();

  const header = page.locator(".team-picker-header");
  await expect(header).toHaveText("16 places left");
  await expect(page.locator(".team-pick-sub").first()).toHaveText(/^Warrior.* · \d\/8 skills$/);
  for (const name of ["Alpha", "Bravo", "Charlie"]) {
    await page.getByRole("button", { name: `add ${name}` }).click();
  }
  await expect(header).toHaveText("13 places left");
  // An added character is copied (#1452): all four stay on offer.
  await expect(page.locator(".team-pick")).toHaveCount(4);

  await expect(memberRows(page)).toHaveCount(3);
  for (const row of await memberRows(page).all()) {
    await expect(row.locator(".team-skill")).toHaveCount(8);
  }
  await expect(page.locator(".team-row-index")).toHaveText(["1", "2", "3"]);

  // Dragging Alpha onto Charlie's place is two ↓ presses.
  await memberRows(page).first().dragTo(memberRows(page).nth(2));
  await expect(memberNames(page)).toHaveText(["Bravo", "Charlie", "Alpha"]);
  await memberRows(page).nth(2).getByRole("button", { name: "move up" }).click();
  await memberRows(page).nth(1).getByRole("button", { name: "move up" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha", "Bravo", "Charlie"]);
});

test("team counters mark their cells; a cell finds its skill on the team (#575)", async ({
  page,
}) => {
  const bars: Record<string, readonly string[]> = {
    Alpha: ["Distracting Blow", "Backbreaker", "Watch Yourself!"],
    Bravo: ["Distracting Blow"],
  };
  for (const [name, skills] of Object.entries(bars)) {
    await newCharacter(page);
    await page.locator("input.editor-name").fill(name);
    for (const skill of skills) {
      await page
        .locator(".skill-box", { hasText: skill })
        .first()
        .locator(".skill-box-equip")
        .click();
    }
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(roster(page)).toContainText(name);
  }
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "add Bravo" }).click();

  const counter = (id: string) => page.locator(`.team-counter[data-counter="${id}"]`);
  const marked = page.locator(".team-skill.is-marked");
  await expect(counter("interrupt").locator(".team-counter-count")).toHaveText("2");
  await expect(counter("healing")).toHaveClass(/is-lacking/);
  await expect(counter("defence")).not.toHaveClass(/is-lacking/);

  // A counter marks exactly its cells; again clears it.
  await counter("interrupt").click();
  await expect(marked).toHaveCount(2);
  await expect(marked).toHaveText([/Distracting Blow/, /Distracting Blow/]);
  await counter("knockdown").click();
  await expect(marked).toHaveText([/Backbreaker/]);
  await counter("knockdown").click();
  await expect(marked).toHaveCount(0);
  await expect(page.locator(".team-grid")).not.toHaveClass(/is-highlighting/);

  // A cell finds every copy of its skill, and takes over from a counter.
  await counter("empty").click();
  await expect(marked).toHaveCount(12);
  await memberRows(page).nth(1).locator(".team-skill").first().click();
  await expect(marked).toHaveCount(2);
  await expect(counter("empty")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Escape");
  await expect(marked).toHaveCount(0);
  await expect(page.locator(".team-editor")).toBeVisible();
});

test("a member opens in the build editor and comes back to the unsaved team (#576)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("Trip");
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "add Bravo" }).click();
  await memberRows(page).nth(1).getByRole("button", { name: "move up" }).click();
  await expect(memberNames(page)).toHaveText(["Bravo", "Alpha"]);

  // Equip one skill on Alpha in the build editor, and save.
  const alphaCells = memberRows(page).nth(1).locator(".team-skill:not(.is-empty)");
  const before = await alphaCells.count();
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Alpha");
  await page.locator(".skill-box").first().locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The team as it was left, still unsaved, with Alpha's new bar.
  await expect(page.getByLabel("team name")).toHaveValue("Trip");
  await expect(memberNames(page)).toHaveText(["Bravo", "Alpha"]);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await expect(alphaCells).toHaveCount(before + 1);

  // Deleted from the build editor: off the team, which is still unsaved.
  await page.getByRole("button", { name: "Bravo", exact: true }).click();
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha"]);
  await expect(page.getByLabel("team name")).toHaveValue("Trip");
});

test("a team member is the team's own: an edit leaves the saved character alone; New character joins on Save (#1452)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team build" }).click();
  await page.getByLabel("team name").fill("Own");
  await page.getByRole("button", { name: "add Alpha" }).click();

  // Rename the copy and give it a skill, then store the team.
  await page.getByRole("button", { name: "Alpha", exact: true }).click();
  await page.locator("input.editor-name").fill("Alpha Prime");
  await page.locator(".skill-box").first().locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(memberNames(page)).toHaveText(["Alpha Prime"]);
  await expect(memberRows(page).locator(".team-skill:not(.is-empty)")).toHaveCount(1);

  // A new character closed unsaved joins nothing; saved, it joins.
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Fresh");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "discard" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha Prime"]);
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Fresh");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(memberNames(page)).toHaveText(["Alpha Prime", "Fresh"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");

  // Character Builder's are as they were: Alpha, unchanged, and no Fresh.
  await openRail(page, "Character Builder");
  await expect(roster(page)).toContainText("Alpha");
  await expect(roster(page)).not.toContainText("Alpha Prime");
  await expect(roster(page)).not.toContainText("Fresh");
  await page.reload();
  await openTeamBuilder(page);
  await expect.poll(() => teamList(page)).toEqual(["Own · 2 members"]);
});

/** Paste `text` onto `target`, as Ctrl+V with it on the clipboard does. */
async function paste(target: Locator, text: string): Promise<void> {
  await target.evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

test("⋯ Share copies the build as one line, and a paste on the editor imports it (#572)", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Shared Build");

  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const line = page.getByLabel("build to share");
  await expect(line).toBeFocused();
  const exported = await line.inputValue();
  expect(exported).toContain("vibewars.character");
  expect(exported).toContain("Shared Build");
  expect(exported).not.toContain("\n");

  await page.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Copied");
  await expect(line).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(exported);

  // Someone pastes a build they were sent into a different character.
  // Named but never saved: Esc asks first (#566).
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "discard" }).click();
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Scratch");

  // Into the name field it is only typing.
  await paste(page.locator("input.editor-name"), exported);
  await expect(page.locator("input.editor-name")).toHaveValue("Scratch");

  // Text that is not a build is ignored.
  await paste(page.locator(".editor"), "gg, well played");
  await expect(page.locator(".toast")).toBeHidden();

  // A clipped build says why it failed, then the whole one imports, unsaved.
  await paste(page.locator(".editor"), exported.slice(0, 40));
  await expect(page.locator(".toast .toast-text")).toHaveText("Could not import");
  await expect(page.locator(".toast-problems li")).toContainText(["not valid JSON"]);
  await expect(page.locator("input.editor-name")).toHaveValue("Scratch");

  await paste(page.locator(".editor"), exported);
  await expect(page.locator(".toast")).toHaveText("Imported Shared Build");
  await expect(page.locator("input.editor-name")).toHaveValue("Shared Build");
  await expect(page.locator(".editor-unsaved")).toBeVisible();
});

test("⋯ Share as GW1 code shows a template code; a pasted one imports, missing skills empty (#494)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Scratch");

  // Warrior/Monk, Strength 12, Swift Chop and Orison of Healing, its fields
  // wider than they need be: gw1-template.test.ts spells out its bits.
  await paste(page.locator(".editor"), "OUwQEROqaGBAAAAAAAAA");
  await expect(page.locator(".toast")).toHaveText("Imported Warrior/Monk build");
  await expect(page.locator("input.editor-name")).toHaveValue("Warrior/Monk build");
  await expect(page.locator(".editor-unsaved")).toBeVisible();

  // Shared back, as the encoder writes it: the narrowest fields.
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share as GW1 code", exact: true }).click();
  await expect(page.getByLabel("build to share")).toHaveValue("OQMRE5oqZEAAAAAAAAA");
  await page.keyboard.press("Escape");

  // GW1 skills 3000 and 567 are not in VibeWars: their slots arrive empty.
  await paste(page.locator(".editor"), "OQMAQVF4u3IAAAAAAAAAA");
  await expect(page.locator(".toast")).toHaveText(
    "Imported Warrior/Monk build. 2 skills are not in VibeWars yet: GW1 skill 3000, 567.",
  );

  // Vital Transfer is this game's own: a bar with it has no GW1 code.
  await paste(
    page.locator(".editor"),
    exportBuild({
      schemaVersion: CHARACTER_SCHEMA_VERSION,
      id: "vital",
      name: "Vital",
      primaryProfession: "necromancer",
      secondaryProfession: undefined,
      attributes: [],
      skillBar: ["necromancer.blood-renewal-lite", null, null, null, null, null, null, null],
      equipment: defaultEquipmentFor("necromancer"),
      updatedAt: 0,
    }),
  );
  await expect(page.locator(".toast")).toHaveText("Imported Vital");
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share as GW1 code", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText(
    "Vital Transfer is not a GW1 skill, so this build has no GW1 code.",
  );
  await expect(page.getByLabel("build to share")).toBeHidden();
});

test("⋯ Load GW1 code loads a pasted code, and says plainly why it will not (#2004)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Load GW1 code", exact: true }).click();
  const field = page.getByLabel("GW1 code to load");
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute("placeholder", "Paste a GW1 template code");

  await field.fill("gg, well played");
  await field.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That is not a GW1 template code.");
  await expect(field).toHaveValue("gg, well played");

  // Warrior/Monk, Swift Chop and Orison of Healing, as the paste test's.
  await field.fill("OUwQEROqaGBAAAAAAAAA");
  await page.getByRole("button", { name: "Load", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Imported Warrior/Monk build");
  await expect(field).toBeHidden();
  await expect(page.locator("input.editor-name")).toHaveValue("Warrior/Monk build");
  await expect(page.locator(".skill-slot", { hasText: "Swift Chop" })).toHaveCount(1);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
});

test("⋯ opens above the Load field, and Share takes its place (#2004)", async ({ page }) => {
  await newCharacter(page);
  const more = page.getByRole("button", { name: "more actions" });
  await more.click();
  await page.getByRole("button", { name: "Load GW1 code", exact: true }).click();
  const field = page.getByLabel("GW1 code to load");
  await expect(field).toBeVisible();

  await more.click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByLabel("build to share")).toBeVisible();
  await expect(field).toBeHidden();

  await more.click();
  await page.getByRole("button", { name: "Load GW1 code", exact: true }).click();
  await expect(field).toBeVisible();
  await expect(page.getByLabel("build to share")).toBeHidden();
});

test("⋯, Share and Load stay inside the window at 1100 px and on a phone (#2028)", async ({
  page,
}) => {
  const inside = async (panel: Locator, width: number): Promise<void> => {
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(8);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width - 8);
  };
  for (const [width, height] of [
    [1100, 800],
    [360, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await newCharacter(page);
    const bar = page.locator("#topbar");
    const more = bar.getByRole("button", { name: "more actions" });
    await more.click();
    await inside(bar.locator(".editor-more"), width);
    await bar.getByRole("button", { name: "Share", exact: true }).click();
    await inside(bar.locator(".editor-share"), width);
    await more.click();
    await bar.getByRole("button", { name: "Load GW1 code", exact: true }).click();
    await inside(bar.locator(".editor-load"), width);
  }
});

test("Share keeps the line selected when the clipboard is refused (#572)", async ({ page }) => {
  await newCharacter(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });

  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("button", { name: "Copy", exact: true }).click();

  const line = page.getByLabel("build to share");
  await expect(line).toBeFocused();
  expect(
    await line.evaluate(
      (input: HTMLInputElement) =>
        input.selectionStart === 0 && input.selectionEnd === input.value.length,
    ),
  ).toBe(true);
  await expect(page.locator(".toast")).toBeHidden();
});

test("Share copies a team as one line; pasted on Team Builder it opens unsaved (#577)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo"]);
  await openTeamBuilder(page);
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("Duo");
  await page.getByRole("button", { name: "add Alpha" }).click();
  await page.getByRole("button", { name: "add Bravo" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");

  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const line = page.getByLabel("team to share");
  await expect(line).toBeFocused();
  const code = await line.inputValue();
  expect(code).toContain("vibewars.team");
  expect(code).not.toContain("\n");
  await page.keyboard.press("Escape");
  await expect(line).toBeHidden();

  await page.keyboard.press("Escape");
  // Team Builder mounts once the teams load; a paste before that finds no listener.
  await expect(page.getByRole("button", { name: "new team" })).toBeVisible();

  // On Team Builder, a build code is not a team and is ignored; the team code
  // opens the team unsaved, its members its own (#1452).
  const build = JSON.stringify((JSON.parse(code) as { members: unknown[] }).members[0]);
  await paste(page.locator(".screen"), build);
  await expect(page.locator(".toast")).toBeHidden();
  await paste(page.locator(".screen"), code);
  await expect(page.locator(".toast")).toHaveText("Pasted Duo, 2 members. Save to keep it.");
  await expect(page.getByLabel("team name")).toHaveValue("Duo");
  await expect(memberNames(page)).toHaveText(["Alpha", "Bravo"]);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");

  // With edits pending, a pasted team asks first.
  await teamRows(page).first().getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("team name").fill("Edited");
  await paste(page.locator(".team-editor"), code);
  await expect(page.getByText("Discard your edits and open the pasted team?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(page.getByLabel("team name")).toHaveValue("Edited");

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "discard" }).click();
  await expect.poll(() => teamList(page)).toEqual(["Duo · 2 members", "Duo · 2 members"]);

  // On the build editor a team code is not imported.
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await page.locator("input.editor-name").fill("Scratch");
  await paste(page.locator(".editor"), code);
  await expect(page.locator(".toast")).toHaveText("That is a team code. Paste it on Team Builder.");
  await expect(page.locator("input.editor-name")).toHaveValue("Scratch");
});

test("a saved character can be chosen and is taken into a match", async ({ page }) => {
  // The whole point of the build editor: what you build is what you play.
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Pyro");

  await chooseProfession(page, "primary", "elementalist");
  await pip(page.locator(".editor-attribute").first(), 1).click();
  await page.locator(".skill-box").first().locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Saving returns to Character Builder. Its card on Random Arena is how
  // a player chooses who to play (#1525).
  await expect(roster(page)).toContainText("Pyro");
  await pickCharacter(page, "Pyro");
  await expect(page.locator(".character-card", { hasText: "Pyro" })).toHaveClass(/is-selected/);

  await startSoloMatch(page);
  await expect(page.locator("#viewport canvas:not(.compass)")).toBeVisible();

  // The server grants the build's bar, so the HUD shows exactly the one
  // skill that was equipped, not a starter build, and seven empty slots.
  await expect(page.locator(".hud-skills .hud-skill:not(.is-empty)")).toHaveCount(1);
  await expect(page.locator(".hud-skills .hud-skill.is-empty")).toHaveCount(7);
});

test("in a match, an empty slot's key does nothing; the next key casts its own skill (#347)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Gap");
  await chooseProfession(page, "primary", "elementalist");
  // Armor of Earth on E, the third slot, with nothing on Q or W.
  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .dragTo(page.locator(".skill-slot").nth(2));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Gap");
  await startSoloMatch(page);
  const energy = page.locator(".hud-bar-energy .hud-bar-label");
  await expect(energy).toContainText("en");

  // Every slot in its place: W is empty, but still labelled W.
  const slots = page.locator(".hud-skills .hud-skill");
  await expect(slots).toHaveCount(8);
  await expect(slots.nth(1)).toHaveClass(/is-empty/);
  await expect(slots.nth(1)).toHaveText(codeLabel(skillKey(1)));
  await expect(slots.nth(2)).toHaveAccessibleName("Armor of Earth");

  const full = await energy.textContent();
  await page.keyboard.press(skillKey(1));
  // Long enough for the server to answer, had it anything to answer.
  await page.waitForTimeout(500);
  await expect(page.locator(".hud-skill.is-casting")).toHaveCount(0);
  await expect(page.locator(".hud-skill .recharge-overlay")).toHaveCount(0);
  await expect(energy).toHaveText(full ?? "");

  // E casts Armor of Earth, not some skill closed up into W.
  await page.keyboard.press(skillKey(2));
  await expect(slots.nth(2).locator(".recharge-overlay")).toHaveCount(1);
  await expect(energy).not.toHaveText(full ?? "");
});

test("a second elite replaces the first on the bar, framed in gold, into the match (#459)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Elite");
  await chooseProfession(page, "primary", "ranger");

  await expect(page.locator(".skill-box.is-elite", { hasText: "Barrage" })).toBeVisible();
  await expect(page.locator(".skill-box.is-elite", { hasText: "Troll Unguent" })).toHaveCount(0);
  await page.locator(".skill-elite-filter input").check();
  await expect(page.locator(".skill-box:not(.is-elite)")).toHaveCount(0);
  await page.locator(".skill-elite-filter input").uncheck();

  await page.locator(".skill-box", { hasText: "Barrage" }).locator(".skill-box-equip").click();
  await page
    .locator(".skill-box", { hasText: "Troll Unguent" })
    .locator(".skill-box-equip")
    .click();
  const slots = page.locator(".skill-slot");
  await expect(slots.nth(0)).toHaveClass(/is-elite/);

  await page
    .locator(".skill-box", { hasText: "Broad Head Arrow" })
    .dragTo(page.locator(".skill-slot").nth(3));
  await expect(page.locator(".editor-notice")).toHaveText(
    "Broad Head Arrow replaced Barrage: only one elite skill per bar.",
  );
  await expect(slots.nth(0)).toHaveClass(/is-empty/);
  await expect(slots.nth(1)).toContainText("Troll Unguent");
  await expect(slots.nth(3)).toContainText("Broad Head Arrow");
  await expect(page.locator(".skill-slot.is-elite")).toHaveCount(1);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Elite");
  await startSoloMatch(page);
  const hud = page.locator(".hud-skills .hud-skill");
  await expect(hud.nth(3)).toHaveAccessibleName("Broad Head Arrow");
  await expect(hud.nth(3)).toHaveClass(/is-elite/);
  await expect(page.locator(".hud-skills .hud-skill.is-elite")).toHaveCount(1);
});

test("in a match, Glyph of Lesser Energy shows Armor of Earth's discounted cost in its tooltip, then the full one (#637, #719)", async ({
  page,
}) => {
  // Setup, then up to 45 s for the glyph's 15 s of game time under load.
  test.setTimeout(90_000);
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Glyph");
  await chooseProfession(page, "primary", "elementalist");
  await page
    .locator(".skill-box", { hasText: "Glyph of Lesser Energy" })
    .dragTo(page.locator(".skill-slot").nth(0));
  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .dragTo(page.locator(".skill-slot").nth(1));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await pickCharacter(page, "Glyph");
  await startSoloMatch(page);
  const slot = page.locator(".hud-skills .hud-skill").nth(1);
  const tip = page.locator(".skill-tip:visible");
  // The bar shows no cost (#719); the tooltip, read again on each hover, does.
  const armorCost = async (): Promise<string> => {
    await page.mouse.move(0, 0);
    await expect(tip).toHaveCount(0);
    await slot.hover();
    return (await tip.locator(".tip-stat", { hasText: "cost" }).textContent()) ?? "";
  };
  await expect.poll(armorCost).toBe("cost10 energy");

  // The glyph takes 16 off the next two spells: Armor of Earth is free.
  await page.keyboard.press(skillKey(0));
  await expect.poll(armorCost).toBe("cost0 energy (10)");
  await page.keyboard.press(skillKey(1));
  await expect(
    page.locator(".hud-skills .hud-skill").nth(1).locator(".recharge-overlay"),
  ).toHaveCount(1);
  // One spell left on it: the cost holds until the glyph's 15 s run out, in
  // game time, which runs slower than wall time under load (#327).
  await expect.poll(armorCost).toBe("cost0 energy (10)");
  await expect.poll(armorCost, { timeout: 45_000 }).toBe("cost10 energy");
});

/**
 * The skill library and the skill bar (drag & drop, tooltips, filter).
 *
 * Drag & drop and hover tooltips cannot be tested headlessly at all —
 * they are pointer behaviour in a real engine — so they belong here.
 */
async function openElementalist(page: Page): Promise<void> {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Pyro");
  await chooseProfession(page, "primary", "elementalist");
  await chooseProfession(page, "secondary", "monk");
}

test("the skill library lists skills grouped by attribute", async ({ page }) => {
  await openElementalist(page);

  const groups = page.locator(".skill-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(1);

  // Every box under a heading belongs to that heading's attribute.
  await expect(
    page.locator(".skill-group", { hasText: "FIRE MAGIC" }).locator(".skill-box"),
  ).toContainText(["Fireball"]);

  // The group header shows the rank, because that is what makes every
  // skill under it better.
  await expect(page.locator(".skill-group-header").first()).toContainText("rank");
});

test("the library filters by name", async ({ page }) => {
  await openElementalist(page);
  const boxes = page.locator(".skill-box");
  const total = await boxes.count();
  expect(total).toBeGreaterThan(1);

  await page.locator("input.skill-search").fill("fireb");
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toContainText("Fireball");

  await page.locator("input.skill-search").fill("zzzz");
  await expect(boxes).toHaveCount(0);

  await page.locator("input.skill-search").fill("");
  await expect(boxes).toHaveCount(total);
});

test("hovering a skill shows a tooltip whose numbers follow the attribute", async ({ page }) => {
  await openElementalist(page);

  const fireball = page.locator(".skill-box", { hasText: "Fireball" });
  await fireball.hover();
  const tip = page.locator(".skill-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Fire Magic");
  await expect(tip).toContainText("damage");
  await expect(tip).toContainText("10 energy");

  const atZero = /Deals (\d+) fire damage/.exec(await tip.innerText())?.[1];
  expect(atZero).toBeDefined();

  // Spend points, and the same tooltip must report a bigger number —
  // the description is generated from the effects at the character's
  // actual ranks, not a static string.
  const fireRow = page.locator(".editor-attribute", { hasText: "Fire Magic" });
  await pip(fireRow, 8).click();
  await page.locator(".skill-box", { hasText: "Fireball" }).hover();
  await expect(tip).toBeVisible();
  const atRank = /Deals (\d+) fire damage/.exec(await tip.innerText())?.[1];

  expect(Number(atRank)).toBeGreaterThan(Number(atZero));
});

test("the primary attribute's row says what it does at its rank (#531)", async ({ page }) => {
  await newCharacter(page);
  await chooseProfession(page, "primary", "mesmer");

  const fastCasting = page.locator(".editor-attribute", { hasText: "Fast Casting" });
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveCount(0);
  await pip(fastCasting, 11).click();
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveText(
    "spells cast 40% faster, signets 33% faster",
  );
  await pip(fastCasting, 12).click();
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveText(
    "spells cast 43% faster, signets 36% faster",
  );
});

test("a skill can be dragged from the library onto a bar slot", async ({ page }) => {
  await openElementalist(page);

  const slot3 = page.locator(".skill-slot").nth(2);
  await expect(slot3).toContainText("Empty");

  await page.locator(".skill-box", { hasText: "Fireball" }).dragTo(slot3);

  await expect(page.locator(".skill-slot").nth(2)).toContainText("Fireball");
});

test("dragging one slot onto another swaps them instead of losing a skill", async ({ page }) => {
  await openElementalist(page);

  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await page
    .locator(".skill-box", { hasText: "Orison of Healing" })
    .locator(".skill-box-equip")
    .click();
  await expect(page.locator(".skill-slot").nth(0)).toContainText("Fireball");
  await expect(page.locator(".skill-slot").nth(1)).toContainText("Orison");

  await page.locator(".skill-slot").nth(0).dragTo(page.locator(".skill-slot").nth(1));

  await expect(page.locator(".skill-slot").nth(0)).toContainText("Orison");
  await expect(page.locator(".skill-slot").nth(1)).toContainText("Fireball");
});

test("a skill can be removed from the bar", async ({ page }) => {
  await openElementalist(page);
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(page.locator(".skill-slot").nth(0)).toContainText("Fireball");

  await page.locator(".skill-slot").nth(0).locator(".skill-slot-clear").click();

  await expect(page.locator(".skill-slot").nth(0)).toContainText("Empty");
});

test("the in-match skill bar is not draggable", async ({ page }) => {
  // Builds are fixed once a match starts; the HUD must not offer an
  // interaction the server would refuse.
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator("#viewport canvas:not(.compass)")).toBeVisible();

  const hudSkills = page.locator(".hud-skill");
  await expect(hudSkills.first()).toBeVisible();
  for (const handle of await hudSkills.all()) {
    expect(await handle.getAttribute("draggable")).not.toBe("true");
  }
  await expect(page.locator(".skill-library")).toHaveCount(0);
});

/**
 * A character record in a shape this build does not read: no equipment,
 * and a schema version that is not the current one. Written straight
 * into the real browser store, because `repository.test.ts` runs against
 * an in-memory one and the two differ in exactly the ways that bite
 * (structured clone, keys, transaction lifetimes).
 */
const STALE_CHARACTER = {
  schemaVersion: 99,
  id: "stale-e2e-1",
  name: "Veteran",
  primaryProfession: "warrior",
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 12 }],
  skillBar: ["warrior.sever-artery", null, null, null, null, null, null, null],
  updatedAt: 1_700_000_000_000,
};

/**
 * Run IndexedDB code in the page and wait for it to finish.
 *
 * Passed as source text rather than a function: this runs in the page,
 * where `indexedDB` lives, and the e2e tsconfig deliberately has no DOM
 * lib — typing it here would mean either a lie or a pile of casts. Once
 * per call, not an init script, so a reload does not quietly re-seed it.
 * Opened without a version: the page has already created the store at
 * whatever version the app is on.
 */
async function inCharacterStore(page: Page, body: string): Promise<unknown> {
  return page.evaluate(`
    new Promise((resolve, reject) => {
      const open = indexedDB.open(${JSON.stringify(STORAGE_NAMESPACE)});
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        // Resolve on the commit, not the request: the caller reloads
        // next, and an uncommitted write does not survive that.
        const tx = open.result.transaction("characters", "readwrite");
        const request = (${body})(tx.objectStore("characters"));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        tx.oncomplete = () => resolve(request.result ?? null);
      };
    })
  `);
}

test("a stale saved character is discarded, the player is told once, and it stays gone", async ({
  page,
}) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  const record = JSON.stringify(STALE_CHARACTER);
  await inCharacterStore(
    page,
    `(store) => store.put(${record}, ${JSON.stringify(STALE_CHARACTER.id)})`,
  );

  await page.reload();
  await expect(roster(page).locator(".screen-problem")).toHaveText(
    "A saved character from an older build of the game could not be read and was discarded.",
  );
  await expect(roster(page)).not.toContainText("Veteran");

  // Deleted, not hidden: the record is gone from the real store, and the
  // notice does not come back on the next visit.
  expect(
    await inCharacterStore(page, `(store) => store.get(${JSON.stringify(STALE_CHARACTER.id)})`),
  ).toBeNull();
  await page.reload();
  await expect(roster(page)).toBeVisible();
  await expect(roster(page).locator(".screen-problem")).toHaveCount(0);
});

/** A character saved legal under rules that no longer allow it (#1290): ranks past the cap. */
const OUTLAWED_CHARACTER = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "outlawed-e2e-1",
  name: "Outlaw",
  primaryProfession: "warrior",
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 99 }],
  skillBar: [null, null, null, null, null, null, null, null],
  equipment: defaultEquipmentFor("warrior"),
  updatedAt: 1_700_000_000_000,
};

test("#1290: an invalid character is striped and tagged Invalid, never chosen, and still edited", async ({
  page,
}) => {
  await page.goto("./");
  await openRail(page, "Random Arena");
  const record = JSON.stringify(OUTLAWED_CHARACTER);
  await inCharacterStore(
    page,
    `(store) => store.put(${record}, ${JSON.stringify(OUTLAWED_CHARACTER.id)})`,
  );
  // It was the one chosen when the rules changed under it.
  await page.evaluate(
    ([key, id]) => {
      localStorage.setItem(key, id);
    },
    [`${STORAGE_NAMESPACE}.activeCharacterId`, OUTLAWED_CHARACTER.id] as const,
  );
  await page.reload();
  // The page's own lobby opening redraws the roster (#1526): a click
  // before it lands on a card the redraw takes away.
  await expect(page.locator("#topbar .topbar-lobby-code")).not.toBeEmpty();

  const outlaw = page.locator(".character-card", { hasText: "Outlaw" });
  await expect(outlaw).toHaveClass(/is-invalid/);
  await expect(outlaw.locator(".roster-invalid-tag")).toHaveText("Invalid");
  await expect(outlaw.locator(".play-card-open")).toHaveAttribute("aria-disabled", "true");
  // Kept, but no choice: nothing is chosen, so Random Arena's tiles wait.
  await expect(page.locator(".character-card.is-selected")).toHaveCount(0);
  const queue = page.locator(".random-arena-tile").first();
  await expect(queue).toBeDisabled();

  // Clicking it anyway chooses nothing; the rolled character still can be.
  await outlaw.locator(".play-card-open").click({ force: true });
  await expect(outlaw).not.toHaveClass(/is-selected/);
  await expect(queue).toBeDisabled();
  const rolled = page.locator(".character-card").filter({ hasNotText: "Outlaw" });
  await rolled.locator(".play-card-open").click();
  await expect(rolled).toHaveClass(/is-selected/);
  await expect(queue).toBeEnabled();

  // Edit, on Character Builder, still opens it, to be fixed.
  await openRail(page, "Character Builder");
  await outlaw.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Outlaw");
});

/* --- gear ----------------------------------------------------------------- */

/** Open the gear library in the right-hand column. */
async function openGearLibrary(page: Page): Promise<void> {
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await expect(page.locator(".gear-box").first()).toBeVisible();
}

/**
 * Drag one element onto another with a real HTML5 drag sequence.
 *
 * Playwright's `dragTo` synthesizes mouse movement, which is unreliable
 * when the source sits inside the library's own scroll container and
 * the target is outside it — the page scrolls mid-gesture and the drop
 * lands nowhere. This dispatches the same `dragstart`/`dragover`/`drop`
 * events the browser would, through a real `DataTransfer`, so the
 * application's own handlers are genuinely exercised. The mouse-driven
 * path is covered separately by the weapon-drag test below.
 */
async function dragGear(page: Page, fromSelector: string, toSelector: string): Promise<void> {
  await page.evaluate(
    ([from, to]) => {
      const source = document.querySelector(from);
      const target = document.querySelector(to);
      if (source === null || target === null) {
        throw new Error(`drag needs both ${from} and ${to}`);
      }
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }),
      );
      target.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
      );
    },
    [fromSelector, toSelector] as const,
  );
}

/** A derived stat's value under the arena (#571). */
function stat(page: Page, key: string): Locator {
  return page.locator(`.editor-stat-value[data-stat="${key}"]`);
}

/** Click a library entry by its visible name. */
async function equipFromLibrary(page: Page, name: string): Promise<void> {
  await page.locator(".gear-box").filter({ hasText: name }).first().click();
}

test("gear is equipped from a library, like skills are", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  const weaponSlot = page.locator(".gear-slot").first();
  const armor = stat(page, "armor");

  // A new character is a warrior: sword and shield, 80 + 8 armor.
  await expect(weaponSlot).toContainText("Sword");
  await expect(armor).toHaveText("88");

  await equipFromLibrary(page, "Hammer");
  await expect(weaponSlot).toContainText("Hammer");
  // A hammer needs both hands, so the shield comes off and armor falls
  // back to the warrior's own 80.
  await expect(armor).toHaveText("80");
  await expect(page.locator(".gear-slot").nth(1)).toContainText("both hands full");
});

test("an attack skill for another weapon is flagged on its slot until the weapon fits (#417)", async ({
  page,
}) => {
  // A new character is a warrior with a sword; Swift Chop needs an axe.
  await newCharacter(page);
  const slot = page.locator(".skill-slot").first();
  await page.locator(".skill-box", { hasText: "Swift Chop" }).dragTo(slot);
  await expect(slot).toContainText("Swift Chop");
  const warning = slot.locator(".skill-slot-warning");
  await expect(warning).toHaveText("Needs an axe");
  await expect(warning).toHaveAttribute("title", "Needs an axe — your weapon is a sword");

  await openGearLibrary(page);
  await equipFromLibrary(page, "Axe");
  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await expect(warning).toHaveCount(0);
  await expect(slot).toContainText("Swift Chop");
});

test("a weapon can be dragged from the library onto the weapon slot", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);
  // The set tabs (#489) put the hands below the fold: a mouse drag that has
  // to scroll the editor mid-gesture drops nowhere, so bring them up first.
  await page.locator(".gear-slot").first().scrollIntoViewIfNeeded();

  await page
    .locator(".gear-box")
    .filter({ hasText: "Recurve Bow" })
    .first()
    .dragTo(page.locator(".gear-slot").first());

  await expect(page.locator(".gear-slot").first()).toContainText("Recurve Bow");
});

test("a rune dropped on an armor piece shows what it costs", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  const health = stat(page, "health");
  await expect(health).toHaveText("500");

  const runeBox = page
    .locator(".gear-box")
    .filter({ hasText: "Superior Rune of Swordsmanship" })
    .first();
  await expect(runeBox).toHaveCount(1);
  await runeBox.evaluate((node) => {
    node.id = "drag-source";
  });
  await dragGear(page, "#drag-source", ".armor-row .gear-slot:nth-child(3)");

  const headRune = page.locator(".armor-row").first().locator(".gear-slot").nth(1);
  await expect(headRune).toContainText("Superior Rune of Swordsmanship");
  // +3 Swordsmanship, paid for with 75 health — both halves on screen.
  await expect(health).toHaveText("425");
  await expect(page.locator(".gear-stats")).toContainText("+3");
});

test("the library follows your clicks; an insignia goes to the selected piece (#570)", async ({
  page,
}) => {
  await newCharacter(page);
  const gearTab = page.locator(".library-tab", { hasText: "gear" });
  const skillsTab = page.locator(".library-tab", { hasText: "skills" });

  // A hand clicked opens the gear tab, its group at the top.
  await page.locator(".gear-slot").nth(1).click();
  await expect(gearTab).toHaveClass(/is-active/);
  const library = page.locator(".skill-library");
  const offhands = page.locator('.skill-group[data-group="off-hands"]');
  const top = async (locator: Locator): Promise<number> =>
    (await locator.boundingBox())?.y ?? Number.NaN;
  await expect.poll(async () => (await top(offhands)) - (await top(library))).toBeLessThan(20);

  // A bar slot clicked opens the skills tab.
  await page.locator(".skill-slot").first().click();
  await expect(skillsTab).toHaveClass(/is-active/);
  await page.keyboard.press("Escape");

  // No piece picked: an insignia goes to the first free one, and says so.
  await gearTab.click();
  const survivor = page.locator(".gear-box").filter({ hasText: "Survivor Insignia" }).first();
  await expect(survivor.locator(".gear-box-target")).toHaveText("→ head");
  await survivor.click();
  const insigniaOn = (slot: string): Locator =>
    page.locator(`.armor-row[data-slot="${slot}"] .gear-slot`).first();
  await expect(insigniaOn("head")).toContainText("Survivor");

  // The legs picked: outlined, and the next insignia goes there.
  const legs = page.locator('.armor-row[data-slot="legs"]');
  await legs.locator(".armor-slot-name").click();
  await expect(legs).toHaveClass(/is-selected/);
  await expect(survivor.locator(".gear-box-target")).toHaveText("→ legs");
  await survivor.click();
  await expect(insigniaOn("legs")).toContainText("Survivor");
  await expect(insigniaOn("chest")).toContainText("empty");

  // Switching the tab by hand lets the piece go.
  await skillsTab.click();
  await expect(legs).not.toHaveClass(/is-selected/);
});

test("dragging worn gear back to the library takes it off", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  await equipFromLibrary(page, "Survivor Insignia");
  const headInsignia = page.locator(".armor-row").first().locator(".gear-slot").first();
  await expect(headInsignia).toContainText("Survivor");

  await dragGear(page, ".armor-row .gear-slot", ".skill-library");
  await expect(headInsignia).toContainText("empty");
});

test("the × on a worn piece clears it", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);
  await equipFromLibrary(page, "Survivor Insignia");

  const headInsignia = page.locator(".armor-row").first().locator(".gear-slot").first();
  await headInsignia.getByRole("button", { name: "×" }).click();
  await expect(headInsignia).toContainText("empty");
});

test("an unmet weapon requirement is called out before the match, not during", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  await equipFromLibrary(page, "Hammer");
  // The damage line says what is actually dealt, a third, in red (#571).
  const damage = stat(page, "damage");
  await expect(damage).toHaveText("6–12 · 1.75s needs Hammer Mastery 9");
  await expect(damage).toHaveClass(/is-unmet/);
  const red = await damage.evaluate((node) => getComputedStyle(node).color);
  // Marked, to show the line is updated in place, not rebuilt.
  await damage.evaluate((node) => {
    node.dataset.marked = "yes";
  });

  // Train the attribute the hammer needs and the full damage is back.
  const hammerRow = page.locator(".editor-attribute").filter({ hasText: "Hammer Mastery" });
  await pip(hammerRow, 9).click();
  await expect(damage).toHaveText("19–35 · 1.75s");
  await expect(damage).not.toHaveClass(/is-unmet/);
  await expect(damage).not.toHaveCSS("color", red);
  await expect(damage).toHaveAttribute("data-marked", "yes");
});

test("a chosen weapon and insignia survive a reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Gear Keeper");
  await openGearLibrary(page);
  await equipFromLibrary(page, "Axe");
  await equipFromLibrary(page, "Survivor Insignia");
  // Set 2 (#489): its tab, then a weapon from the library goes into it.
  const setTab = (n: number): Locator =>
    page.getByRole("tab", { name: new RegExp(`^${String(n)}`) });
  await setTab(2).click();
  await expect(page.locator(".gear-slot").first()).toContainText("Add a weapon");
  await equipFromLibrary(page, "Hammer");
  await expect(page.locator(".gear-slot").first()).toContainText("Hammer");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(roster(page)).toContainText("Gear Keeper");

  // The real assertion: gear came back from IndexedDB, not from memory.
  await page.reload();
  await page
    .locator(".character-card")
    .filter({ hasText: "Gear Keeper" })
    .getByRole("button", { name: "edit" })
    .click();

  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await expect(page.locator(".armor-row").first().locator(".gear-slot").first()).toContainText(
    "Survivor",
  );
  await setTab(2).click();
  await expect(page.locator(".gear-slot").first()).toContainText("Hammer");
});

/* --- the editor updates in place (#563, ADR-0030) ------------------------- */

const libraryScroll = (page: Page): Promise<number> =>
  page.locator(".skill-library").evaluate((node) => node.scrollTop);

/** Scroll the library to `top`, and say where it settled. */
async function scrollLibrary(page: Page, top: number): Promise<number> {
  return page.locator(".skill-library").evaluate((node, to) => {
    node.scrollTop = to;
    return node.scrollTop;
  }, top);
}

test("the skill library keeps its scroll through an equip, a rank, a profession and a tab (#563)", async ({
  page,
}) => {
  // Short, so even a two-profession library scrolls.
  await page.setViewportSize({ width: 1500, height: 500 });
  await openElementalist(page);
  // Further down than the Monk groups above Fireball, which the reshuffle
  // below removes, are tall, so the library has room to hold Fireball in
  // place. Measured, so a Monk skill added to them does not break it.
  const removed = await page.locator(".skill-library").evaluate((library) => {
    const fireball = library.querySelector('.skill-box[data-skill-id="elementalist.fireball"]');
    const below = fireball?.getBoundingClientRect().top ?? 0;
    return Array.from(library.querySelectorAll(".skill-group"))
      .filter(
        (group) =>
          group.querySelector('.skill-box[data-skill-id^="monk."]') !== null &&
          group.getBoundingClientRect().top < below,
      )
      .reduce((sum, group) => sum + group.getBoundingClientRect().height, 0);
  });
  const top = await scrollLibrary(page, Math.ceil(removed) + 40);
  expect(top).toBeGreaterThan(0);

  // A box already in view, so the click itself scrolls nothing.
  const inView = await page.locator(".skill-library").evaluate((library) => {
    const frame = library.getBoundingClientRect();
    const boxes = Array.from(library.querySelectorAll<HTMLElement>(".skill-box"));
    const box = boxes.find((node) => {
      const rect = node.getBoundingClientRect();
      return rect.top >= frame.top && rect.bottom <= frame.bottom;
    });
    return box?.dataset.skillId ?? "";
  });
  await page.locator(`.skill-box[data-skill-id="${inView}"]`).locator(".skill-box-equip").click();
  await expect(page.locator(`.skill-box[data-skill-id="${inView}"]`)).toHaveClass(/is-equipped/);
  expect(await libraryScroll(page)).toBe(top);

  await pip(page.locator(".editor-attribute", { hasText: "Fire Magic" }), 1).click();
  await expect(
    page.locator(".editor-attribute", { hasText: "Fire Magic" }).locator(".editor-attribute-rank"),
  ).toHaveText("1");
  expect(await libraryScroll(page)).toBe(top);

  // A new secondary reshuffles the groups around Fireball, which stays: the
  // library holds it where it was on screen rather than jumping to the top.
  const fireball = page.locator('.skill-box[data-skill-id="elementalist.fireball"]');
  const onScreen = async (): Promise<number> => (await fireball.boundingBox())?.y ?? Number.NaN;
  const before = await onScreen();
  await chooseProfession(page, "secondary", "warrior");
  await expect(page.locator(".skill-group", { hasText: "TACTICS" })).toHaveCount(1);
  expect(Math.abs((await onScreen()) - before)).toBeLessThanOrEqual(1);
  const reshuffled = await libraryScroll(page);

  // Each tab keeps its own place. The tabs scroll with the list, so they
  // are pressed in place: a real click would first scroll them into view.
  const tab = (name: string) => page.getByRole("button", { name, exact: true });
  await tab("gear").dispatchEvent("click");
  await expect(page.locator(".gear-box").first()).toBeVisible();
  const gearTop = await scrollLibrary(page, 120);
  await tab("skills").dispatchEvent("click");
  expect(await libraryScroll(page)).toBe(reshuffled);
  await tab("gear").dispatchEvent("click");
  expect(await libraryScroll(page)).toBe(gearTop);
});

test("a clicked attribute row keeps the keyboard: arrows step it, Home zeroes it (#563, #565)", async ({
  page,
}) => {
  await openElementalist(page);
  const fire = page.getByRole("slider", { name: "Fire Magic" });
  const rank = fire.locator(".editor-attribute-rank");
  await pip(fire, 3).click();
  await expect(rank).toHaveText("3");
  // The same row, not a rebuilt one, so it still has the keyboard.
  await expect(fire).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(rank).toHaveText("4");
  await expect(fire).toHaveAttribute("aria-valuenow", "4");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(rank).toHaveText("2");
  await page.keyboard.press("Home");
  await expect(rank).toHaveText("0");
  // Tab goes on from it to the next attribute, not from the top of the page.
  await page.keyboard.press("Tab");
  await expect(fire.locator("xpath=following-sibling::*[1]")).toBeFocused();
});

test("a pip sets its rank, the top pip lowers by one, and the next rank is priced (#565)", async ({
  page,
}) => {
  await newCharacter(page);
  const strength = page.locator(".editor-attribute", { hasText: "Strength" });
  const rank = strength.locator(".editor-attribute-rank");
  await expect(strength.locator(".editor-attribute-next")).toHaveText("next: 1 pts");
  // The starter's headgear is of Strength: +1 on every rank (#1140).
  await pip(strength, 5).click();
  await expect(rank).toHaveText("5 +1");
  await expect(strength.locator(".editor-attribute-next")).toHaveText("next: 6 pts");
  await pip(strength, 5).click();
  await expect(rank).toHaveText("4 +1");
  await pip(strength, 2).click();
  await expect(rank).toHaveText("2 +1");
});

test("hovering a pip previews its cost; one the points cannot pay for is refused (#565)", async ({
  page,
}) => {
  await newCharacter(page);
  const row = (index: number) => page.locator(".editor-attribute").nth(index);
  // 12 and 12 spend 194 of 200: 6 left.
  await pip(row(0), 12).click();
  await pip(row(1), 12).click();
  const points = page.locator(".editor-points-text");

  const third = row(2);
  await pip(third, 3).hover();
  await expect(points).toHaveText(/: costs 6, 0 left$/);
  await expect(third.locator(".attribute-pip.is-preview")).toHaveCount(3);

  await expect(pip(third, 4)).toHaveClass(/is-dim/);
  await pip(third, 4).click();
  await expect(third.locator(".editor-attribute-needs")).toHaveText("needs 4 more points");
  await expect(third.locator(".editor-attribute-rank")).toHaveText("0");

  // Any change clears the refusal.
  await pip(third, 3).click();
  await expect(third.locator(".editor-attribute-needs")).toHaveText("");
  await page.mouse.move(0, 0);
  await expect(points).toHaveText("0 attribute points remaining");
});

test("the library remembers which tab you were on while you build", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);
  // Equipping updates the editor; the tab must not snap back.
  await equipFromLibrary(page, "Axe");
  await expect(page.locator(".library-tab.is-active")).toHaveText("gear");
});

/* --- beside the Training Ground arena (#10) ------------------------------- */

test("the editor still works beside a live arena, which none of it recreates", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openElementalist(page);
  const arena = page.locator(".training canvas");
  await expect(arena).toBeVisible();
  const original = await arena.elementHandle();

  const fireRow = page.locator(".editor-attribute", { hasText: "Fire Magic" });
  await pip(fireRow, 1).click();
  await expect(fireRow.locator(".editor-attribute-rank")).toHaveText("1");

  await page.locator("input.skill-search").fill("fireb");
  await expect(page.locator(".skill-library .skill-box")).toHaveCount(1);

  await page
    .locator(".skill-box", { hasText: "Fireball" })
    .dragTo(page.locator(".skill-slot").nth(2));
  await expect(page.locator(".skill-slot").nth(2)).toContainText("Fireball");

  await page.locator(".skill-box", { hasText: "Fireball" }).hover();
  await expect(page.locator(".skill-tip")).toBeVisible();

  // Every one of those re-rendered the editor. The arena is the same one.
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
});

test("the arena survives the editor collapsing to one column", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await newCharacter(page);
  const arena = page.locator(".training canvas");
  await expect(arena).toBeVisible();
  const original = await arena.elementHandle();

  await page.setViewportSize({ width: 600, height: 900 });
  const training = await page.locator(".training").boundingBox();
  const editor = await page.locator(".editor").boundingBox();
  expect(training?.x).toBe(editor?.x);

  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
  await expect(arena).toBeVisible();
});

/** Slot `slot`'s key, as the editor's bar and its Equip label it (#564). */
const slotLabel = (slot: number): string => codeLabel(skillKey(slot));

/**
 * A Warrior/Elementalist with all eight slots filled, by clicking the first eight
 * non-elite skills: a second elite would replace the first (#459).
 */
async function fullBar(page: Page): Promise<void> {
  await newCharacter(page);
  await chooseProfession(page, "secondary", "elementalist");
  for (let slot = 0; slot < 8; slot++) {
    await page
      .locator(".skill-box:not(.is-equipped):not(.is-elite)")
      .first()
      .locator(".skill-box-equip")
      .click();
  }
  await expect(page.locator(".skill-slot.is-empty")).toHaveCount(0);
}

/** The names of the bar's filled slots, in slot order. */
async function barNames(page: Page): Promise<string[]> {
  return page.locator(".skill-slot .skill-slot-name").allTextContents();
}

test("the bar's slots carry the keymap's keys, and a library skill says where it goes (#564)", async ({
  page,
}) => {
  await newCharacter(page);
  const slots = page.locator(".skill-slot");
  await expect(slots.nth(0).locator(".skill-slot-index")).toHaveText(slotLabel(0));
  await expect(slots.nth(7).locator(".skill-slot-index")).toHaveText(slotLabel(7));

  const first = page.locator(".skill-box").first();
  await expect(first.locator(".skill-box-equip")).toHaveText(`Equip → ${slotLabel(0)}`);
  await first.locator(".skill-box-equip").click();
  // On the bar now: where, and no Equip; a click on the card moves nothing.
  await expect(first.locator(".skill-box-on")).toHaveText(`on ${slotLabel(0)}`);
  await expect(first.locator(".skill-box-equip")).toBeHidden();
  const before = await barNames(page);
  await first.locator(".skill-box-card").click();
  expect(await barNames(page)).toEqual(before);
  await expect(page.locator(".skill-box").nth(1).locator(".skill-box-equip")).toHaveText(
    `Equip → ${slotLabel(1)}`,
  );
});

test("a full bar with no slot picked equips nothing; a picked slot is replaced (#564)", async ({
  page,
}) => {
  await fullBar(page);
  const before = await barNames(page);
  const spare = page.locator(".skill-box:not(.is-equipped)").first();
  const spareName = (await spare.locator(".skill-box-name").textContent()) ?? "";
  await expect(spare.locator(".skill-box-equip")).toHaveText("pick a slot");
  await expect(spare.locator(".skill-box-equip")).toBeDisabled();
  // Slot 1 used to be overwritten silently; now nothing happens.
  await spare.click();
  expect(await barNames(page)).toEqual(before);

  const third = page.locator(".skill-slot").nth(2);
  await third.click();
  await expect(third).toHaveClass(/is-selected/);
  await expect(spare.locator(".skill-box-equip")).toHaveText(`Equip → ${slotLabel(2)} (replace)`);
  await spare.locator(".skill-box-equip").click();
  await expect(third.locator(".skill-slot-name")).toHaveText(spareName);
  expect((await barNames(page)).filter((_, slot) => slot !== 2)).toEqual(
    before.filter((_, slot) => slot !== 2),
  );
  // The pick is spent.
  await expect(page.locator(".skill-slot.is-selected")).toHaveCount(0);
});

test("a picked slot is let go by a second click or Esc (#564)", async ({ page }) => {
  await newCharacter(page);
  const slot = page.locator(".skill-slot").nth(4);
  await slot.click();
  await expect(slot).toHaveClass(/is-selected/);
  await expect(page.locator(".skill-box").first().locator(".skill-box-equip")).toHaveText(
    `Equip → ${slotLabel(4)}`,
  );
  await slot.click();
  await expect(slot).not.toHaveClass(/is-selected/);

  await slot.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".skill-slot.is-selected")).toHaveCount(0);
  // That Esc only let go: the editor is still open, and asks nothing.
  await expect(page.locator("input.editor-name")).toBeVisible();
  await expect(page.locator(".inline-confirm")).toHaveCount(0);
  await expect(page.locator(".skill-box").first().locator(".skill-box-equip")).toHaveText(
    `Equip → ${slotLabel(0)}`,
  );

  // Another profession is another bar: the pick goes with it.
  await slot.click();
  await chooseProfession(page, "primary", "elementalist");
  await expect(page.locator(".skill-slot.is-selected")).toHaveCount(0);
});

test("a skill key over a library skill equips it to that key's slot, but not while typing (#564)", async ({
  page,
}) => {
  await newCharacter(page);
  const box = page.locator(".skill-box").nth(1);
  const name = (await box.locator(".skill-box-name").textContent()) ?? "";
  await box.hover();
  await page.keyboard.press(skillKey(5));
  await expect(page.locator(".skill-slot").nth(5).locator(".skill-slot-name")).toHaveText(name);

  // Focused from the keyboard, with the pointer elsewhere, likewise.
  const other = page.locator(".skill-box:not(.is-equipped)").first();
  const otherName = (await other.locator(".skill-box-name").textContent()) ?? "";
  await page.mouse.move(0, 0);
  await other.locator(".skill-box-card").focus();
  await page.keyboard.press(skillKey(3));
  await expect(page.locator(".skill-slot").nth(3).locator(".skill-slot-name")).toHaveText(
    otherName,
  );

  // Typed into the search, the same key is a letter.
  const search = page.locator(".skill-search");
  await search.focus();
  await box.hover();
  await page.keyboard.press(skillKey(6));
  await expect(page.locator(".skill-slot").nth(6)).toHaveClass(/is-empty/);

  // While Esc asks about the unsaved edits, the key equips nothing.
  await search.fill("");
  await search.blur();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await box.hover();
  await page.keyboard.press(skillKey(6));
  await expect(page.locator(".skill-slot").nth(6)).toHaveClass(/is-empty/);
  await expect(page.getByText("Discard changes?")).toBeVisible();
});

test("a library card opens its details inline with Enter, one at a time, its rank marked (#567)", async ({
  page,
}) => {
  await openElementalist(page);
  await pip(page.locator(".editor-attribute", { hasText: "Fire Magic" }), 3).click();
  const fireball = page.locator('.skill-box[data-skill-id="elementalist.fireball"]');
  // The number that matters at this rank, on the card itself.
  await expect(fireball.locator(".skill-box-headline")).toHaveText(/^\d+ fire damage$/);

  const card = fireball.locator(".skill-box-card");
  await card.focus();
  await page.keyboard.press("Enter");
  await expect(card).toHaveAttribute("aria-expanded", "true");
  const details = fireball.locator(".skill-box-details");
  await expect(details).toBeVisible();
  await expect(details.locator(".tip-effect").first()).toContainText("damage");
  await expect(details.locator(".skill-scale-step")).toHaveCount(13);
  await expect(details.locator(".skill-scale-step.is-current")).toHaveText("3");
  // Opening the details equips nothing.
  await expect(fireball).not.toHaveClass(/is-equipped/);

  // Another card closes the first.
  const other = page.locator('.skill-box[data-skill-id="monk.orison-of-healing"]');
  await other.locator(".skill-box-card").click();
  await expect(other.locator(".skill-box-details")).toBeVisible();
  await expect(details).toBeHidden();
  await expect(page.locator(".skill-box.is-open")).toHaveCount(1);

  // A filter that takes the open card away closes it.
  await page.locator(".skill-search").fill("fireball");
  await expect(page.locator(".skill-box.is-open")).toHaveCount(0);
  await page.locator(".skill-search").fill("");
  await expect(page.locator(".skill-box.is-open")).toHaveCount(0);
});

test("Tab reaches the bar's slots and the library's cards (#567)", async ({ page }) => {
  await openElementalist(page);
  const slot = page.locator(".skill-slot").first();
  await slot.focus();
  await page.keyboard.press("Enter");
  await expect(slot).toHaveClass(/is-selected/);
  await page.keyboard.press("Tab");
  await expect(page.locator(".skill-slot").nth(1)).toBeFocused();

  const firstCard = page.locator(".skill-box-card").first();
  await page.locator(".skill-search").focus();
  // Past the elite toggle and the type chips, on to the first card. Each new
  // skill type adds a chip, so the cap follows their count.
  const presses = (await page.locator(".skill-type-chip").count()) + 10;
  for (let press = 0; press < presses; press++) {
    if (await firstCard.evaluate((node) => node === document.activeElement)) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(firstCard).toBeFocused();
});

test("type chips filter the library, several at once, and search reads the text (#567)", async ({
  page,
}) => {
  await openElementalist(page);
  const names = page.locator(".skill-library .skill-box-name");
  const all = await names.count();
  const hex = page.locator(".skill-type-chip", { hasText: /^hex$/ });
  const enchantment = page.locator(".skill-type-chip", { hasText: /^enchantment$/ });
  await enchantment.click();
  await expect(enchantment).toHaveAttribute("aria-pressed", "true");
  const enchantments = await names.count();
  expect(enchantments).toBeGreaterThan(0);
  expect(enchantments).toBeLessThan(all);
  await expect(names).toContainText(["Armor of Earth"]);

  await hex.click();
  expect(await names.count()).toBeGreaterThanOrEqual(enchantments);
  await enchantment.click();
  await hex.click();
  expect(await names.count()).toBe(all);

  // "heals" is in Orison of Healing's text, not its name.
  await page.locator(".skill-search").fill("heals");
  await expect(names).toContainText(["Orison of Healing"]);
  await page.locator(".skill-search").fill("zzzz");
  await expect(names).toHaveCount(0);
});

test("the profession grid says what each keeps, and a cell picks it (#568)", async ({ page }) => {
  await openElementalist(page);
  // Fireball (elementalist) and Orison of Healing (monk) on the bar.
  for (const name of ["Fireball", "Orison of Healing"]) {
    await page.locator(".skill-box", { hasText: name }).locator(".skill-box-equip").click();
  }
  await professionField(page, "secondary").click();
  const grid = page.locator(".profession-grid:not([hidden])");
  await expect(grid).toBeVisible();
  // The primary is not offered as a secondary; the current one is marked.
  await expect(grid.locator('[data-profession="elementalist"]')).toHaveCount(0);
  await expect(grid.locator('[data-profession="monk"]')).toHaveAttribute("aria-current", "true");
  await expect(grid.locator('[data-profession="monk"]')).toContainText("keeps 2 of 2 skills");
  await expect(grid.locator('[data-profession="ranger"]')).toContainText("keeps 1 of 2 skills");
  await expect(grid.locator('[data-profession="none"]')).toContainText("keeps 1 of 2 skills");
  // Esc closes it and changes nothing.
  await page.keyboard.press("Escape");
  await expect(grid).toBeHidden();
  await expect(professionField(page, "secondary")).toHaveAttribute("data-value", "monk");

  await chooseProfession(page, "secondary", "ranger");
  await expect(professionField(page, "secondary")).toHaveAttribute("data-value", "ranger");
  await expect(page.locator(".skill-slot", { hasText: "Orison of Healing" })).toHaveCount(0);
});

test("a profession change toasts what it removed, and Undo puts it back (#569)", async ({
  page,
}) => {
  await openElementalist(page);
  await page
    .locator(".skill-box", { hasText: "Orison of Healing" })
    .locator(".skill-box-equip")
    .click();
  const orison = page.locator(".skill-slot", { hasText: "Orison of Healing" });
  await expect(orison).toHaveCount(1);

  await chooseProfession(page, "secondary", "ranger");
  const toast = page.locator(".toast");
  await expect(toast.locator(".toast-text")).toHaveText("Removed: Orison of Healing from the bar");
  await expect(orison).toHaveCount(0);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toBeHidden();
  await expect(professionField(page, "secondary")).toHaveAttribute("data-value", "monk");
  await expect(orison).toHaveCount(1);

  // Any other edit takes the Undo away.
  await chooseProfession(page, "secondary", "ranger");
  await expect(toast).toBeVisible();
  await page.locator(".skill-box", { hasText: "Fireball" }).locator(".skill-box-equip").click();
  await expect(toast).toBeHidden();
});

test("other professions' skills are listed, locked, with what they need (#568)", async ({
  page,
}) => {
  await openElementalist(page);
  const locked = page.locator(".skill-locked");
  await expect(locked.locator("summary")).toHaveText(/^Other professions \(\d+\)$/);
  // Collapsed until asked for.
  await expect(locked.locator(".skill-locked-box").first()).toBeHidden();
  await locked.locator("summary").click();
  const barrage = locked.locator(".skill-locked-box", { hasText: "Barrage" });
  await expect(barrage).toContainText("needs Ranger");
  await expect(barrage.locator(".skill-box-equip")).toHaveCount(0);
  // Its details open as any card's do.
  await barrage.locator(".skill-box-card").click();
  await expect(barrage.locator(".skill-box-details")).toBeVisible();
  // The search narrows it too.
  await page.locator("input.skill-search").fill("barrage");
  await expect(locked.locator(".skill-locked-box")).toHaveCount(1);
  await expect(locked.locator("summary")).toHaveText("Other professions (1)");
});

test("the library lists GW1 skills not in the game yet only when asked, greyed and unslottable (#1220)", async ({
  page,
}) => {
  await openElementalist(page);
  const toggle = page.getByLabel("Show skills not in the game yet");
  // Off by default: the library is as it was.
  await expect(toggle).not.toBeChecked();
  await expect(page.locator(".skill-corpus-box")).toHaveCount(0);

  await toggle.check();
  const fire = page.locator(".skill-group", { hasText: "FIRE MAGIC" });
  // Searing Heat is GW1 Fire Magic VibeWars does not have yet.
  const mark = fire.locator(".skill-corpus-box", { hasText: "Searing Heat" });
  await expect(mark).toContainText("not in the game yet");
  // After the group's playable skills.
  await expect(fire.locator(".skill-box, .skill-corpus-box").last()).toHaveClass(
    /skill-corpus-box/,
  );
  // It neither drags nor equips.
  expect(await mark.getAttribute("draggable")).toBeNull();
  await expect(mark.locator("button")).toHaveCount(0);
  await mark.click();
  await expect(page.locator(".skill-slot", { hasText: "Searing Heat" })).toHaveCount(0);
  // Its hover shows GW1's own text.
  await mark.hover();
  await expect(page.locator(".skill-tip")).toContainText("Not in the game yet");

  // The search finds it; remembered across a reload.
  // Searing Flames is in the game, so it is found too, playable.
  await page.locator("input.skill-search").fill("searing");
  await expect(page.locator(".skill-corpus-box", { hasText: "Searing Heat" })).toHaveCount(1);
  await expect(page.locator(".skill-box", { hasText: "Searing Flames" })).toHaveCount(1);
  await expect(page.locator(".skill-box, .skill-corpus-box")).toHaveCount(2);
  await page.reload();
  await page.getByRole("button", { name: "New character", exact: true }).click();
  await expect(page.getByLabel("Show skills not in the game yet")).toBeChecked();
});
