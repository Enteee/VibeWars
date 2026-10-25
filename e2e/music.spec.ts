import { expect, test, type Page } from "@playwright/test";

/**
 * Music (#371, ADR-0028): the Strudel engine in a sandboxed iframe, made
 * on the first click. Audio output itself is not asserted; what the host
 * says over `postMessage` is.
 *
 * Runs against the LAN server's build, which must send
 * `Access-Control-Allow-Origin` on static files or the host never starts.
 */

/** Every message the page receives, from the music host or anyone else. */
async function recordMessages(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: unknown[] = [];
    Object.assign(window, { musicMessages: seen });
    addEventListener("message", (event: MessageEvent) => {
      seen.push(event.data);
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

  await page.goto("/");
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);

  await page.locator("body").click({ position: { x: 5, y: 5 } });

  const host = page.locator("iframe.music-host");
  await expect(host).toHaveCount(1);
  // Exactly this: `allow-same-origin` would hand a pasted beat the game's storage.
  await expect(host).toHaveAttribute("sandbox", "allow-scripts");
  await expect.poll(() => messageTypes(page), { timeout: 3_000 }).toContain("playing");
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

  await page.goto("/music-host.html");
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
  await page.goto("/");
  await page.evaluate(
    (source) =>
      new Promise<void>((resolve) => {
        const frame = document.createElement("iframe");
        frame.src = "/music-host.html";
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
  await page.goto("/");
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
