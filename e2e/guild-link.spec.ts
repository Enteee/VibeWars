import { expect, test, type Page } from "@playwright/test";

/**
 * Guild links (#3167): a link carries a guild tag and cape into another
 * player's Options, but only once they say Join.
 */

async function expectGuild(page: Page, tag: string, main: string): Promise<void> {
  await page.locator(".topbar-options").click();
  await expect(page.locator(".options-screen")).toBeVisible();
  await expect(page.locator(".player-guild-tag input")).toHaveValue(tag);
  await expect(
    page.locator(`.player-cape-row[aria-label="Cape"] [data-colour="${main}"]`),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(page.locator(".options-screen")).toHaveCount(0);
}

test("a guild link asks first: Join wears its tag and cape, No changes nothing", async ({
  page,
}) => {
  await page.goto("./#guild=VW.gold.black.cross");
  const prompt = page.getByRole("dialog", { name: "Guild link" });
  await expect(prompt).toContainText("Join guild [VW]?");
  // Taken out of the address bar at once, so a reload never asks again.
  expect(new URL(page.url()).hash).toBe("");
  await prompt.getByRole("button", { name: "Join" }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText("You now wear [VW]'s cape.");
  await expectGuild(page, "VW", "gold");

  // Opened again in this tab, another guild's link names the one it would replace.
  await page.goto("./#guild=AB.teal.white.ring");
  await expect(prompt).toContainText("Replace [VW] with [AB]?");
  await prompt.getByRole("button", { name: "No" }).click();
  await expect(prompt).toHaveCount(0);
  await expectGuild(page, "VW", "gold");

  // The guild the player already wears asks nothing.
  await page.goto("./#guild=VW.gold.black.cross");
  await page.goto("./#guild=V!");
  await expect(page.locator(".toast")).toHaveText("That guild link is broken.");
  await expect(prompt).toHaveCount(0);
});

test("framed by another page, a guild link asks nothing: it says to open it in its own tab", async ({
  page,
}) => {
  // A framing page could lay a decoy over Join (#972).
  await page.goto("./");
  const src = new URL("./#guild=VW.gold.black.cross", page.url()).href;
  await page.setContent(`<iframe src="${src}" width="1024" height="768"></iframe>`);
  const game = page.frameLocator("iframe");
  await expect(
    game.locator(".screen-problem", { hasText: "Open the guild link in its own tab" }),
  ).toBeVisible();
  await expect(game.getByRole("dialog", { name: "Guild link" })).toHaveCount(0);
});
