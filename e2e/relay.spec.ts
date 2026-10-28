import { expect, test, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";

/**
 * A TURN relay by invite link (#972): what only a browser can tell is that
 * the link leaves the address bar before anything is asked, that nothing is
 * saved until Use, and that Options shows and forgets what was saved. No
 * relay is reached: none of this connects anywhere.
 */

const RELAY = {
  urls: ["turn:turn.example:3478"],
  username: "ana",
  credential: "s3cret",
};

const RELAY_KEY = `${STORAGE_NAMESPACE}.turn-relay`;

function link(value: unknown): string {
  return `./#turn=${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}

async function savedRelay(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), RELAY_KEY);
}

async function openRelayOptions(page: Page): Promise<void> {
  await page.locator("#screens").getByRole("button", { name: "options" }).click();
  await page.locator('.options-entry[data-section="relay"]').click();
  await expect(page.locator(".relay-section")).toBeVisible();
}

test("(1) a relay link asks first; Use saves it, Options shows its host, Forget removes it", async ({
  page,
}) => {
  await page.goto(link(RELAY));
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toContainText("Use relay turn.example for connections?");
  // Gone from the address bar while the question is still open.
  expect(new URL(page.url()).hash).toBe("");
  expect(await savedRelay(page)).toBeNull();

  // The e2e build is the Pages build: the relay is saved there too (#1269).
  await expect(prompt).not.toContainText("visit");
  await prompt.getByRole("button", { name: "Use" }).click();
  await expect(prompt).toHaveCount(0);
  expect(JSON.parse((await savedRelay(page)) ?? "null")).toEqual(RELAY);
  // A reload, as after a new deploy, keeps it.
  await page.reload();

  await openRelayOptions(page);
  await expect(page.locator(".relay-current")).toHaveText("Relay: turn.example");
  // The credential is a password field: masked, never shown as text.
  await expect(page.locator(".relay-credential")).toHaveAttribute("type", "password");
  await expect(page.locator(".relay-section")).not.toContainText("s3cret");

  await page.getByRole("button", { name: "Forget relay" }).click();
  await expect(page.locator(".relay-current")).toHaveText("Relay: None");
  expect(await savedRelay(page)).toBeNull();
});

test("(2) Ignore saves nothing, and only turn= leaves the fragment", async ({ page }) => {
  await page.goto(`${link(RELAY)}&keep=1`);
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toBeVisible();
  expect(new URL(page.url()).hash).toBe("#keep=1");
  await prompt.getByRole("button", { name: "Ignore" }).click();
  await expect(prompt).toHaveCount(0);
  expect(await savedRelay(page)).toBeNull();
});

test("(3) a malformed link says so once, asks nothing and saves nothing", async ({ page }) => {
  await page.goto(link({ ...RELAY, urls: ["stun:turn.example"] }));
  await expect(
    page.locator(".screen-problem", { hasText: "relay link is not valid" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Relay link" })).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("");
  expect(await savedRelay(page)).toBeNull();
});

test("(4) framed by another page, a relay link asks nothing: it says to open it in its own tab", async ({
  page,
}) => {
  await page.goto("./");
  const src = new URL(link(RELAY), page.url()).href;
  await page.setContent(`<iframe src="${src}" width="1024" height="768"></iframe>`);
  const game = page.frameLocator("iframe");
  await expect(
    game.locator(".screen-problem", { hasText: "Open the relay link in its own tab" }),
  ).toBeVisible();
  await expect(game.getByRole("dialog", { name: "Relay link" })).toHaveCount(0);
  expect(await savedRelay(page)).toBeNull();
});

test("(5) a saved relay of the wrong shape is removed, and the menu says so once", async ({
  page,
}) => {
  await page.goto("./");
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: RELAY_KEY, value: JSON.stringify({ ...RELAY, urls: ["stun:turn.example"] }) },
  );
  await page.reload();
  const notice = page.locator(".screen-problem", { hasText: "Saved relay was unreadable" });
  await expect(notice).toBeVisible();
  expect(await savedRelay(page)).toBeNull();
  await page.reload();
  await page.locator(".screen-menu").waitFor();
  await expect(notice).toHaveCount(0);
});

test("(6) a relay link pasted into an open tab is taken out of the address bar and asked about", async ({
  page,
}) => {
  await page.goto("./#keep=1");
  await page.locator(".screen-menu").waitFor();
  // The same document: only the fragment changes, nothing reloads.
  await page.goto(`${link(RELAY)}&keep=1`);
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toContainText("Use relay turn.example for connections?");
  expect(new URL(page.url()).hash).toBe("#keep=1");
  await prompt.getByRole("button", { name: "Ignore" }).click();

  await page.goto(link({ ...RELAY, urls: ["stun:turn.example"] }));
  await expect(page.locator(".toast", { hasText: "relay link is not valid" })).toBeVisible();
  expect(new URL(page.url()).hash).toBe("");
  await expect(prompt).toHaveCount(0);
});

test("(7) a second link replaces the open prompt rather than stacking on it", async ({ page }) => {
  await page.goto(link(RELAY));
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toContainText("turn.example");
  await page.goto(link({ ...RELAY, urls: ["turn:second.example"] }));
  await expect(prompt).toContainText("Use relay second.example for connections?");
  await expect(prompt).toHaveCount(1);
  await prompt.getByRole("button", { name: "Ignore" }).click();
  await expect(prompt).toHaveCount(0);
});
