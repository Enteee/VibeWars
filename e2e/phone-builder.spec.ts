import { expect, test, type Browser, type Page } from "@playwright/test";

import { showRail } from "./helpers/menu.js";
import { PIXEL_8A_LANDSCAPE, PIXEL_8A_PORTRAIT, phoneOffenders } from "./helpers/phone.js";
import { chooseProfession } from "./helpers/professions.js";

/**
 * The Character Builder on a phone (#3927), measured: a new character
 * and a saved one, without and with the training panel, at the top of
 * its scroll and at the end, in a language of each shape. Nothing
 * scrolls sideways, every control is a finger's size and no two of
 * them share any ground.
 */

const DEVICES = [
  {
    held: "upright at 360",
    device: { ...PIXEL_8A_PORTRAIT, viewport: { width: 360, height: 800 } },
  },
  { held: "upright", device: PIXEL_8A_PORTRAIT },
  { held: "on its side", device: PIXEL_8A_LANDSCAPE },
] as const;

const LOCALES = ["en", "de", "ar"] as const;

/** What the builder's controls get by `phoneOffenders`. */
const SCOPE = ["#screens"];

/**
 * Which two controls on screen share ground, one line per pair. A
 * control's box is the part its scrolling boxes show; one inside the
 * other is a single control. The pinned skill bar going over what
 * scrolls under it is #3952's and not counted here.
 */
async function overlapping(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll("#screens :is(button, [role=button], select, input)"),
    ];
    const name = (node: Element): string =>
      `${node.tagName.toLowerCase()}.${node.className} "${(node.textContent.trim() || (node.getAttribute("aria-label") ?? "")).slice(0, 24)}"`;
    const seen: { node: Element; box: DOMRect }[] = [];
    for (const node of controls) {
      if (getComputedStyle(node).visibility === "hidden") continue;
      const own = node.getBoundingClientRect();
      if (own.width === 0 || own.height === 0) continue;
      let { left, top, right, bottom } = own;
      for (let clip = node.parentElement; clip !== null; clip = clip.parentElement) {
        if (getComputedStyle(clip).overflow === "visible") continue;
        const edge = clip.getBoundingClientRect();
        left = Math.max(left, edge.left);
        top = Math.max(top, edge.top);
        right = Math.min(right, edge.right);
        bottom = Math.min(bottom, edge.bottom);
      }
      if (right - left < 1 || bottom - top < 1) continue;
      seen.push({ node, box: new DOMRect(left, top, right - left, bottom - top) });
    }
    const pinned = (node: Element): boolean => node.closest(".editor-skills") !== null;
    const out: string[] = [];
    for (const [index, a] of seen.entries()) {
      for (const b of seen.slice(index + 1)) {
        if (a.node.contains(b.node) || b.node.contains(a.node)) continue;
        if (pinned(a.node) !== pinned(b.node)) continue;
        const wide = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const high = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (wide > 0.5 && high > 0.5) out.push(`${name(a.node)} over ${name(b.node)}`);
      }
    }
    return out;
  });
}

/** Scroll the editor's page to its top, or as far down as it goes. */
async function scrollEditor(page: Page, to: "top" | "end"): Promise<void> {
  await page.locator(".editor-layout").evaluate((node, to) => {
    for (let up: Element | null = node; up !== null; up = up.parentElement) {
      const overflow = getComputedStyle(up).overflowY;
      if (overflow === "auto" || overflow === "scroll" || up === document.scrollingElement) {
        up.scrollTop = to === "top" ? 0 : up.scrollHeight;
      }
    }
  }, to);
}

/** Everything wrong with the builder as it stands, at its top and at its end. */
async function offences(page: Page, what: string): Promise<string[]> {
  const out: string[] = [];
  for (const at of ["top", "end"] as const) {
    await scrollEditor(page, at);
    const where = `${what}, ${at}`;
    for (const line of await phoneOffenders(page, SCOPE)) out.push(`${where}: ${line}`);
    for (const line of await overlapping(page)) out.push(`${where}: ${line}`);
  }
  return out;
}

/**
 * The builder in one language, new and empty, its bar filled, its
 * training ground expanded, and saved and opened again: everything it
 * found wrong.
 */
async function audit(
  browser: Browser,
  device: (typeof DEVICES)[number]["device"],
  locale: string,
): Promise<string[]> {
  const context = await browser.newContext({ ...device, locale });
  const page = await context.newPage();
  await page.goto("./");
  await showRail(page);
  await page.locator('.mode-rail [data-entry="characters"]').tap();
  await page.locator(".play-card-new").tap();
  await expect(page.locator("input.editor-name")).toBeVisible();
  const out = await offences(page, `${locale}, new`);
  // A full bar: every slot has its ×, every name its length.
  await chooseProfession(page, "primary", "elementalist");
  await page.locator(".skill-library button.skill-group-header").first().tap();
  for (let filled = 0; filled < 8; filled += 1) {
    await page
      .locator(".skill-library .skill-box:not(.is-elite) .skill-box-equip:visible")
      .first()
      .tap();
  }
  await expect(page.locator(".editor-skills .skill-slot-clear")).toHaveCount(8);
  out.push(...(await offences(page, `${locale}, filled`)));
  const expand = page.locator(".training-expand");
  await expand.tap();
  await expect(page.locator(".training.is-expanded")).toBeVisible();
  out.push(...(await offences(page, `${locale}, expanded`)));
  await expand.tap();
  await expect(page.locator(".training.is-expanded")).toHaveCount(0);
  await page.locator("input.editor-name").fill("Thumbs");
  // Save is the way out (#1902): back on the roster, Edit opens it again.
  await page.locator("#topbar button.primary").tap();
  await page.locator(".character-card", { hasText: "Thumbs" }).locator(".roster-edit").tap();
  await expect(page.locator("input.editor-name")).toHaveValue("Thumbs");
  out.push(...(await offences(page, `${locale}, saved`)));
  await context.close();
  return out;
}

for (const { held, device } of DEVICES) {
  test(`held ${held}, the Character Builder fits the phone in every shape of language (#3927)`, async ({
    browser,
  }) => {
    test.slow();
    const out: string[] = [];
    for (const locale of LOCALES) out.push(...(await audit(browser, device, locale)));
    expect(out).toEqual([]);
  });
}
