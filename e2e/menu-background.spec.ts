import { expect, test } from "@playwright/test";
import { hostLobby, setTeamSize, startSoloMatch } from "./helpers/peers.js";

test.describe("the live menu background (#3119)", () => {
  test("fights on the lobby's map and size, and follows a change", async ({ page }) => {
    await page.goto("./");
    await hostLobby(page, { size: 1 });
    const background = page.locator("#menu-background");
    await expect(background).toHaveAttribute("data-map", "ember-pits");
    await expect(background).toHaveAttribute("data-team-size", "1");
    await expect(background.locator("canvas")).toHaveCount(1);

    await setTeamSize(page, 2);
    await expect(background).toHaveAttribute("data-team-size", "2");
    // Never two fights at once.
    await expect(background.locator("canvas")).toHaveCount(1);
  });

  test("is gone for a match", async ({ page }) => {
    await page.goto("./");
    await startSoloMatch(page);
    await expect(page.locator("#menu-background canvas")).toHaveCount(0);
    await expect(page.locator("#menu-background")).not.toHaveAttribute("data-map");
  });

  test("still draws under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await hostLobby(page, { size: 1 });
    await expect(page.locator("#menu-background")).toHaveAttribute("data-map", "ember-pits");
    await expect(page.locator("#menu-background canvas")).toHaveCount(1);
  });
});
