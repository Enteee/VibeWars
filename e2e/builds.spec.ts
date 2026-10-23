import { expect, test, type Page } from "@playwright/test";

/**
 * Browser tests for local build management (brief §31: create character,
 * create team; §24: import/export).
 *
 * These are the parts that depend on IndexedDB, which no headless test
 * exercises — the repository tests run against an in-memory store. What
 * is being checked here is that persistence actually works in a browser
 * and survives a reload.
 */

async function openCharacters(page: Page): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "characters" }).click();
  await expect(page.getByRole("heading", { name: "characters" })).toBeVisible();
}

test("a character can be created, named and saved", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();

  const nameInput = page.locator("input.editor-name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Test Warrior");

  // A fresh character has no attributes spent and an empty bar, which is
  // a legal build — so it must be saveable.
  const save = page.getByRole("button", { name: "save", exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.locator(".entity-name")).toContainText("Test Warrior");
});

test("a saved character survives a page reload", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Persistent");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".entity-name")).toContainText("Persistent");

  // The real assertion: it came back from IndexedDB, not from memory.
  await page.reload();
  await page.getByRole("button", { name: "characters" }).click();
  await expect(page.locator(".entity-name")).toContainText("Persistent");
});

test("spending attribute points updates the remaining budget", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();

  const budget = page.locator(".editor-points");
  const before = (await budget.textContent()) ?? "";

  await page.locator(".editor-attribute button", { hasText: "+" }).first().click();

  await expect(budget).not.toHaveText(before);
});

test("a team can be created and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "teams" }).click();
  await expect(page.getByRole("heading", { name: "teams" })).toBeVisible();

  await page.getByRole("button", { name: "new team" }).click();
  await expect(page.locator(".entity-name")).toContainText("members");

  await page.reload();
  await page.getByRole("button", { name: "teams" }).click();
  await expect(page.locator(".entity-name")).toContainText("members");
});

test("a build exports to text and imports back", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Shared Build");

  await page.getByRole("button", { name: "export" }).click();
  const exported = await page.locator("textarea.editor-transfer").inputValue();
  expect(exported).toContain("vibewars.character");
  expect(exported).toContain("Shared Build");

  // Reopen a *different* character, then import the text into it. This is
  // the real flow: someone pastes a build they were sent.
  await page.getByRole("button", { name: "close" }).click();
  await page.getByRole("button", { name: "new character" }).click();
  await page.locator("input.editor-name").fill("Scratch");

  await page.locator("textarea.editor-transfer").fill(exported);
  await page.getByRole("button", { name: "import", exact: true }).click();

  await expect(page.locator("input.editor-name")).toHaveValue("Shared Build");
});

test("a mangled build is refused with a readable reason", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();

  await page.locator("textarea.editor-transfer").fill('{"format":"vibewars.character"');
  await page.getByRole("button", { name: "import", exact: true }).click();

  // The failure a player will actually hit: a chat client clipped the
  // message. It must say so, not throw and leave a blank screen.
  await expect(page.locator(".editor-share-status")).toContainText("Could not import");
  await expect(page.locator("input.editor-name")).toBeVisible();
});

test("a build from another game is refused", async ({ page }) => {
  await openCharacters(page);
  await page.getByRole("button", { name: "new character" }).click();

  await page.locator("textarea.editor-transfer").fill('{"hero":"someone else\'s format"}');
  await page.getByRole("button", { name: "import", exact: true }).click();

  await expect(page.locator(".editor-share-status")).toContainText("does not look like");
});
