import { expect, test, type Page, type Request } from "@playwright/test";

import { openRail } from "./helpers/menu.js";

/**
 * The static GitHub Pages build (#103): served under a sub-path, with no
 * game server behind it, and online play peer to peer (#403).
 *
 * Every e2e test runs against this build (`playwright.config.ts`); these
 * are the ones about the sub-path and the network. `baseURL` already ends
 * in that path, so every `goto` here is relative to it.
 */

interface Traffic {
  readonly failed: string[];
  readonly online: string[];
  /** Requests started and not yet finished or failed (#1506). */
  readonly pending: Set<Request>;
}

/**
 * Record every response that isn't a 200, every request that failed,
 * anything aimed at a server, and what is still in flight.
 */
function watchTraffic(page: Page): Traffic {
  const traffic: Traffic = { failed: [], online: [], pending: new Set() };
  page.on("request", (request) => {
    const { protocol } = new URL(request.url());
    // Playwright settles some data: and blob: requests with no event.
    if (protocol !== "data:" && protocol !== "blob:") {
      traffic.pending.add(request);
    }
  });
  page.on("requestfinished", (request) => {
    traffic.pending.delete(request);
  });
  page.on("requestfailed", (request) => {
    traffic.pending.delete(request);
    traffic.failed.push(`requestfailed ${request.url()} ${request.failure()?.errorText ?? ""}`);
  });
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

/**
 * Wait until every request the page started has settled (#1506), so
 * `failed` and `online` are complete. Not `networkidle`: that wants
 * 500 ms of silence, which a loaded runner's background fetches deny.
 */
async function settled(traffic: Traffic): Promise<void> {
  await expect.poll(() => [...traffic.pending].map((request) => request.url())).toEqual([]);
}

test("the menu loads under the sub-path, with every asset found", async ({ page }) => {
  const traffic = watchTraffic(page);
  await page.goto("./");
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  // Profession and status icons are fetched by URL, not bundled, so they
  // are the assets a wrong base path would break.
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
  // Every icon in the editor loaded; an icon button with no icon has no src.
  const icons = page.locator(".editor-layout img[src]");
  await expect(icons.first()).toBeAttached();
  await expect
    .poll(() =>
      icons.evaluateAll((images) =>
        images
          .filter(
            (img) => !(img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0),
          )
          .map((img) => img.getAttribute("src")),
      ),
    )
    .toEqual([]);
  await settled(traffic);

  expect(traffic.failed).toEqual([]);
  expect(traffic.online).toEqual([]);
});

test("Help links to the source, as the AGPL asks of a networked game (#1442)", async ({ page }) => {
  await page.goto("./");
  await page.locator(".topbar-help").click();
  const source = page
    .getByRole("dialog", { name: "Help" })
    .getByRole("link", { name: "Source code" });
  await expect(source).toHaveAttribute("href", "https://github.com/Enteee/VibeWars");
  await expect(source).toHaveAttribute("target", "_blank");
});

test("online play is on, and hosting a lobby reaches nothing but our own origin", async ({
  page,
  baseURL,
}) => {
  const traffic = watchTraffic(page);
  const ours = new URL(baseURL ?? "").origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== ours && url.protocol !== "data:" && url.protocol !== "blob:") {
      foreign.push(request.url());
    }
  });
  await page.goto("./");
  await expect(page.locator(".screen-random-arena")).toBeVisible();

  await expect(page.getByRole("button", { name: "quick match" })).toHaveCount(0);
  // Every page hosts its own lobby from load (#1526), its invite link to
  // copy (#2100).
  await expect(page.locator("#topbar .lobby-code-label")).toHaveText("Your lobby");
  await expect(page.getByRole("button", { name: "Copy invite link", exact: true })).toBeEnabled();
  await openRail(page, "Hosted Game");
  await expect(page.locator(".lobby-panel")).toBeVisible();

  await settled(traffic);
  expect(traffic.online).toEqual([]);
  expect(foreign).toEqual([]);
});

test("a disabled primary button looks as disabled as any other (#137)", async ({ page }) => {
  await page.goto("./");
  await openRail(page, "Hosted Game");
  // Nobody on a team: nothing to start, and nobody to be ready.
  const start = page.getByRole("button", { name: "start match" });
  const ready = page.getByRole("button", { name: "Ready", exact: true });
  await expect(start).toBeDisabled();
  await expect(ready).toBeDisabled();
  // Ready is the primary until you are (#1272); Start match waits its turn.
  await expect(ready).toHaveClass(/\bprimary\b/);
  await expect(start).not.toHaveClass(/\bprimary\b/);

  const look = (el: Element) => {
    const style = getComputedStyle(el);
    return { color: style.color, border: style.borderTopColor, opacity: style.opacity };
  };
  expect(await start.evaluate(look)).toEqual(await ready.evaluate(look));
});

test("a character saved under the sub-path survives a reload", async ({ page }) => {
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Pages Ranger");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".screen-characters")).toContainText("Pages Ranger");

  // The rail remembers Character Builder across the reload.
  await page.reload();
  await expect(page.locator(".screen-characters")).toContainText("Pages Ranger");
});

test("music plays under the sub-path, every sample from our own files", async ({
  page,
  baseURL,
}) => {
  const traffic = watchTraffic(page);
  const ours = new URL(baseURL ?? "").origin;
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== ours && url.protocol !== "data:" && url.protocol !== "blob:") {
      foreign.push(request.url());
    }
  });
  const said: string[] = [];
  await page.exposeFunction("musicSaid", (type: string) => {
    said.push(type);
  });
  await page.addInitScript(() => {
    addEventListener("message", (event: MessageEvent) => {
      const data: unknown = event.data;
      if (typeof data === "object" && data !== null && "type" in data) {
        void (window as unknown as { musicSaid: (type: string) => Promise<void> }).musicSaid(
          String(data.type),
        );
      }
    });
  });

  await page.goto("./");
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });

  await expect.poll(() => said, { timeout: 5_000 }).toContain("playing");
  expect(traffic.failed).toEqual([]);
  expect(foreign).toEqual([]);
});
