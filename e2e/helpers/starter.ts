import { expect, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../../apps/web/src/storage/build-transfer.js";
import { STARTER_BUILDS } from "../../packages/game-core/src/starter-builds.js";
import { skillKey } from "../keys.js";
import { openRail, pickCharacter } from "./menu.js";

/**
 * A known bar for a spec that presses skill keys (#852). A player with no
 * character is handed a starter build at random, so a spec that needs a
 * particular skill in a particular slot brings one of the starter builds
 * as a character first, the way a player would: pasted into the build
 * editor, saved, and picked on Random Arena.
 */

function starter(name: string) {
  const build = STARTER_BUILDS.find((candidate) => candidate.name === name);
  if (build === undefined) {
    throw new Error(`no starter build ${name}`);
  }
  return build;
}

/** Paste `text` onto `target`, as Ctrl+V would. */
async function paste(target: Locator, text: string): Promise<void> {
  await target.evaluate((element, pasted) => {
    const data = new DataTransfer();
    data.setData("text/plain", pasted);
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, text);
}

/** Save the starter build `name` as a character and pick it; on the menu after. */
export async function bringStarter(page: Page, name: string): Promise<void> {
  const build = starter(name);
  await page.goto("./");
  await openRail(page, "Character Builder");
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
  // The build editor's import format (apps/web/src/storage/build-transfer.ts).
  const shared = JSON.stringify({
    format: "vibewars.character",
    formatVersion: BUILD_FORMAT_VERSION,
    ...build,
    secondaryProfession: build.secondaryProfession ?? null,
  });
  await paste(page.locator(".editor"), shared);
  await expect(page.locator(".toast")).toHaveText(`Imported ${name}`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Saving returns to Character Builder; a click on the card on Random
  // Arena picks who to play. Newest first, should two share the name.
  await expect(page.locator(".screen-characters")).toBeVisible();
  await pickCharacter(page, name);
}

/** The key that casts `skillId` for a player of the starter build `name`. */
export function starterKey(name: string, skillId: string): string {
  const slot = starter(name).skillBar.indexOf(skillId);
  if (slot === -1) {
    throw new Error(`${name} has no ${skillId}`);
  }
  return skillKey(slot);
}
