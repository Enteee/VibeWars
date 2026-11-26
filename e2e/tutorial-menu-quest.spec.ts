import { expect, test, type Locator, type Page } from "@playwright/test";

import { openLibraryGroup } from "./helpers/library.js";
import { openRail } from "./helpers/menu.js";
import { PIXEL_8A_PORTRAIT } from "./helpers/phone.js";
import { professionField } from "./helpers/professions.js";
import { FLAT_MAP, duoCode, pastTheSplash } from "./helpers/tutorial.js";

test.describe("the menu quest (#3540)", () => {
  test("dims the menu but the beat's target, and walks the main menu", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    await expect(panel).toContainText("To go on, you must change your spec.");
    const rail = page.locator('[data-tutorial="rail"]');
    await expect(rail).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-hole")).toBeVisible();

    const bubble = page.locator(".coach-bubble");
    await bubble.getByRole("button", { name: "Got it" }).click();
    const characters = page.locator('[data-tutorial="rail-characters"]');
    await expect(characters).toHaveClass(/tutorial-pulse/);
    await expect(rail).not.toHaveClass(/tutorial-pulse/);

    // Teams is dimmed: a click on it never reaches the menu.
    const teams = page.locator('[data-tutorial="rail-teams"]');
    await expect(teams).toHaveAttribute("aria-pressed", "false");
    await teams.click({ force: true });
    await expect(page.locator(".screen-teams")).toHaveCount(0);

    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(teams).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    // On to the spec step (#3541): a thing to do, with no Got it.
    await expect(panel).toContainText("Change your spec.");
    await expect(teams).not.toHaveClass(/tutorial-pulse/);
    await expect(characters).toHaveClass(/tutorial-pulse/);
    await expect(bubble.getByRole("button", { name: "Got it" })).toBeHidden();
  });

  test("at 800x600 the docked panel never covers the bubble or the cut-out", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    for (const target of ["rail", "rail-characters", "rail-teams"]) {
      await expect(page.locator(`[data-tutorial="${target}"]`)).toHaveClass(/tutorial-pulse/);
      const panelBox = await panel.boundingBox();
      // The whole rail is as tall as the window: no edge clears it, so
      // that beat keeps only its bubble clear.
      const clear = target === "rail" ? [bubble] : [bubble, page.locator(".coach-hole")];
      for (const other of clear) {
        const box = await other.boundingBox();
        const apart =
          panelBox === null ||
          box === null ||
          panelBox.y >= box.y + box.height ||
          box.y >= panelBox.y + panelBox.height;
        expect(
          apart,
          `the panel clears ${target}'s ${String(await other.getAttribute("class"))}`,
        ).toBe(true);
      }
      // A real click, not forced: nothing may sit on top of Got it.
      await bubble.getByRole("button", { name: "Got it" }).click();
    }
    await expect(panel).toContainText("Change your spec.");
  });

  test("Clone on the Random character counts as New character (#3786)", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=spec`);
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await target("rail-characters").click();
    const random = target("character-random");
    await expect(random).toHaveClass(/tutorial-pulse/);
    // The Random beat's line offers Clone, and it sits in the beat's hole.
    await random.locator(".roster-clone").click();
    await expect(target("professions")).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-panel")).toContainText("Switch a profession");
  });

  test("changes the spec in the builder, one locked target at a time (#3541)", async ({ page }) => {
    // A walk through the whole builder: ~50 s on a loaded runner, past the default.
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=spec`);
    const panel = page.locator(".coach-panel");
    await expect(panel).toContainText("Change your spec.");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await expect(target("rail-characters")).toHaveClass(/tutorial-pulse/);
    await target("rail-characters").click();
    // A fresh player's one character is the rolled Random one: said, not opened (#3786).
    const random = target("character-random");
    await expect(random).toHaveClass(/tutorial-pulse/);
    await expect(random).toContainText("Random");
    const bubble = page.locator(".coach-bubble");
    await expect(bubble).toContainText("This is your Random character");
    // Teams is dimmed: a click on it never reaches the menu.
    await target("rail-teams").click({ force: true });
    await expect(page.locator(".screen-teams")).toHaveCount(0);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("character-new")).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Make your own: press New character.");
    await target("character-new").click();

    await expect(target("professions")).toHaveClass(/tutorial-pulse/);
    await expect(panel).toContainText("Switch a profession");
    await expect(bubble).toContainText("a Warrior's Strength, a Monk's Divine Favor");
    // Save is dimmed until its beat: a click on it saves nothing.
    await target("save").click({ force: true });
    await expect(page.locator(".editor-professions")).toBeVisible();
    // A new character has no secondary: take one.
    await professionField(page, "secondary").click();
    const cells = target("professions").locator(".profession-grid .profession-cell");
    await cells.and(page.locator(':not([data-profession="none"])')).first().click();

    await expect(target("attributes").first()).toHaveClass(/tutorial-pulse/);
    // No point is spent yet: a first rank always goes through.
    await page.locator('.editor-attribute .attribute-pip[data-pip="1"]').first().click();

    await expect(target("skills").first()).toHaveClass(/tutorial-pulse/);
    await openLibraryGroup(page);
    const slot = page.locator(".skill-slot").last();
    const fresh = page.locator(".skill-library .skill-box:not(.is-equipped):not(.is-elite)");
    expect(await fresh.count()).toBeGreaterThan(0);
    await fresh.first().dragTo(slot);

    await expect(target("weapons").first()).toHaveClass(/tutorial-pulse/);
    const weapon = page.locator(".gear-slot").first();
    const held = (await weapon.textContent()) ?? "";
    await weapon.click();
    await page
      .locator(".gear-box")
      .filter({ hasText: held.includes("Hammer") ? "Axe" : "Hammer" })
      .first()
      .click();

    await expect(target("gear").first()).toHaveClass(/tutorial-pulse/);
    await page.locator('.paper-doll-hotspot[data-slot="head"]').click();
    const popover = page.locator(".paper-doll-popover");
    await popover.locator('.paper-doll-choice[aria-selected="false"]').first().click();
    await page.keyboard.press("Escape");

    await expect(target("save")).toHaveClass(/tutorial-pulse/);
    await target("save").click();
    // The builder is left, and the quest goes on to the team step (#3542).
    await expect(page.locator(".editor-professions")).toHaveCount(0);
    await expect(panel).toContainText("Build a team to be successful.");
    await expect(target("rail-teams")).toHaveClass(/tutorial-pulse/);
  });

  test("builds and saves a team of two in the team editor (#3542)", async ({ page }) => {
    // A walk through the team editor, drags included: past the default on a loaded runner.
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=team`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    await expect(panel).toContainText("Build a team to be successful.");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await expect(target("rail-teams")).toHaveClass(/tutorial-pulse/);
    await target("rail-teams").click();

    // The sidebar's size first, at 4v4, with New team build dimmed (#3794).
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-build-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    await expect(stepper).toContainText("4v4");
    await expect(bubble).toContainText("Set the team size to 2v2.");
    await expect(target("team-new")).not.toHaveClass(/tutorial-pulse/);
    await stepper.getByRole("button", { name: "Smaller team" }).click();
    await expect(stepper).toContainText("2v2");
    // Then New team build alone.
    await expect(target("team-new")).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Now make a new team build.");
    await target("team-new").click();
    await expect(page.locator(".team-grid .team-row")).toHaveCount(2);

    await expect(target("team-members")).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("team-member-build").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("team-problems").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();

    // Save is dimmed until its beat: a click on it stores nothing.
    const save = page.locator('#topbar [data-tutorial~="team-save"]');
    await save.click({ force: true });
    await expect(page.locator(".team-grid")).toBeVisible();

    await expect(panel).toContainText("Put your character in the team");
    const rows = page.locator(".team-grid .team-row");
    const pick = page.locator(".team-pick").first();
    await pick.dragTo(rows.nth(0));
    await expect(panel).toContainText("Fill the team");
    await pick.dragTo(rows.nth(1));

    await expect(save).toHaveClass(/tutorial-pulse/);
    await save.click();
    // The editor is left, and on to the modes step (#3543).
    await expect(page.locator(".team-grid")).toHaveCount(0);
    await expect(panel).toContainText("Know where to fight.");
  });

  test("a member's name opens its build, and Back carries on in the team (#3785)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=team`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await target("rail-teams").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-build-size"]');
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    await page.locator(".play-card-new").click();
    await expect(target("team-members")).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();

    // The name, as the line invites: its build, with Back pointed at and nothing locked.
    const name = target("team-member-build").first();
    await expect(name).toHaveClass(/tutorial-pulse/);
    await name.click();
    await expect(bubble).toContainText("This is that member's build.");
    const back = page.locator('#topbar [data-tutorial~="screen-back"]');
    await expect(back).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-dim")).toBeHidden();
    await back.click();

    // The team editor again, the name's beat done: on to the problems, then Save.
    await expect(page.locator(".team-grid")).toBeVisible();
    await expect(target("team-problems").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    const rows = page.locator(".team-grid .team-row");
    const pick = page.locator(".team-pick").first();
    await expect(panel).toContainText("Put your character in the team");
    await pick.dragTo(rows.nth(0));
    await expect(panel).toContainText("Fill the team");
    await pick.dragTo(rows.nth(1));
    const save = page.locator('#topbar [data-tutorial~="team-save"]');
    await expect(save).toHaveClass(/tutorial-pulse/);
    await save.click();
    await expect(panel).toContainText("Know where to fight.");
  });

  test("lights the five modes on the rail in turn, Got it alone, the screen kept (#3990)", async ({
    page,
  }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=modes`);
    const panel = page.locator(".coach-panel");
    await expect(panel).toContainText("Know where to fight.");
    const screen = await page.locator(".screen").getAttribute("class");
    await walkModes(page);
    // On to the arena step (#3544), on the screen the step began on.
    await expect(panel).toContainText("Prove your team in a 2v2 Team Arena match.");
    await expect(page.locator('[data-tutorial~="rail-team-arena"]')).toHaveClass(/tutorial-pulse/);
    expect(await page.locator(".screen").getAttribute("class")).toBe(screen);
  });

  test("queues a team of two for Team Arena, then lifts and is done (#3544)", async ({ page }) => {
    test.setTimeout(120_000);
    // A saved, playable team of two, as the team step leaves one.
    await page.goto("./");
    await openRail(page, "Team Builder");
    await expect(page.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await page.locator(".screen").evaluate((element, pasted) => {
      const data = new DataTransfer();
      data.setData("text/plain", pasted);
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, duoCode());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".toast")).toHaveText("Saved");

    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=arena`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await expect(panel).toContainText("Prove your team in a 2v2 Team Arena match.");

    await target("rail-team-arena").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Only teams of the same size are matched");
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    await expect(stepper).toContainText("2v2");

    const find = page.locator("#topbar .lobby-find");
    await expect(find).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("a teammate who joins by your invite link");
    await find.click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");

    // The Team Lobby's builds drawer: the duo is the one it offers at 2v2.
    const tab = page.getByRole("button", { name: "Your Team Builds", exact: true });
    await expect(tab).toHaveClass(/tutorial-pulse/);
    await tab.click();
    const drawer = page.getByRole("complementary", { name: "Your Team Builds" });
    await drawer.getByRole("button", { name: "Duo", exact: true }).click();
    await drawer.getByRole("button", { name: "Propose this build", exact: true }).click();

    await expect(target("team-lobby")).toHaveClass(/tutorial-pulse/);
    // The only vote ends the stage, the only seat taken the next.
    await page.locator(".team-lobby-proposals .play-card-open").first().click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    await page.locator(".team-lobby-seat").first().click();

    // Queued: the dim is gone, the closing line shows, and the record is done.
    await expect(panel).toHaveText(/You're in the queue\. Good luck\./);
    await expect(page.locator(".coach-dim")).toBeHidden();
    await expect(page.locator(".coach-hole")).toBeHidden();
    await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.endsWith(".tutorial"))
          .map((key) => localStorage.getItem(key)),
      ),
    ).toEqual(["done"]);
    // A click takes the line away; the party stays queued.
    await panel.click();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
  });

  test("the Team Lobby's vote timer picking the team carries the quest on (#3785)", async ({
    page,
  }) => {
    // The vote's own 30 s run out: no hook shortens it.
    test.setTimeout(120_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=arena`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await target("rail-team-arena").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    const find = page.locator("#topbar .lobby-find");
    await expect(find).toHaveClass(/tutorial-pulse/);
    await find.click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    await expect(target("team-builds").first()).toHaveClass(/tutorial-pulse/);

    // Nobody votes: the timer picks, and the quest says so and goes on.
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character", {
      timeout: 45_000,
    });
    await expect(bubble).toContainText("Time ran out, so the lobby picked a team for you.");
    await expect(target("team-lobby")).toHaveClass(/tutorial-pulse/);
    await page.locator(".team-lobby-seat").first().click();
    await expect(panel).toHaveText(/You're in the queue\. Good luck\./);
  });

  test("Skip tutorial, confirmed, ends it for good", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    await panel.getByRole("button", { name: "Skip tutorial" }).click();
    await panel.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator(".screen-rail")).toBeVisible();

    await pastTheSplash(page, FLAT_MAP);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});

/** The modes step (#3990): each mode lit on the rail with its line, and passed with Got it alone. */
async function walkModes(page: Page): Promise<void> {
  const panel = page.locator(".coach-panel");
  const bubble = page.locator(".coach-bubble");
  const ticked = panel.locator(`li[aria-checked="true"]`);
  const modes = [
    ["random-arena", "Random Arena is the quickest fight"],
    ["team-arena", "Team Arena is your party"],
    ["heroes-ascent", "Heroes' Ascent is a run of maps"],
    ["gvg", "GvG is guild against guild"],
    ["hosted-game", "A Hosted Game is your own lobby"],
  ] as const;
  for (const [at, [mode, line]] of modes.entries()) {
    await expect(page.locator(`[data-tutorial~="rail-${mode}"]`)).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText(line);
    await expect(ticked).toHaveCount(at);
    await bubble.getByRole("button", { name: "Got it" }).click();
  }
}

test.describe("the menu quest on a phone (#3990)", () => {
  test.use(PIXEL_8A_PORTRAIT);

  test("opens the rail's drawer for the modes step, and Got it leaves it open", async ({
    page,
  }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=modes`);
    await expect(page.locator(".coach-panel")).toContainText("Know where to fight.");
    const toggle = page.locator(".rail-drawer-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await walkModes(page);
    await expect(page.locator(".coach-panel")).toContainText(
      "Prove your team in a 2v2 Team Arena match.",
    );
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});
