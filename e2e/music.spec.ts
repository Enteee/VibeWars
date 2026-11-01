import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { openRail } from "./helpers/menu.js";
import { startSoloMatch } from "./helpers/peers.js";
import { key } from "./keys.js";

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
  await expect(page.locator(".screen-random-arena")).toBeVisible();
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
      { type: "evaluate", seq: 1, source },
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
          frame.contentWindow?.postMessage({ type: "evaluate", seq: 1, source }, "*");
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

/**
 * The top bar's ♪ popover (#1453), open: a click elsewhere, as on the
 * beat editor, may have put it away.
 */
async function openJukebox(page: Page): Promise<void> {
  const popover = page.locator("#topbar .hud-jukebox");
  if (!(await popover.isVisible())) {
    await page.locator("#topbar .topbar-music").click();
  }
  await expect(popover).toBeVisible();
}

test("a pinned track is what plays after a reload (#372)", async ({ page }) => {
  await recordMessages(page);
  await page.goto("./");
  await openJukebox(page);
  await page
    .locator(".jukebox-row", { hasText: "Ember Deep" })
    .getByRole("button", { name: "pin" })
    .click();
  await expect(page.locator(".jukebox-mode")).toHaveValue("pinned");

  await page.reload();
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => playedTracks(page), { timeout: 5_000 }).toEqual(["ember-deep"]);
});

test("tracks are selectable rows: Enter previews and keeps focus (#581)", async ({ page }) => {
  await page.goto("./");
  await openJukebox(page);
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
});

/** The types of what this page's host said, in order. */
function hostTypes(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as { hostMessages: unknown[] }).hostMessages.map((message) =>
      typeof message === "object" && message !== null && "type" in message
        ? String(message.type)
        : "?",
    ),
  );
}

/** How many events the host played in each second it measured (`?musicstats`). */
function eventsPerSecond(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const stats = (window as unknown as { hostMessages: unknown[] }).hostMessages.filter(
      (message): message is { type: "stats"; events: number } =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "stats",
    );
    return stats.map((message) => message.events);
  });
}

test("the beat editor plays a change, keeps it across a reload, and an error leaves it playing (#373)", async ({
  page,
}) => {
  await recordMessages(page);
  await recordHostInbox(page);
  await page.goto("./?musicstats");
  await openJukebox(page);
  const row = page.locator(".jukebox-row", { hasText: "Ember Deep" });
  await row.getByRole("button", { name: "Open Ember Deep in the beat editor" }).click();
  const editor = page.getByRole("dialog", { name: "Beat editor: Ember Deep" });
  const code = editor.locator(".cm-content");
  await expect(code).toContainText("ember-deep");
  // Syntax colours: a keyword is not plain ink.
  await expect(code.locator("span", { hasText: /^let$/ }).first()).toHaveCSS(
    "color",
    "rgb(210, 168, 255)",
  );
  // The click on Music started the menu's track; the editor holds its own.
  await expect.poll(() => playedTracks(page), { timeout: 5_000 }).toContain("ember-deep");

  await code.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n.gain(.9)");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => hostTypes(page), { timeout: 5_000 }).toContain("evaluated");
  await expect(editor.locator(".beat-editor-edited")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await openJukebox(page);
  await expect(row).toHaveClass(/is-edited/);

  await page.reload();
  await openJukebox(page);
  await expect(row).toHaveClass(/is-edited/);
  await row.getByRole("button", { name: "Open Ember Deep in the beat editor" }).click();
  // CodeMirror draws only the lines in view; the change is on the last.
  await code.click();
  await page.keyboard.press("Control+End");
  await expect(code).toContainText(".gain(.9)");
  // The edit is what plays: the host was sent it, not the shipped source.
  await expect.poll(() => sourcesSent(page, "ember-deep"), { timeout: 5_000 }).toEqual([true]);

  await page.keyboard.type("\n)))(");
  await page.keyboard.press("Control+Enter");
  await expect.poll(() => hostTypes(page), { timeout: 5_000 }).toContain("error");
  await expect(editor.locator(".beat-editor-error")).toBeVisible();
  // The old pattern plays on: the seconds measured after the error have
  // events. Three of them, as the menu's layer plays a chord every 2.4 s.
  const seconds = (await eventsPerSecond(page)).length;
  await expect
    .poll(async () => (await eventsPerSecond(page)).length, { timeout: 8_000 })
    .toBeGreaterThan(seconds + 3);
  const after = (await eventsPerSecond(page)).slice(seconds + 1);
  expect(after.reduce((sum, events) => sum + events, 0)).toBeGreaterThan(0);

  await editor.getByRole("button", { name: "Reset to shipped" }).click();
  await expect(editor.locator(".beat-editor-edited")).toBeHidden();
  // The button disables itself; focus goes back to the code, so Esc still closes.
  await expect(code).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await openJukebox(page);
  await expect(row).not.toHaveClass(/is-edited/);
});

test("a pasted beat that floods the game is switched off, and its edit is not replayed (#878)", async ({
  page,
}) => {
  await page.goto("./");
  await openJukebox(page);
  const row = page.locator(".jukebox-row", { hasText: "Ember Deep" });
  await row.getByRole("button", { name: "Open Ember Deep in the beat editor" }).click();
  const editor = page.getByRole("dialog", { name: "Beat editor: Ember Deep" });
  const code = editor.locator(".cm-content");
  await expect(code).toContainText("ember-deep");

  await code.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.insertText(
    [
      "const big = 'x'.repeat(4000)",
      "setInterval(() => { for (let i = 0; i < 500; i++) parent.postMessage({ type: 'error', message: big, line: 1 }, '*') }, 0)",
      "note('c3')",
    ].join("\n"),
  );
  await page.keyboard.press("Control+Enter");
  await expect(editor.locator(".beat-editor-status")).toHaveText(
    "The music flooded the game with messages and was switched off.",
    { timeout: 3_000 },
  );
  await expect(page.locator("iframe.music-host")).toHaveCount(0);

  await page.keyboard.press("Escape");
  // The menu says so the next time it draws: here, on Team Builder.
  await openRail(page, "Team Builder");
  await expect(
    page.getByText("Your edit of Ember Deep stopped the music and was removed."),
  ).toBeVisible();
  await page.reload();
  await openJukebox(page);
  await expect(row).not.toHaveClass(/is-edited/);
});

test("keys typed in the beat editor reach no skill in a match (#373)", async ({ page }) => {
  await page.goto("./");
  await startSoloMatch(page);
  const effects = page.getByRole("list", { name: "your effects" }).getByRole("listitem");
  await expect(effects).toHaveCount(0);
  await page.locator(".hud-music").click();
  await page.getByRole("button", { name: "Edit what plays" }).click();
  const editor = page.getByRole("dialog", { name: /^Beat editor: / });
  await editor.locator(".cm-content").click();
  // Q is skill 1; skill 5 is a self-cast enchantment, which needs no target.
  await page.keyboard.type(`q${key("skill-5").replace(/^Key/, "").toLowerCase()}`);
  await page.waitForTimeout(1000);
  await expect(effects).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
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
  await openJukebox(page);
  await page.locator(".jukebox-mode").selectOption("off");
  // The music's mute is above the tracks.
  await page.getByLabel("Mute music").check();

  await page.reload();
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect(page.locator("iframe.music-host")).toHaveCount(1);
  // Long enough for a track to have started, had one been asked for.
  await page.waitForTimeout(4_000);
  expect(await playedTracks(page)).toEqual([]);

  await openJukebox(page);
  await expect(page.locator(".jukebox-mode")).toHaveValue("off");
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
  await expect(page.locator(".mode-rail")).toBeVisible();
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
  // The first click on the rail, on the way to hosting, starts the music.
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
  await expect(page.locator(".mode-rail")).toBeVisible();
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
  // The click on the rail starts the music; the editor opens at once
  // after, well inside the toast's few seconds.
  await openRail(page, "Character Builder");
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

/** For each track message the game sent its host for `trackId`: whether it carried `.gain(.9)`. */
async function sourcesSent(page: Page, trackId: string): Promise<boolean[]> {
  const host = page.frames().find((frame) => frame.url().includes("music-host"));
  if (host === undefined) {
    return [];
  }
  return host.evaluate(
    (id) =>
      (window as unknown as { fromGame?: unknown[] }).fromGame?.flatMap((message) =>
        typeof message === "object" &&
        message !== null &&
        "trackId" in message &&
        message.trackId === id &&
        "source" in message &&
        typeof message.source === "string"
          ? [message.source.includes(".gain(.9)")]
          : [],
      ) ?? [],
    trackId,
  );
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
  await expect(page.locator(".screen-random-arena")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => playedTracks(page), { timeout: 5_000 }).toHaveLength(1);
  const [menuTrack] = await playedTracks(page);

  await page.locator(".topbar-options").click();
  await page.locator('.options-entry[data-section="sound"]').click();
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

/** The track of every message the game sent its host that names one, in order. */
async function tracksSent(page: Page): Promise<string[]> {
  const host = page.frames().find((frame) => frame.url().includes("music-host"));
  if (host === undefined) {
    return [];
  }
  return host.evaluate(
    () =>
      (window as unknown as { fromGame?: unknown[] }).fromGame?.flatMap((message) =>
        typeof message === "object" && message !== null && "trackId" in message
          ? [String(message.trackId)]
          : [],
      ) ?? [],
  );
}

test("the Character Builder's Training Ground keeps the menu's song while it runs (#2020)", async ({
  page,
}) => {
  await recordHostInbox(page);
  await page.goto("./");
  await expect(page.locator(".mode-rail")).toBeVisible();
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => tracksSent(page), { timeout: 5_000 }).toEqual(["first-light"]);

  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  // The arena runs on its own once open; its music is asked every few frames.
  await expect(page.locator(".training canvas")).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(new Set(await tracksSent(page))).toEqual(new Set(["first-light"]));
});
