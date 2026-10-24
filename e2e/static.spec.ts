import { expect, test, type Page } from "@playwright/test";

/**
 * The static GitHub Pages build (#103): served under a sub-path, with no
 * game server behind it.
 *
 * Runs in its own Playwright project against `vite preview` of a build
 * made with `VIBEWARS_BASE=/VibeWars/next/ VITE_VIBEWARS_ONLINE=off`, the
 * same flags `pages.yml` deploys `next` with. `baseURL` already ends in
 * that path, so every `goto` here is relative to it.
 */

interface Traffic {
  readonly failed: string[];
  readonly online: string[];
}

/** Record every response that isn't a 200, and anything aimed at a server. */
function watchTraffic(page: Page): Traffic {
  const traffic: Traffic = { failed: [], online: [] };
  page.on("response", (response) => {
    if (response.status() !== 200) {
      traffic.failed.push(`${String(response.status())} ${response.url()}`);
    }
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/api/")) {
      traffic.online.push(request.url());
    }
  });
  page.on("websocket", (socket) => {
    traffic.online.push(socket.url());
  });
  return traffic;
}

test("the menu loads under the sub-path, with every asset found", async ({ page }) => {
  const traffic = watchTraffic(page);
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  // Profession and status icons are fetched by URL, not bundled, so they
  // are the assets a wrong base path would break.
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(traffic.failed).toEqual([]);
  expect(traffic.online).toEqual([]);
});

test("online play is shown disabled, and nothing reaches for a server", async ({ page }) => {
  const traffic = watchTraffic(page);
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();

  await expect(page.getByRole("button", { name: "host a lobby" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "join", exact: true })).toBeDisabled();
  await expect(page.getByPlaceholder("CODE")).toBeDisabled();
  await expect(page.getByRole("button", { name: "quick match" })).toBeDisabled();
  await expect(page.getByText("Online play isn't available in this build yet.")).toBeVisible();
  // Building teams needs no server, so it stays available.
  await expect(page.getByRole("button", { name: "teams" })).toBeEnabled();

  await page.waitForLoadState("networkidle");
  expect(traffic.online).toEqual([]);
});

test("a character saved under the sub-path survives a reload", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Pages Ranger");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Pages Ranger");

  await page.reload();
  await expect(page.locator(".roster")).toContainText("Pages Ranger");
});
