import { expect, test, type Locator, type Page } from "@playwright/test";

import { codeLabel } from "../apps/web/src/input/keymap.js";
import { STORAGE_NAMESPACE } from "./helpers/base.js";
import { chooseProfession, professionField } from "./helpers/professions.js";
import { startSoloMatch } from "./helpers/peers.js";
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

/** The roster lives on the entry screen, so the editor is one click away. */
async function newCharacter(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
}

/** An attribute row's pip for `rank` (#565): clicking it sets that rank. */
function pip(row: Locator, rank: number): Locator {
  return row.locator(`.attribute-pip[data-pip="${String(rank)}"]`);
}

test("Close leaves at once without edits, and asks before it discards them (#566)", async ({
  page,
}) => {
  await newCharacter(page);
  await expect(page.locator(".editor-unsaved")).toBeHidden();
  await page.getByRole("button", { name: "close" }).click();
  await expect(page.locator(".roster")).toBeVisible();

  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Draft");
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await page.getByRole("button", { name: "close" }).click();
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Draft");

  // Esc is Close, and asks the same.
  await page.getByRole("button", { name: "close" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "discard" }).click();
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator(".roster-row", { hasText: "Draft" })).toHaveCount(0);
});

test("Delete in the ⋯ menu always asks, and cancel keeps the character (#566)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Doomed");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await page
    .locator(".roster-row", { hasText: "Doomed" })
    .getByRole("button", { name: "edit" })
    .click();

  const more = page.getByRole("button", { name: "more actions" });
  await more.click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.getByText("Delete Doomed?")).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await expect(page.locator("input.editor-name")).toHaveValue("Doomed");

  await more.click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator(".roster-row", { hasText: "Doomed" })).toHaveCount(0);
});

test("the problems chip says what is wrong in a sentence and shows where (#566)", async ({
  page,
}) => {
  await newCharacter(page);
  const name = page.locator("input.editor-name");
  await name.fill("");
  const chip = page.locator(".problems-chip-toggle");
  await expect(chip).toHaveText("1 problem");
  const save = page.getByRole("button", { name: "save", exact: true });
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
  const save = page.getByRole("button", { name: "save", exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.locator(".roster")).toContainText("Test Warrior");
});

test("a saved character survives a page reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Persistent");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Persistent");

  // The real assertion: it came back from IndexedDB, not from memory.
  await page.reload();
  await expect(page.locator(".roster")).toContainText("Persistent");
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
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Slow Disk");

  await page.goto("./");
  await expect(page.locator(".roster")).toContainText("Slow Disk");
});

test("spending attribute points updates the remaining budget", async ({ page }) => {
  await newCharacter(page);

  const budget = page.locator(".editor-points-text");
  const before = (await budget.textContent()) ?? "";

  await pip(page.locator(".editor-attribute").first(), 1).click();
  await page.mouse.move(0, 0);

  await expect(budget).not.toHaveText(before);
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

/** Save characters named `names` from the main menu, one after another. */
async function saveCharacters(page: Page, names: readonly string[]): Promise<void> {
  for (const name of names) {
    await newCharacter(page);
    await page.locator("input.editor-name").fill(name);
    await page.getByRole("button", { name: "save", exact: true }).click();
    // The roster re-renders only once the save has committed. Without
    // this wait, the next newCharacter's page.goto unloads the page
    // mid-write and the character is lost.
    await expect(page.locator(".roster")).toContainText(name);
  }
}

/** The team editor's member rows, and their names. */
const memberRows = (page: Page) => page.locator(".team-grid .team-row");
const memberNames = (page: Page) => page.locator(".team-grid .team-row-name");

test("a new team is stored only on Save, which stays on the editor (#573)", async ({ page }) => {
  await saveCharacters(page, ["Alpha"]);
  await page.getByRole("button", { name: "teams" }).click();
  await page.getByRole("button", { name: "new team" }).click();

  // Nothing stored yet: Back leaves at once and the list is still empty.
  const save = page.getByRole("button", { name: "save", exact: true });
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("title", "A team needs at least one member.");
  // Nothing stored to copy or delete, so neither can store a half-made team.
  await expect(page.getByRole("button", { name: "duplicate" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "delete" })).toBeDisabled();
  await page.getByRole("button", { name: "back" }).click();
  await expect(page.getByText("No teams yet.")).toBeVisible();

  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("");
  await page.getByRole("button", { name: "add Alpha" }).click();
  await expect(save).toHaveAttribute("title", "Give the team a name.");
  await page.getByLabel("team name").fill("Duo");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.locator(".toast")).toHaveText("Saved");
  await expect(page.getByLabel("team name")).toBeVisible();
  await expect(page.locator(".editor-unsaved")).toBeHidden();
  await expect(page.getByRole("button", { name: "duplicate" })).toBeEnabled();

  await page.reload();
  await page.getByRole("button", { name: "teams" }).click();
  await expect(page.locator(".entity-name")).toHaveText(["Duo (1 members)"]);
});

test("team edits stay on screen until Save; Back and Delete ask first (#573)", async ({ page }) => {
  await saveCharacters(page, ["Alpha", "Bravo"]);
  await page.getByRole("button", { name: "teams" }).click();
  await page.getByRole("button", { name: "new team" }).click();
  await page.getByLabel("team name").fill("GvG Practice");

  // Add both; an added character leaves the picker.
  const picks = page.locator(".team-picker .team-pick-name");
  await expect(picks).toHaveText(["Bravo", "Alpha"]);
  await page.getByRole("button", { name: "add Alpha" }).click();
  await expect(picks).toHaveText(["Bravo"]);
  await page.getByRole("button", { name: "add Bravo" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha", "Bravo"]);
  await expect(page.locator(".team-picker-empty")).toBeVisible();

  // Reorder, still on the editor.
  const up = memberRows(page).nth(1).getByRole("button", { name: "move up" });
  await up.click();
  await expect(memberNames(page)).toHaveText(["Bravo", "Alpha"]);
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".toast")).toHaveText("Saved");

  // Remove a member: unsaved, and Back asks.
  await memberRows(page).first().getByRole("button", { name: "remove" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha"]);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  const duplicate = page.getByRole("button", { name: "duplicate" });
  await expect(duplicate).toBeDisabled();
  await expect(duplicate).toHaveAttribute("title", "Save first to duplicate");
  await page.getByRole("button", { name: "back" }).click();
  await expect(page.getByText("Discard changes?")).toBeVisible();
  await page.getByRole("button", { name: "keep editing" }).click();
  await expect(memberNames(page)).toHaveText(["Alpha"]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "discard" }).click();
  await expect(page.locator(".entity-name")).toHaveText(["GvG Practice (2 members)"]);

  // Duplicate.
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await page.getByRole("button", { name: "duplicate" }).click();
  await expect(page.locator(".entity-name")).toHaveText([/2 members/, /2 members/]);

  // Delete asks; cancel keeps the team.
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await page.getByRole("button", { name: "delete" }).click();
  await expect(page.getByText(/^Delete .*\?$/)).toBeVisible();
  await page.getByRole("button", { name: "cancel" }).click();
  await page.getByRole("button", { name: "delete" }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(page.locator(".entity-name")).toHaveText([/2 members/]);
});

test("the team grid: eight cells a member, drag or ↑ ↓ to reorder, places left (#574)", async ({
  page,
}) => {
  await saveCharacters(page, ["Alpha", "Bravo", "Charlie"]);
  await page.getByRole("button", { name: "teams" }).click();
  await page.getByRole("button", { name: "new team" }).click();

  const header = page.locator(".team-picker-header");
  await expect(header).toHaveText("16 places left");
  await expect(page.locator(".team-pick-sub").first()).toHaveText(/^Warrior.* · \d\/8 skills$/);
  for (const name of ["Alpha", "Bravo", "Charlie"]) {
    await page.getByRole("button", { name: `add ${name}` }).click();
  }
  await expect(header).toHaveText("13 places left");
  await expect(page.locator(".team-pick")).toHaveCount(0);

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
    await page.getByRole("button", { name: "save", exact: true }).click();
    await expect(page.locator(".roster")).toContainText(name);
  }
  await page.getByRole("button", { name: "teams" }).click();
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
  await page.getByRole("button", { name: "teams" }).click();
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
  await page.getByRole("button", { name: "save", exact: true }).click();

  // The team as it was left, still unsaved, with Alpha's new bar.
  await expect(page.getByLabel("team name")).toHaveValue("Trip");
  await expect(memberNames(page)).toHaveText(["Bravo", "Alpha"]);
  await expect(page.locator(".editor-unsaved")).toBeVisible();
  await expect(alphaCells).toHaveCount(before + 1);

  // Deleted from the build editor: the row is a missing character.
  await page.getByRole("button", { name: "Bravo", exact: true }).click();
  await page.getByRole("button", { name: "more actions" }).click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await page.locator(".inline-confirm").getByRole("button", { name: "delete" }).click();
  await expect(memberNames(page)).toHaveText(["(missing character)", "Alpha"]);
  await expect(page.getByLabel("team name")).toHaveValue("Trip");
});

test("a build exports to text and imports back", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Shared Build");

  await page.getByRole("button", { name: "export" }).click();
  const exported = await page.locator("textarea.editor-transfer").inputValue();
  expect(exported).toContain("vibewars.character");
  expect(exported).toContain("Shared Build");

  // Reopen a *different* character, then import the text into it. This is
  // the real flow: someone pastes a build they were sent.
  // Named but never saved: Close asks first (#566).
  await page.getByRole("button", { name: "close" }).click();
  await page.getByRole("button", { name: "discard" }).click();
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Scratch");

  // A clipped paste first, then the whole text: once the import works,
  // the earlier error must not still say it failed.
  await page.locator("textarea.editor-transfer").fill(exported.slice(0, 40));
  await page.getByRole("button", { name: "import", exact: true }).click();
  await expect(page.locator(".editor-share-status")).toContainText("Could not import");

  await page.locator("textarea.editor-transfer").fill(exported);
  await page.getByRole("button", { name: "import", exact: true }).click();

  await expect(page.locator("input.editor-name")).toHaveValue("Shared Build");
  await expect(page.locator(".editor-share-status .editor-problem")).toHaveCount(0);
  await expect(page.locator(".editor-share-status")).toBeEmpty();
});

test("a mangled build is refused with a readable reason", async ({ page }) => {
  await newCharacter(page);

  await page.locator("textarea.editor-transfer").fill('{"format":"vibewars.character"');
  await page.getByRole("button", { name: "import", exact: true }).click();

  // The failure a player will actually hit: a chat client clipped the
  // message. It must say so, not throw and leave a blank screen.
  await expect(page.locator(".editor-share-status")).toContainText("Could not import");
  await expect(page.locator("input.editor-name")).toBeVisible();
});

test("a build from another game is refused", async ({ page }) => {
  await newCharacter(page);

  await page.locator("textarea.editor-transfer").fill('{"hero":"someone else\'s format"}');
  await page.getByRole("button", { name: "import", exact: true }).click();

  await expect(page.locator(".editor-share-status")).toContainText("does not look like");
});

test("a saved character can be chosen and is taken into a match", async ({ page }) => {
  // The whole point of the build editor: what you build is what you play.
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Pyro");

  await chooseProfession(page, "primary", "elementalist");
  await pip(page.locator(".editor-attribute").first(), 1).click();
  await page.locator(".skill-box").first().locator(".skill-box-equip").click();
  await page.getByRole("button", { name: "save", exact: true }).click();

  // Saving returns to the entry screen, where the roster is. Clicking the
  // row is how a player chooses who to play.
  const row = page.locator(".roster-row", { hasText: "Pyro" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(row).toHaveClass(/is-active/);

  await startSoloMatch(page);
  await expect(page.locator("#viewport canvas")).toBeVisible();

  // The server grants the build's bar, so the HUD shows exactly the one
  // skill that was equipped, not the house loadout, and seven empty slots.
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
  await page.getByRole("button", { name: "save", exact: true }).click();
  await page.locator(".roster-row", { hasText: "Gap" }).click();
  await startSoloMatch(page);
  const energy = page.locator(".hud-bar-energy .hud-bar-label");
  await expect(energy).toContainText("en");

  // Every slot in its place: W is empty, but still labelled W.
  const slots = page.locator(".hud-skills .hud-skill");
  await expect(slots).toHaveCount(8);
  await expect(slots.nth(1)).toHaveClass(/is-empty/);
  await expect(slots.nth(1)).toHaveText(codeLabel(skillKey(1)));
  await expect(slots.nth(2)).toContainText("Armor of Earth");

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

  await page.getByRole("button", { name: "save", exact: true }).click();
  await page.locator(".roster-row", { hasText: "Elite" }).click();
  await startSoloMatch(page);
  const hud = page.locator(".hud-skills .hud-skill");
  await expect(hud.nth(3)).toContainText("Broad Head Arrow");
  await expect(hud.nth(3)).toHaveClass(/is-elite/);
  await expect(page.locator(".hud-skills .hud-skill.is-elite")).toHaveCount(1);
});

test("in a match, Glyph of Lesser Energy shows Armor of Earth's discounted cost, then the full one (#637)", async ({
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
  await page.getByRole("button", { name: "save", exact: true }).click();
  await page.locator(".roster-row", { hasText: "Glyph" }).click();
  await startSoloMatch(page);
  const armor = page.locator(".hud-skills .hud-skill").nth(1).locator(".hud-skill-cost");
  await expect(armor).toHaveText("10e");

  // The glyph takes 16 off the next two spells: Armor of Earth is free.
  await page.keyboard.press(skillKey(0));
  await expect(armor).toHaveText("0e");
  await page.keyboard.press(skillKey(1));
  await expect(
    page.locator(".hud-skills .hud-skill").nth(1).locator(".recharge-overlay"),
  ).toHaveCount(1);
  // One spell left on it: the cost holds until the glyph's 15 s run out, in
  // game time, which runs slower than wall time under load (#327).
  await expect(armor).toHaveText("0e");
  await expect(armor).toHaveText("10e", { timeout: 45_000 });
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

  await page.locator("input.skill-search").fill("fire");
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toContainText("Fireball");

  await page.locator("input.skill-search").fill("zzzz");
  await expect(boxes).toHaveCount(0);
  await expect(page.locator(".skill-library-empty")).toBeVisible();

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

  const atZero = /Deals (\d+) damage/.exec(await tip.innerText())?.[1];
  expect(atZero).toBeDefined();

  // Spend points, and the same tooltip must report a bigger number —
  // the description is generated from the effects at the character's
  // actual ranks, not a static string.
  const fireRow = page.locator(".editor-attribute", { hasText: "Fire Magic" });
  await pip(fireRow, 8).click();
  await page.locator(".skill-box", { hasText: "Fireball" }).hover();
  await expect(tip).toBeVisible();
  const atRank = /Deals (\d+) damage/.exec(await tip.innerText())?.[1];

  expect(Number(atRank)).toBeGreaterThan(Number(atZero));
});

test("the primary attribute's row says what it does at its rank (#531)", async ({ page }) => {
  await newCharacter(page);
  await chooseProfession(page, "primary", "mesmer");

  const fastCasting = page.locator(".editor-attribute", { hasText: "Fast Casting" });
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveCount(0);
  await pip(fastCasting, 11).click();
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveText(
    "spells cast 40% faster",
  );
  await pip(fastCasting, 12).click();
  await expect(fastCasting.locator(".editor-attribute-effect")).toHaveText(
    "spells cast 43% faster",
  );
});

test("a skill can be dragged from the library onto a bar slot", async ({ page }) => {
  await openElementalist(page);

  const slot3 = page.locator(".skill-slot").nth(2);
  await expect(slot3).toContainText("empty");

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

  await expect(page.locator(".skill-slot").nth(0)).toContainText("empty");
});

test("the in-match skill bar is not draggable", async ({ page }) => {
  // Builds are fixed once a match starts; the HUD must not offer an
  // interaction the server would refuse.
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator("#viewport canvas")).toBeVisible();

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
  skillBar: ["warrior.sever-artery-lite", null, null, null, null, null, null, null],
  updatedAt: 1_700_000_000_000,
};

/**
 * Run IndexedDB code in the page and wait for it to finish.
 *
 * Passed as source text rather than a function: this runs in the page,
 * where `indexedDB` lives, and the e2e tsconfig deliberately has no DOM
 * lib — typing it here would mean either a lie or a pile of casts. Once
 * per call, not an init script, so a reload does not quietly re-seed it.
 */
async function inCharacterStore(page: Page, body: string): Promise<unknown> {
  return page.evaluate(`
    new Promise((resolve, reject) => {
      const open = indexedDB.open(${JSON.stringify(STORAGE_NAMESPACE)}, 1);
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
  await expect(page.locator(".roster")).toBeVisible();
  const record = JSON.stringify(STALE_CHARACTER);
  await inCharacterStore(
    page,
    `(store) => store.put(${record}, ${JSON.stringify(STALE_CHARACTER.id)})`,
  );

  await page.reload();
  const roster = page.locator(".roster");
  await expect(roster).toBeVisible();
  await expect(roster.locator(".screen-problem")).toHaveText(
    "A saved character from an older build of the game could not be read and was discarded.",
  );
  await expect(roster).not.toContainText("Veteran");

  // Deleted, not hidden: the record is gone from the real store, and the
  // notice does not come back on the next visit.
  expect(
    await inCharacterStore(page, `(store) => store.get(${JSON.stringify(STALE_CHARACTER.id)})`),
  ).toBeNull();
  await page.reload();
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator(".roster .screen-problem")).toHaveCount(0);
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

/** Click a library entry by its visible name. */
async function equipFromLibrary(page: Page, name: string): Promise<void> {
  await page.locator(".gear-box").filter({ hasText: name }).first().click();
}

test("gear is equipped from a library, like skills are", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  const weaponSlot = page.locator(".gear-slot").first();
  const stats = page.locator(".gear-stats");

  // A new character is a warrior: sword and shield, 80 + 8 armor.
  await expect(weaponSlot).toContainText("Sword");
  await expect(stats).toContainText("88");

  await equipFromLibrary(page, "Hammer");
  await expect(weaponSlot).toContainText("Hammer");
  // A hammer needs both hands, so the shield comes off and armor falls
  // back to the warrior's own 80.
  await expect(stats).toContainText("80");
  await expect(page.locator(".gear-slot").nth(1)).toContainText("both hands full");
});

test("a weapon can be dragged from the library onto the weapon slot", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

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

  const stats = page.locator(".gear-stats");
  await expect(stats).toContainText("500");

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
  await expect(stats).toContainText("425");
  await expect(stats).toContainText("+3");
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
  await expect(page.locator(".gear-warning")).toBeVisible();

  // Train the attribute the hammer needs and the warning goes away.
  const hammerRow = page.locator(".editor-attribute").filter({ hasText: "Hammer Mastery" });
  await pip(hammerRow, 9).click();
  await expect(page.locator(".gear-warning")).toHaveCount(0);
});

test("a chosen weapon and insignia survive a reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Gear Keeper");
  await openGearLibrary(page);
  await equipFromLibrary(page, "Axe");
  await equipFromLibrary(page, "Survivor Insignia");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Gear Keeper");

  // The real assertion: gear came back from IndexedDB, not from memory.
  await page.reload();
  await page
    .locator(".roster-row")
    .filter({ hasText: "Gear Keeper" })
    .getByRole("button", { name: "edit" })
    .click();

  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await expect(page.locator(".armor-row").first().locator(".gear-slot").first()).toContainText(
    "Survivor",
  );
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
  // Further down than the group the reshuffle below removes is tall, so
  // the library has room to hold Fireball in place.
  const top = await scrollLibrary(page, 200);
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
  await pip(strength, 5).click();
  await expect(rank).toHaveText("5");
  await expect(strength.locator(".editor-attribute-next")).toHaveText("next: 6 pts");
  await pip(strength, 5).click();
  await expect(rank).toHaveText("4");
  await pip(strength, 2).click();
  await expect(rank).toHaveText("2");
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

  await page.locator("input.skill-search").fill("fire");
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

/** A Warrior/Elementalist with all eight slots filled, by clicking the first eight skills. */
async function fullBar(page: Page): Promise<void> {
  await newCharacter(page);
  await chooseProfession(page, "secondary", "elementalist");
  for (let slot = 0; slot < 8; slot++) {
    await page.locator(".skill-box:not(.is-equipped)").first().locator(".skill-box-equip").click();
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

  // While Close asks about the unsaved edits, the key equips nothing.
  await search.fill("");
  await page.getByRole("button", { name: "close" }).click();
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
  await expect(fireball.locator(".skill-box-headline")).toHaveText(/^\d+ damage$/);

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
  // Past the elite toggle and the type chips, on to the first card.
  for (let press = 0; press < 20; press++) {
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
  await expect(page.locator(".skill-library-empty")).toBeVisible();
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
