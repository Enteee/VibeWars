import { readFileSync } from "node:fs";

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
  await page.locator("#screens").getByRole("button", { name: "Music", exact: true }).click();
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

test("tracks are selectable rows: Enter previews and keeps focus; no dead editor button (#581)", async ({
  page,
}) => {
  await page.goto("./");
  await page.locator("#screens").getByRole("button", { name: "Music", exact: true }).click();
  const row = page.locator(".jukebox-row", { hasText: "Ember Deep" });
  const play = row.locator(".selectable-row-choose");
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveClass(/is-selected/);
  await expect(play).toHaveAttribute("aria-pressed", "true");
  await expect(play).toBeFocused();
  // Tab goes on to the row's Pin, which belongs to the same track.
  await page.keyboard.press("Tab");
  await expect(row.getByRole("button", { name: "pin" })).toBeFocused();
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(play).toHaveAttribute("aria-pressed", "false");
  // The beat editor (#373) has not landed: no button that does nothing.
  await expect(page.getByRole("button", { name: "open in editor" })).toHaveCount(0);
});

test("in the HUD ♪ popover, pinning a track narrows neither its row nor its button (#710)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("./");
  await startSoloMatch(page);
  await expect(page.locator(".hud-bar-health .hud-bar-label")).toContainText("hp");
  await page.locator(".hud-music").click();
  const popover = page.locator(".hud-jukebox");
  const pinned = popover.locator(".jukebox-row", { hasText: "Ember Deep" });
  await pinned.getByRole("button", { name: "pin" }).click();
  await expect(pinned.locator(".jukebox-pin")).toHaveText("Pinned");

  const widths = (selector: string): Promise<number[]> =>
    popover
      .locator(selector)
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
  const rows = await widths(".jukebox-row");
  expect(rows.length).toBeGreaterThan(1);
  const pinWidth = (await pinned.locator(".jukebox-pin").boundingBox())?.width ?? 0;
  for (const width of rows) {
    expect(Math.abs(width - (rows[0] ?? 0))).toBeLessThanOrEqual(1);
  }
  for (const width of await widths(".jukebox-pin")) {
    expect(Math.abs(width - pinWidth)).toBeLessThanOrEqual(1);
  }
  // The title gives way: every button stays on its row's line.
  for (const row of await popover.locator(".jukebox-row").all()) {
    const play = await row.locator(".jukebox-play").boundingBox();
    const pin = await row.locator(".jukebox-pin").boundingBox();
    expect(play !== null && pin !== null && pin.y < play.y + play.height).toBe(true);
  }
});

test("Off plays nothing after a click, and the music mute survives a reload (#372, #424)", async ({
  page,
}) => {
  await recordMessages(page);
  await page.goto("./");
  await page.locator("#screens").getByRole("button", { name: "Music", exact: true }).click();
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

  await page.locator("#screens").getByRole("button", { name: "Music", exact: true }).click();
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

/** In the music host's frame, every message the game posts to it. */
async function recordHostInbox(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.top === window) {
      return;
    }
    const received: unknown[] = [];
    Object.assign(window, { fromGame: received });
    addEventListener("message", (event: MessageEvent) => {
      if (event.source === window.parent) {
        received.push(event.data);
      }
    });
  });
}

/** The levels the game told its host to play, in order. */
async function intensitiesSent(page: Page): Promise<number[]> {
  const host = page.frames().find((frame) => frame.url().includes("music-host"));
  if (host === undefined) {
    return [];
  }
  return host.evaluate(
    () =>
      (window as unknown as { fromGame?: unknown[] }).fromGame?.flatMap((message) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "setIntensity" &&
        "level" in message
          ? [Number(message.level)]
          : [],
      ) ?? [],
  );
}

test("Options → Sound names the menu's track, and a fixed intensity reaches the host (#425)", async ({
  page,
}) => {
  const titles = new Map(
    (
      JSON.parse(
        readFileSync(
          new URL("../apps/web/src/music/tracks/manifest.json", import.meta.url),
          "utf8",
        ),
      ) as readonly { readonly id: string; readonly title: string }[]
    ).map((track) => [track.id, track.title]),
  );
  await recordMessages(page);
  await recordHostInbox(page);
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => playedTracks(page), { timeout: 5_000 }).toHaveLength(1);
  const [menuTrack] = await playedTracks(page);

  await page.getByRole("button", { name: "options" }).click();
  await expect(page.locator('.options-entry[data-section="sound"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".music-now-playing-title")).toContainText(
    titles.get(menuTrack ?? "") ?? "no such track",
  );
  const intensity = page.getByRole("group", { name: "intensity" });
  // The menu is calm: the director picks 0, and Auto says so.
  await expect(intensity.getByRole("button", { name: "Auto (0)" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await intensity.getByRole("button", { name: "3", exact: true }).click();
  await expect(intensity.getByRole("button", { name: "3", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(() => intensitiesSent(page), { timeout: 5_000 }).toContain(3);
});
