import { expect, test, type Page } from "@playwright/test";

import { STORAGE_NAMESPACE } from "./helpers/base.js";

/**
 * A TURN relay by invite link (#972): what only a browser can tell is that
 * the link leaves the address bar before anything is asked, that nothing is
 * saved until Use, and that Options shows and forgets what was saved. No
 * relay is reached: none of this connects anywhere.
 */

/** What a friend's invite link carries (#2240): URLs and a secret for this friend alone. */
const RELAY = {
  urls: ["turn:turn.example:3478"],
  secret: "ab".repeat(32),
};

/** A TURN login: typed into Options it is a static relay, in a link it is malformed (#2240). */
const LOGIN = {
  urls: ["turn:turn.example:3478"],
  username: "ana",
  credential: "s3cret",
};

const RELAY_KEY = `${STORAGE_NAMESPACE}.turn-relay`;
const SHARING_KEY = `${STORAGE_NAMESPACE}.turn-share`;

function link(value: unknown): string {
  return `./#turn=${Buffer.from(JSON.stringify(value)).toString("base64url")}`;
}

async function savedRelay(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), RELAY_KEY);
}

async function savedSharing(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SHARING_KEY);
}

async function openRelayOptions(page: Page): Promise<void> {
  await page.locator(".topbar-options").click();
  await page.locator('.options-entry[data-section="relay"]').click();
  await expect(page.locator(".relay-section")).toBeVisible();
}

test("(1) a relay link asks first; Use saves and shares it, Options shows its host, Forget removes it", async ({
  page,
}) => {
  await page.goto(link(RELAY));
  const prompt = page.getByRole("dialog", { name: "Relay link" });
  await expect(prompt).toContainText("Use relay turn.example for connections?");
  // Use shares it with the player's lobbies, and the prompt says so (#2240).
  await expect(prompt).toContainText("Your lobbies will offer this relay to their players.");
  // Gone from the address bar while the question is still open.
  expect(new URL(page.url()).hash).toBe("");
  expect(await savedRelay(page)).toBeNull();

  // The e2e build is the Pages build: the relay is saved there too (#1269).
  await expect(prompt).not.toContainText("visit");
  await prompt.getByRole("button", { name: "Use" }).click();
  await expect(prompt).toHaveCount(0);
  expect(JSON.parse((await savedRelay(page)) ?? "null")).toEqual({ kind: "rest", ...RELAY });
  expect(await savedSharing(page)).toBeNull();
  // A reload, as after a new deploy, keeps it.
  await page.reload();

  await openRelayOptions(page);
  await expect(page.locator(".relay-current")).toHaveText("Relay: turn.example");
  await expect(
    page.getByRole("checkbox", { name: "Share my relay with my lobbies" }),
  ).toBeChecked();
  await expect(page.getByRole("button", { name: "Copy invite link" })).toBeEnabled();
  // The secret is never shown, nor a field to edit it.
  await expect(page.locator(".relay-secret")).toHaveText("Secret: from invite link");
  await expect(page.locator(".relay-credential")).toBeHidden();
  await expect(page.locator(".relay-section")).not.toContainText(RELAY.secret);

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

for (const [name, value] of [
  ["a stun: URL", { ...RELAY, urls: ["stun:turn.example"] }],
  // A username and credential is no link's shape any more (#2240).
  ["a username and credential", LOGIN],
] as const) {
  test(`(3) a malformed link, ${name}, says so once, asks nothing and saves nothing`, async ({
    page,
  }) => {
    await page.goto(link(value));
    await expect(
      page.locator(".screen-problem", { hasText: "relay link is not valid" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Relay link" })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe("");
    expect(await savedRelay(page)).toBeNull();
  });
}

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
  // Written where the app never runs: a live page's own relay readers
  // could eat the record before a reload (#2119).
  await page.goto("./build.json");
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    // A TURN login without a kind: the shape a relay was saved in before #2240.
    { key: RELAY_KEY, value: JSON.stringify(LOGIN) },
  );
  await page.goto("./");
  const notice = page.locator(".screen-problem", { hasText: "Saved relay was unreadable" });
  await expect(notice).toBeVisible();
  expect(await savedRelay(page)).toBeNull();
  await page.reload();
  await page.locator(".screen-random-arena").waitFor();
  await expect(notice).toHaveCount(0);
});

test("(6) a relay link pasted into an open tab is taken out of the address bar and asked about", async ({
  page,
}) => {
  await page.goto("./#keep=1");
  await page.locator(".screen-random-arena").waitFor();
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

test("(8) a relay typed into Options is used as is and never shared", async ({ page }) => {
  await page.goto("./");
  await openRelayOptions(page);
  const share = page.getByRole("checkbox", { name: "Share my relay with my lobbies" });
  await expect(share).toBeDisabled();
  await page.locator(".relay-urls").fill(LOGIN.urls.join(", "));
  await page.locator(".relay-username").fill(LOGIN.username);
  await page.locator(".relay-credential").fill(LOGIN.credential);
  await page.getByRole("button", { name: "Save relay" }).click();

  await expect(page.locator(".relay-current")).toHaveText("Relay: turn.example");
  expect(JSON.parse((await savedRelay(page)) ?? "null")).toEqual({ kind: "static", ...LOGIN });
  // The credential is a password field: masked, never shown as text.
  await expect(page.locator(".relay-credential")).toHaveAttribute("type", "password");
  await expect(page.locator(".relay-section")).not.toContainText(LOGIN.credential);
  await expect(share).toBeDisabled();
  await expect(share).not.toBeChecked();
  await expect(page.locator(".relay-share-hint")).toHaveText(
    "Only a relay from an invite link can be shared",
  );
  await expect(page.getByRole("button", { name: "Copy invite link" })).toBeDisabled();

  await page.getByRole("button", { name: "Forget relay" }).click();
  await expect(page.locator(".relay-current")).toHaveText("Relay: None");
  expect(await savedRelay(page)).toBeNull();
});
