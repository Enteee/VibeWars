import { expect, test } from "@playwright/test";
import { openRail } from "./helpers/menu.js";
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

  test("one fight across the menu's screens; a new size is a new one", async ({ page }) => {
    await page.goto("./");
    await hostLobby(page, { size: 1 });
    const background = page.locator("#menu-background");
    await expect(background).toHaveAttribute("data-fight", /.+/);
    const fight = await background.getAttribute("data-fight");

    for (const screen of ["Character Builder", "Team Builder", "Matches", "Hosted Game"] as const) {
      await openRail(page, screen);
      await expect(background).toHaveAttribute("data-fight", fight ?? "");
    }

    await setTeamSize(page, 2);
    await expect(background).not.toHaveAttribute("data-fight", fight ?? "");
    await expect(background).toHaveAttribute("data-fight", /.+/);
  });

  test("only Hosted Game picks the map: other modes' lobbies leave the fight running (#3131)", async ({
    page,
  }) => {
    await page.goto("./");
    await hostLobby(page, { size: 1 });
    const background = page.locator("#menu-background");
    await expect(background).toHaveAttribute("data-shown", "");
    const fight = await background.getAttribute("data-fight");

    for (const screen of ["Team Arena", "Random Arena"] as const) {
      await openRail(page, screen);
      await expect(background).toHaveAttribute("data-fight", fight ?? "");
      await expect(background).toHaveAttribute("data-map", "ember-pits");
    }

    await openRail(page, "Hosted Game");
    const maps = page.locator(".lobby-map select");
    await maps.selectOption("arena-crossroads");
    await expect(background).toHaveAttribute("data-map", "arena-crossroads");
    await expect(background).toHaveAttribute("data-shown", "");
    await expect(background.locator("canvas")).toHaveCount(1);
  });

  test("is gone for a match", async ({ page }) => {
    await page.goto("./");
    await startSoloMatch(page);
    await expect(page.locator("#menu-background canvas")).toHaveCount(0);
    await expect(page.locator("#menu-background")).not.toHaveAttribute("data-map");
  });

  test("is gone while the build editor's training arena runs, and back after", async ({ page }) => {
    await page.goto("./");
    await expect(page.locator("#menu-background canvas")).toHaveCount(1);
    await openRail(page, "Character Builder");
    await page.getByRole("button", { name: "new character" }).click();
    await expect(page.locator(".training canvas")).toBeVisible();
    await expect(page.locator("#menu-background canvas")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(page.locator(".screen-characters")).toBeVisible();
    await expect(page.locator("#menu-background canvas")).toHaveCount(1);
  });

  test("still draws under reduced motion: once, held, and again after a resize (#3157)", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await hostLobby(page, { size: 1 });
    const background = page.locator("#menu-background");
    await expect(background).toHaveAttribute("data-map", "ember-pits");
    await expect(background).toHaveAttribute("data-shown", "");
    await expect(background.locator("canvas")).toHaveCount(1);
    // The background alone: the menu over it would make any shot look drawn.
    await page.addStyleTag({ content: "body > :not(#menu-background) { visibility: hidden; }" });
    const shot = (): Promise<Buffer> => background.locator("canvas").screenshot();
    /** How many colours `png` has: one is a canvas cleared and never drawn again. */
    const colours = (png: Buffer): Promise<number> =>
      page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const context = new OffscreenCanvas(image.width, image.height).getContext("2d");
        if (context === null) throw new Error("no 2d context");
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, image.width, image.height);
        const seen = new Set<number>();
        for (let at = 0; at < data.length; at += 4) {
          seen.add(((data[at] ?? 0) << 16) | ((data[at + 1] ?? 0) << 8) | (data[at + 2] ?? 0));
        }
        return seen.size;
      }, png.toString("base64"));

    const held = await shot();
    expect(await colours(held)).toBeGreaterThan(1);
    await page.waitForTimeout(500);
    expect((await shot()).equals(held)).toBe(true);

    await page.setViewportSize({ width: 900, height: 600 });
    await expect.poll(async () => colours(await shot())).toBeGreaterThan(1);
  });
});
