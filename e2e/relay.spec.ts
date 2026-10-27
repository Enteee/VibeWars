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

test("(1) a relay link asks first; Use saves it, Options shows its host, Forget leaves None", async ({
  page,
}) => {
  await page.goto(link(RELAY));
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toContainText("Use relay turn.example for connections?");
  // Gone from the address bar while the question is still open.
  expect(new URL(page.url()).hash).toBe("");
  expect(await savedRelay(page)).toBeNull();

  await prompt.getByRole("button", { name: "Use" }).click();
  await expect(prompt).toHaveCount(0);
  expect(JSON.parse((await savedRelay(page)) ?? "null")).toEqual(RELAY);

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
