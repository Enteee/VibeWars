import { expect, test, type Page } from "@playwright/test";

import { codeLabel } from "../apps/web/src/input/keymap.js";
import { skillKey } from "./keys.js";

/**
 * Browser tests for local build management (brief §31: create character,
 * create team; §24: import/export).
 *
 * These are the parts that depend on IndexedDB, which no headless test
 * exercises — the repository tests run against an in-memory store. What
 * is being checked here is that persistence actually works in a browser
 * and survives a reload.
 */

/** The roster lives on the entry screen, so the editor is one click away. */
async function newCharacter(page: Page): Promise<void> {
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  await page.getByRole("button", { name: "new character" }).click();
  await expect(page.locator("input.editor-name")).toBeVisible();
}

test("a character can be created, named and saved", async ({ page }) => {
  await newCharacter(page);

  const nameInput = page.locator("input.editor-name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Test Warrior");

  // A fresh character has no attributes spent and an empty bar, which is
  // a legal build — so it must be saveable.
  const save = page.getByRole("button", { name: "save", exact: true });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.locator(".roster")).toContainText("Test Warrior");
});

test("a saved character survives a page reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Persistent");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Persistent");

  // The real assertion: it came back from IndexedDB, not from memory.
  await page.reload();
  await expect(page.locator(".roster")).toContainText("Persistent");
});

test("a character shown in the roster survives leaving the page at once, even on a slow disk", async ({
  page,
}) => {
  // Every other test waits on the roster before navigating, trusting that
  // the roster only shows a save once it has committed. Hold each write
  // transaction open ~500 ms, as a loaded CI runner can (#100), and check
  // that trust holds: leaving straight away must not lose the character.
  await page.addInitScript(`
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      const until = Date.now() + 500;
      const keepOpen = () => {
        if (Date.now() < until) this.count().onsuccess = keepOpen;
      };
      keepOpen();
      return request;
    };
  `);
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Slow Disk");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Slow Disk");

  await page.goto("./");
  await expect(page.locator(".roster")).toContainText("Slow Disk");
});

test("spending attribute points updates the remaining budget", async ({ page }) => {
  await newCharacter(page);

  const budget = page.locator(".editor-points");
  const before = (await budget.textContent()) ?? "";

  await page.locator(".editor-attribute button", { hasText: "+" }).first().click();

  await expect(budget).not.toHaveText(before);
});

test("a team can be created and persists", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "teams" }).click();
  await expect(page.getByRole("heading", { name: "teams" })).toBeVisible();

  await page.getByRole("button", { name: "new team" }).click();
  await expect(page.locator(".entity-name")).toContainText("members");

  await page.reload();
  await page.getByRole("button", { name: "teams" }).click();
  await expect(page.locator(".entity-name")).toContainText("members");
});

test("a build exports to text and imports back", async ({ page }) => {
  await newCharacter(page);
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
  await newCharacter(page);

  await page.locator("textarea.editor-transfer").fill('{"format":"vibewars.character"');
  await page.getByRole("button", { name: "import", exact: true }).click();

  // The failure a player will actually hit: a chat client clipped the
  // message. It must say so, not throw and leave a blank screen.
  await expect(page.locator(".editor-share-status")).toContainText("Could not import");
  await expect(page.locator("input.editor-name")).toBeVisible();
});

test("a build from another game is refused", async ({ page }) => {
  await newCharacter(page);

  await page.locator("textarea.editor-transfer").fill('{"hero":"someone else\'s format"}');
  await page.getByRole("button", { name: "import", exact: true }).click();

  await expect(page.locator(".editor-share-status")).toContainText("does not look like");
});

test("a saved character can be chosen and is taken into a match", async ({ page }) => {
  // The whole point of the build editor: what you build is what you play.
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Pyro");

  await page.locator(".editor-row select").first().selectOption("elementalist");
  await page.locator(".editor-attribute button", { hasText: "+" }).first().click();
  await page.locator(".skill-box").first().click();
  await page.getByRole("button", { name: "save", exact: true }).click();

  // Saving returns to the entry screen, where the roster is. Clicking the
  // row is how a player chooses who to play.
  const row = page.locator(".roster-row", { hasText: "Pyro" });
  await expect(row).toBeVisible();
  await row.click();
  await expect(row).toHaveClass(/is-active/);

  await page.getByRole("button", { name: "quick match" }).click();
  await expect(page.locator("#viewport canvas")).toBeVisible();

  // The server grants the build's bar, so the HUD shows exactly the one
  // skill that was equipped, not the house loadout, and seven empty slots.
  await expect(page.locator(".hud-skills .hud-skill:not(.is-empty)")).toHaveCount(1);
  await expect(page.locator(".hud-skills .hud-skill.is-empty")).toHaveCount(7);
});

test("in a match, an empty slot's key does nothing; the next key casts its own skill (#347)", async ({
  page,
}) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Gap");
  await page.locator(".editor-row select").first().selectOption("elementalist");
  // Armor of Earth on E, the third slot, with nothing on Q or W.
  await page
    .locator(".skill-box", { hasText: "Armor of Earth" })
    .dragTo(page.locator(".skill-slot").nth(2));
  await page.getByRole("button", { name: "save", exact: true }).click();
  await page.locator(".roster-row", { hasText: "Gap" }).click();
  await page.getByRole("button", { name: "quick match" }).click();
  const energy = page.locator(".hud-bar-energy .hud-bar-label");
  await expect(energy).toContainText("en");

  // Every slot in its place: W is empty, but still labelled W.
  const slots = page.locator(".hud-skills .hud-skill");
  await expect(slots).toHaveCount(8);
  await expect(slots.nth(1)).toHaveClass(/is-empty/);
  await expect(slots.nth(1)).toHaveText(codeLabel(skillKey(1)));
  await expect(slots.nth(2)).toContainText("Armor of Earth");

  const full = await energy.textContent();
  await page.keyboard.press(skillKey(1));
  // Long enough for the server to answer, had it anything to answer.
  await page.waitForTimeout(500);
  await expect(page.locator(".hud-skill.is-casting")).toHaveCount(0);
  await expect(page.locator(".hud-skill .recharge-overlay")).toHaveCount(0);
  await expect(energy).toHaveText(full ?? "");

  // E casts Armor of Earth, not some skill closed up into W.
  await page.keyboard.press(skillKey(2));
  await expect(slots.nth(2).locator(".recharge-overlay")).toHaveCount(1);
  await expect(energy).not.toHaveText(full ?? "");
});

test("a team supports every operation sprint 18 asks for", async ({ page }) => {
  // reorder and duplicate were implemented and unit-tested in
  // team-builder.ts, but no button ever called them.
  for (const name of ["Alpha", "Bravo"]) {
    await newCharacter(page);
    await page.locator("input.editor-name").fill(name);
    await page.getByRole("button", { name: "save", exact: true }).click();
    // The roster re-renders only once the save has committed. Without
    // this wait, the next newCharacter's page.goto unloads the page
    // mid-write, Alpha is lost, and selectOption below waits forever.
    await expect(page.locator(".roster")).toContainText(name);
  }

  await page.getByRole("button", { name: "teams" }).click();
  await page.getByRole("button", { name: "new team" }).click();
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();

  // rename
  await page.locator("input.field-input").first().fill("GvG Practice");

  // add two members
  const picker = page.locator(".menu-row select");
  await picker.selectOption({ label: "Alpha" });
  await page.getByRole("button", { name: "add member" }).click();
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await page.locator(".menu-row select").selectOption({ label: "Bravo" });
  await page.getByRole("button", { name: "add member" }).click();
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();

  await expect(page.locator(".entity-list .entity-name").first()).toContainText("1. Alpha");

  // reorder: Bravo moves to slot 1
  await page.locator(".entity-list .entity-row").nth(1).getByRole("button", { name: "↑" }).click();
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await expect(page.locator(".entity-list .entity-name").first()).toContainText("1. Bravo");

  // duplicate. The team list says "(n members)"; the editor's rows do
  // not, so these assertions cannot pass on the editor still on screen.
  await page.getByRole("button", { name: "duplicate" }).click();
  await expect(page.locator(".entity-name")).toHaveText([/2 members/, /2 members/]);

  // remove a member
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await page
    .locator(".entity-list .entity-row")
    .first()
    .getByRole("button", { name: "remove" })
    .click();
  await page.locator(".entity-row").first().getByRole("button", { name: "edit" }).click();
  await expect(page.locator(".entity-list .entity-row")).toHaveCount(1);

  // delete the team
  await page.getByRole("button", { name: "delete" }).click();
  await expect(page.locator(".entity-name")).toHaveText([/members\)$/]);
});

/**
 * The skill library and the skill bar (drag & drop, tooltips, filter).
 *
 * Drag & drop and hover tooltips cannot be tested headlessly at all —
 * they are pointer behaviour in a real engine — so they belong here.
 */
async function openElementalist(page: Page): Promise<void> {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Pyro");
  await page.locator(".editor-row select").first().selectOption("elementalist");
  await page.locator(".editor-row select").nth(1).selectOption("monk");
}

test("the skill library lists skills grouped by attribute", async ({ page }) => {
  await openElementalist(page);

  const groups = page.locator(".skill-group");
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(1);

  // Every box under a heading belongs to that heading's attribute.
  await expect(
    page.locator(".skill-group", { hasText: "FIRE MAGIC" }).locator(".skill-box"),
  ).toContainText(["Fireball"]);

  // The group header shows the rank, because that is what makes every
  // skill under it better.
  await expect(page.locator(".skill-group-header").first()).toContainText("rank");
});

test("the library filters by name", async ({ page }) => {
  await openElementalist(page);
  const boxes = page.locator(".skill-box");
  const total = await boxes.count();
  expect(total).toBeGreaterThan(1);

  await page.locator("input.skill-search").fill("fire");
  await expect(boxes).toHaveCount(1);
  await expect(boxes.first()).toContainText("Fireball");

  await page.locator("input.skill-search").fill("zzzz");
  await expect(boxes).toHaveCount(0);
  await expect(page.locator(".skill-library-empty")).toBeVisible();

  await page.locator("input.skill-search").fill("");
  await expect(boxes).toHaveCount(total);
});

test("hovering a skill shows a tooltip whose numbers follow the attribute", async ({ page }) => {
  await openElementalist(page);

  const fireball = page.locator(".skill-box", { hasText: "Fireball" });
  await fireball.hover();
  const tip = page.locator(".skill-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("Fire Magic");
  await expect(tip).toContainText("damage");
  await expect(tip).toContainText("10 energy");

  const atZero = /Deals (\d+) damage/.exec(await tip.innerText())?.[1];
  expect(atZero).toBeDefined();

  // Spend points, and the same tooltip must report a bigger number —
  // the description is generated from the effects at the character's
  // actual ranks, not a static string.
  const fireRow = page.locator(".editor-attribute", { hasText: "Fire Magic" });
  for (let i = 0; i < 8; i += 1) {
    await fireRow.getByRole("button", { name: "+" }).click();
  }
  await page.locator(".skill-box", { hasText: "Fireball" }).hover();
  await expect(tip).toBeVisible();
  const atRank = /Deals (\d+) damage/.exec(await tip.innerText())?.[1];

  expect(Number(atRank)).toBeGreaterThan(Number(atZero));
});

test("a skill can be dragged from the library onto a bar slot", async ({ page }) => {
  await openElementalist(page);

  const slot3 = page.locator(".skill-slot").nth(2);
  await expect(slot3).toContainText("empty");

  await page.locator(".skill-box", { hasText: "Fireball" }).dragTo(slot3);

  await expect(page.locator(".skill-slot").nth(2)).toContainText("Fireball");
});

test("dragging one slot onto another swaps them instead of losing a skill", async ({ page }) => {
  await openElementalist(page);

  await page.locator(".skill-box", { hasText: "Fireball" }).click();
  await page.locator(".skill-box", { hasText: "Orison of Healing" }).click();
  await expect(page.locator(".skill-slot").nth(0)).toContainText("Fireball");
  await expect(page.locator(".skill-slot").nth(1)).toContainText("Orison");

  await page.locator(".skill-slot").nth(0).dragTo(page.locator(".skill-slot").nth(1));

  await expect(page.locator(".skill-slot").nth(0)).toContainText("Orison");
  await expect(page.locator(".skill-slot").nth(1)).toContainText("Fireball");
});

test("a skill can be removed from the bar", async ({ page }) => {
  await openElementalist(page);
  await page.locator(".skill-box", { hasText: "Fireball" }).click();
  await expect(page.locator(".skill-slot").nth(0)).toContainText("Fireball");

  await page.locator(".skill-slot").nth(0).locator(".skill-slot-clear").click();

  await expect(page.locator(".skill-slot").nth(0)).toContainText("empty");
});

test("the in-match skill bar is not draggable", async ({ page }) => {
  // Builds are fixed once a match starts; the HUD must not offer an
  // interaction the server would refuse.
  await page.goto("./");
  await page.getByRole("button", { name: "quick match" }).click();
  await expect(page.locator("#viewport canvas")).toBeVisible();

  const hudSkills = page.locator(".hud-skill");
  await expect(hudSkills.first()).toBeVisible();
  for (const handle of await hudSkills.all()) {
    expect(await handle.getAttribute("draggable")).not.toBe("true");
  }
  await expect(page.locator(".skill-library")).toHaveCount(0);
});

/**
 * A character record in a shape this build does not read: no equipment,
 * and a schema version that is not the current one. Written straight
 * into the real browser store, because `repository.test.ts` runs against
 * an in-memory one and the two differ in exactly the ways that bite
 * (structured clone, keys, transaction lifetimes).
 */
const STALE_CHARACTER = {
  schemaVersion: 99,
  id: "stale-e2e-1",
  name: "Veteran",
  primaryProfession: "warrior",
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 12 }],
  skillBar: ["warrior.sever-artery-lite", null, null, null, null, null, null, null],
  updatedAt: 1_700_000_000_000,
};

/**
 * Run IndexedDB code in the page and wait for it to finish.
 *
 * Passed as source text rather than a function: this runs in the page,
 * where `indexedDB` lives, and the e2e tsconfig deliberately has no DOM
 * lib — typing it here would mean either a lie or a pile of casts. Once
 * per call, not an init script, so a reload does not quietly re-seed it.
 */
async function inCharacterStore(page: Page, body: string): Promise<unknown> {
  return page.evaluate(`
    new Promise((resolve, reject) => {
      const open = indexedDB.open("vibewars", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        // Resolve on the commit, not the request: the caller reloads
        // next, and an uncommitted write does not survive that.
        const tx = open.result.transaction("characters", "readwrite");
        const request = (${body})(tx.objectStore("characters"));
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        tx.oncomplete = () => resolve(request.result ?? null);
      };
    })
  `);
}

test("a stale saved character is discarded, the player is told once, and it stays gone", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator(".roster")).toBeVisible();
  const record = JSON.stringify(STALE_CHARACTER);
  await inCharacterStore(
    page,
    `(store) => store.put(${record}, ${JSON.stringify(STALE_CHARACTER.id)})`,
  );

  await page.reload();
  const roster = page.locator(".roster");
  await expect(roster).toBeVisible();
  await expect(roster.locator(".screen-problem")).toHaveText(
    "A saved character from an older build of the game could not be read and was discarded.",
  );
  await expect(roster).not.toContainText("Veteran");

  // Deleted, not hidden: the record is gone from the real store, and the
  // notice does not come back on the next visit.
  expect(
    await inCharacterStore(page, `(store) => store.get(${JSON.stringify(STALE_CHARACTER.id)})`),
  ).toBeNull();
  await page.reload();
  await expect(page.locator(".roster")).toBeVisible();
  await expect(page.locator(".roster .screen-problem")).toHaveCount(0);
});

/* --- gear ----------------------------------------------------------------- */

/** Open the gear library in the right-hand column. */
async function openGearLibrary(page: Page): Promise<void> {
  await page.getByRole("button", { name: "gear", exact: true }).click();
  await expect(page.locator(".gear-box").first()).toBeVisible();
}

/**
 * Drag one element onto another with a real HTML5 drag sequence.
 *
 * Playwright's `dragTo` synthesizes mouse movement, which is unreliable
 * when the source sits inside the library's own scroll container and
 * the target is outside it — the page scrolls mid-gesture and the drop
 * lands nowhere. This dispatches the same `dragstart`/`dragover`/`drop`
 * events the browser would, through a real `DataTransfer`, so the
 * application's own handlers are genuinely exercised. The mouse-driven
 * path is covered separately by the weapon-drag test below.
 */
async function dragGear(page: Page, fromSelector: string, toSelector: string): Promise<void> {
  await page.evaluate(
    ([from, to]) => {
      const source = document.querySelector(from);
      const target = document.querySelector(to);
      if (source === null || target === null) {
        throw new Error(`drag needs both ${from} and ${to}`);
      }
      const dataTransfer = new DataTransfer();
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer }));
      target.dispatchEvent(
        new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }),
      );
      target.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }),
      );
    },
    [fromSelector, toSelector] as const,
  );
}

/** Click a library entry by its visible name. */
async function equipFromLibrary(page: Page, name: string): Promise<void> {
  await page.locator(".gear-box").filter({ hasText: name }).first().click();
}

test("gear is equipped from a library, like skills are", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  const weaponSlot = page.locator(".gear-slot").first();
  const stats = page.locator(".gear-stats");

  // A new character is a warrior: sword and shield, 80 + 8 armor.
  await expect(weaponSlot).toContainText("Sword");
  await expect(stats).toContainText("88");

  await equipFromLibrary(page, "Hammer");
  await expect(weaponSlot).toContainText("Hammer");
  // A hammer needs both hands, so the shield comes off and armor falls
  // back to the warrior's own 80.
  await expect(stats).toContainText("80");
  await expect(page.locator(".gear-slot").nth(1)).toContainText("both hands full");
});

test("a weapon can be dragged from the library onto the weapon slot", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  await page
    .locator(".gear-box")
    .filter({ hasText: "Recurve Bow" })
    .first()
    .dragTo(page.locator(".gear-slot").first());

  await expect(page.locator(".gear-slot").first()).toContainText("Recurve Bow");
});

test("a rune dropped on an armor piece shows what it costs", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  const stats = page.locator(".gear-stats");
  await expect(stats).toContainText("500");

  const runeBox = page
    .locator(".gear-box")
    .filter({ hasText: "Superior Rune of Swordsmanship" })
    .first();
  await expect(runeBox).toHaveCount(1);
  await runeBox.evaluate((node) => {
    node.id = "drag-source";
  });
  await dragGear(page, "#drag-source", ".armor-row .gear-slot:nth-child(3)");

  const headRune = page.locator(".armor-row").first().locator(".gear-slot").nth(1);
  await expect(headRune).toContainText("Superior Rune of Swordsmanship");
  // +3 Swordsmanship, paid for with 75 health — both halves on screen.
  await expect(stats).toContainText("425");
  await expect(stats).toContainText("+3");
});

test("dragging worn gear back to the library takes it off", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  await equipFromLibrary(page, "Survivor Insignia");
  const headInsignia = page.locator(".armor-row").first().locator(".gear-slot").first();
  await expect(headInsignia).toContainText("Survivor");

  await dragGear(page, ".armor-row .gear-slot", ".skill-library");
  await expect(headInsignia).toContainText("empty");
});

test("the × on a worn piece clears it", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);
  await equipFromLibrary(page, "Survivor Insignia");

  const headInsignia = page.locator(".armor-row").first().locator(".gear-slot").first();
  await headInsignia.getByRole("button", { name: "×" }).click();
  await expect(headInsignia).toContainText("empty");
});

test("an unmet weapon requirement is called out before the match, not during", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);

  await equipFromLibrary(page, "Hammer");
  await expect(page.locator(".gear-warning")).toBeVisible();

  // Train the attribute the hammer needs and the warning goes away.
  const hammerRow = page.locator(".editor-attribute").filter({ hasText: "Hammer Mastery" });
  for (let i = 0; i < 9; i += 1) {
    await hammerRow.getByRole("button", { name: "+" }).click();
  }
  await expect(page.locator(".gear-warning")).toHaveCount(0);
});

test("a chosen weapon and insignia survive a reload", async ({ page }) => {
  await newCharacter(page);
  await page.locator("input.editor-name").fill("Gear Keeper");
  await openGearLibrary(page);
  await equipFromLibrary(page, "Axe");
  await equipFromLibrary(page, "Survivor Insignia");
  await page.getByRole("button", { name: "save", exact: true }).click();
  await expect(page.locator(".roster")).toContainText("Gear Keeper");

  // The real assertion: gear came back from IndexedDB, not from memory.
  await page.reload();
  await page
    .locator(".roster-row")
    .filter({ hasText: "Gear Keeper" })
    .getByRole("button", { name: "edit" })
    .click();

  await expect(page.locator(".gear-slot").first()).toContainText("Axe");
  await expect(page.locator(".armor-row").first().locator(".gear-slot").first()).toContainText(
    "Survivor",
  );
});

test("the library remembers which tab you were on while you build", async ({ page }) => {
  await newCharacter(page);
  await openGearLibrary(page);
  // Equipping re-renders the whole editor; the tab must not snap back.
  await equipFromLibrary(page, "Axe");
  await expect(page.locator(".library-tab.is-active")).toHaveText("gear");
});

/* --- beside the Training Ground arena (#10) ------------------------------- */

test("the editor still works beside a live arena, which none of it recreates", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await openElementalist(page);
  const arena = page.locator(".training canvas");
  await expect(arena).toBeVisible();
  const original = await arena.elementHandle();

  const fireRow = page.locator(".editor-attribute", { hasText: "Fire Magic" });
  await fireRow.getByRole("button", { name: "+" }).click();
  await expect(fireRow).toContainText("1");

  await page.locator("input.skill-search").fill("fire");
  await expect(page.locator(".skill-library .skill-box")).toHaveCount(1);

  await page
    .locator(".skill-box", { hasText: "Fireball" })
    .dragTo(page.locator(".skill-slot").nth(2));
  await expect(page.locator(".skill-slot").nth(2)).toContainText("Fireball");

  await page.locator(".skill-box", { hasText: "Fireball" }).hover();
  await expect(page.locator(".skill-tip")).toBeVisible();

  // Every one of those re-rendered the editor. The arena is the same one.
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
});

test("the arena survives the editor collapsing to one column", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await newCharacter(page);
  const arena = page.locator(".training canvas");
  await expect(arena).toBeVisible();
  const original = await arena.elementHandle();

  await page.setViewportSize({ width: 600, height: 900 });
  const training = await page.locator(".training").boundingBox();
  const editor = await page.locator(".editor").boundingBox();
  expect(training?.x).toBe(editor?.x);

  await expect(page.locator("canvas")).toHaveCount(1);
  expect(await original.evaluate((node) => node.isConnected)).toBe(true);
  await expect(arena).toBeVisible();
});
