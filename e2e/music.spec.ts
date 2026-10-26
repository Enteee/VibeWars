import { expect, test, type Page } from "@playwright/test";

import { startSoloMatch } from "./helpers/peers.js";

/**
 * Music (#371, ADR-0028): the Strudel engine in a sandboxed iframe, made
 * on the first click. Audio output itself is not asserted; what the host
 * says over `postMessage` is.
 *
 * Runs against the LAN server's build, which must send
 * `Access-Control-Allow-Origin` on static files or the host never starts.
 */

/**
 * Every message the page receives, from the music host or anyone else; and
 * apart, those from this page's own host frame, which is all the game hears.
 * A host torn down by a reload can still have a message land in the new
 * page, from a window the game no longer knows.
 */
async function recordMessages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    const fromHost: unknown[] = [];
    Object.assign(window, { musicMessages: seen, hostMessages: fromHost });
    addEventListener("message", (event: MessageEvent) => {
      seen.push(event.data);
      const host = document.querySelector<HTMLIFrameElement>("iframe.music-host");
      if (host !== null && event.source === host.contentWindow) {
        fromHost.push(event.data);
      }
    });
  });
}

function messageTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = (window as unknown as { musicMessages: unknown[] }).musicMessages;
    return seen.map((message) =>
      typeof message === "object" && message !== null && "type" in message
        ? String(message.type)
        : "?",
    );
  });
}

test("music starts on the first click, in a sandboxed frame, with no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await recordMessages(page);

  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.locator("body").click({ position: { x: 5, y: 5 } });

  const host = page.locator("iframe.music-host");
  await expect(host).toHaveCount(1);
  // Exactly this: `allow-same-origin` would hand a pasted beat the game's storage.
  await expect(host).toHaveAttribute("sandbox", "allow-scripts");
  await expect.poll(() => messageTypes(page), { timeout: 5_000 }).toContain("playing");
  expect(errors).toEqual([]);
});

/** What a stranger would post to a host that is not where it belongs. */
const PAYLOAD = 'globalThis.musicPwned = 1\ns("bd")';

test("music-host.html opened on its own loads no engine and runs nothing posted to it", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await recordMessages(page);

  await page.goto("./music-host.html");
  await page.evaluate((source) => {
    for (const message of [
      { type: "evaluate", source },
      { type: "load", trackId: "x", source, phraseCycles: 4 },
    ]) {
      postMessage(message, "*");
    }
  }, PAYLOAD);
  await page.waitForTimeout(2_000);

  expect(await page.evaluate(() => "musicPwned" in globalThis)).toBe(false);
  expect(await messageTypes(page)).toEqual(["evaluate", "load"]);
  expect(requests.filter((url) => url.includes("/assets/engine-"))).toEqual([]);
});

test("music-host.html framed without a sandbox runs nothing either", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("./");
  await page.evaluate(
    (source) =>
      new Promise<void>((resolve) => {
        const frame = document.createElement("iframe");
        frame.src = "music-host.html";
        frame.addEventListener("load", () => {
          frame.contentWindow?.postMessage({ type: "evaluate", source }, "*");
          resolve();
        });
        document.body.appendChild(frame);
      }),
    PAYLOAD,
  );
  await page.waitForTimeout(2_000);

  const pwned = await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe:not(.music-host)");
    return frame?.contentWindow !== null && frame?.contentWindow !== undefined
      ? "musicPwned" in frame.contentWindow
      : "no frame";
  });
  expect(pwned).toBe(false);
  expect(requests.filter((url) => url.includes("/assets/engine-"))).toEqual([]);
});

test("the game's own scripts carry no Strudel engine", async ({ page, request }) => {
  await page.goto("./");
  const scripts = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLScriptElement>("script[src]"),
      ...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'),
    ].map((element) => ("src" in element ? element.src : element.href)),
  );
  expect(scripts.length).toBeGreaterThan(0);
  for (const url of scripts) {
    const body = await (await request.get(url)).text();
    // Names only the engine's own code has.
    expect(body, url).not.toMatch(/superdough|webaudioRepl|evalScope/);
  }
});

/** The ids of every track this page's host said it started. */
function playedTracks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const seen = (window as unknown as { hostMessages: unknown[] }).hostMessages;
    return seen.flatMap((message) =>
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "playing" &&
      "trackId" in message
        ? [String(message.trackId)]
        : [],
    );
  });
}

test("a pinned track is what plays after a reload (#372)", async ({ page }) => {
  await recordMessages(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page
    .locator(".jukebox-row", { hasText: "Ember Deep" })
    .getByRole("button", { name: "pin" })
    .click();
  await expect(page.locator(".jukebox-mode")).toHaveValue("pinned");

  await page.reload();
  await expect(page.locator(".roster")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => playedTracks(page), { timeout: 5_000 }).toEqual(["ember-deep"]);
});

test("Off plays nothing after a click, and the music mute survives a reload (#372, #424)", async ({
  page,
}) => {
  await recordMessages(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page.locator(".jukebox-mode").selectOption("off");
  // The music's mute lives in Options → Sound, a link away.
  await page.getByRole("button", { name: "sound settings" }).click();
  await expect(page.locator('.options-entry[data-section="sound"]')).toHaveClass(/is-selected/);
  await page.getByLabel("Mute music").check();

  await page.reload();
  await expect(page.locator(".roster")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("iframe.music-host")).toHaveCount(1);
  // Long enough for a track to have started, had one been asked for.
  await page.waitForTimeout(4_000);
  expect(await playedTracks(page)).toEqual([]);

  await page.getByRole("button", { name: "Music", exact: true }).click();
  await expect(page.locator(".jukebox-mode")).toHaveValue("off");
  await page.getByRole("button", { name: "sound settings" }).click();
  await expect(page.getByLabel("Mute music")).toBeChecked();
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

test("the now-playing toast at a match start covers none of the HUD (#372)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "host a lobby" })).toBeVisible();
  // The toast hides after a few seconds, which a busy page can spend before
  // a locator gets to it: note where it is, every frame it shows in the
  // match. It first shows on the lobby screen, bottom left (#556), and moves
  // top left once the screens give way to the match.
  await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    const screens = document.querySelector<HTMLElement>("#screens");
    if (toast === null || screens === null) {
      throw new Error("no now-playing toast or #screens");
    }
    const note = (): void => {
      if (!toast.hidden && screens.style.display === "none") {
        Object.assign(window, { toastBox: toast.getBoundingClientRect().toJSON() as unknown });
      }
      requestAnimationFrame(note);
    };
    note();
  });
  // The click that hosts the lobby is the one that starts the music.
  await startSoloMatch(page);
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");

  const toastBox = (): Promise<Box | null> =>
    page.evaluate(() => (window as { toastBox?: Box }).toastBox ?? null);
  await expect.poll(toastBox, { timeout: 5_000 }).not.toBeNull();
  const box = await toastBox();
  for (const part of [".hud-skills", ".hud-bar-health", ".hud-scoreboard", ".hud-mute"]) {
    const other = await page.locator(part).boundingBox();
    expect(other, part).not.toBeNull();
    if (box !== null && other !== null) {
      const overlaps =
        box.x < other.x + other.width &&
        other.x < box.x + box.width &&
        box.y < other.y + other.height &&
        other.y < box.y + box.height;
      expect(overlaps, `the toast overlaps ${part}`).toBe(false);
    }
  }
});

test("the now-playing toast in the build editor stays off the Training panel (#591)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  await expect(page.getByRole("button", { name: "new character" })).toBeVisible();
  // The toast hides after a few seconds: note its box every frame it shows
  // while the Training Ground is up.
  await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    if (toast === null) {
      throw new Error("no now-playing toast");
    }
    const note = (): void => {
      if (!toast.hidden && document.querySelector(".editor-layout.has-training") !== null) {
        Object.assign(window, { toastBox: toast.getBoundingClientRect().toJSON() as unknown });
      }
      requestAnimationFrame(note);
    };
    note();
  });
  // The click that opens the editor is the one that starts the music.
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator(".training-log")).toBeVisible();

  const toastBox = (): Promise<Box | null> =>
    page.evaluate(() => (window as { toastBox?: Box }).toastBox ?? null);
  await expect.poll(toastBox, { timeout: 5_000 }).not.toBeNull();
  const box = await toastBox();
  const log = await page.locator(".training").boundingBox();
  expect(log).not.toBeNull();
  if (box !== null && log !== null) {
    const overlaps =
      box.x < log.x + log.width &&
      log.x < box.x + box.width &&
      box.y < log.y + log.height &&
      log.y < box.y + box.height;
    expect(overlaps, "the toast overlaps the Training panel").toBe(false);
  }
});
