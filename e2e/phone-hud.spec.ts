import { expect, test, type Page } from "@playwright/test";

import { key } from "./keys.js";
import { hudMenuRow } from "./helpers/hud-menu.js";
import { enterHouseTeams, enterOwnTeams, hostLobby, saveSoloTeam } from "./helpers/peers.js";
import {
  PIXEL_8A_LANDSCAPE,
  PIXEL_8A_PORTRAIT,
  TOUCH_TARGET,
  expectFitsPhone,
} from "./helpers/phone.js";

/**
 * A phone in a match (#1297, #1306): the HUD's top band is narrower than
 * the scoreboard and target frame beside the match's ☰, so on a phone
 * they lay out apart. Every box here must miss every other, at 390x844 and
 * at 360x740. A Pixel 8a held either way (#3778) also keeps the arena's
 * middle free, its skill bar one row of finger-sized slots.
 */

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PARTS = [
  ".hud-scoreboard",
  ".hud-target",
  ".hud-menu-toggle",
  ".compass",
  ".hud-skills",
  ".weapon-sets",
  ".hud-bars",
  ".party-window",
  ".party-toggle",
  ".chat",
] as const;

/** The phones the HUD must fit. */
const PHONES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
] as const;

interface Phone {
  readonly width: number;
  readonly height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Every box of one frame, the toast's and each part's, null where hidden; and the window's size. */
interface Frame {
  readonly width: number;
  readonly height: number;
  readonly boxes: Record<string, Box | null>;
}

/**
 * Which frame: the last with the toast up (`hudFrame`), or the last at
 * all (`hudNow`), its toast null once it hid. Both only once the bot is
 * targeted.
 */
type FrameName = "hudFrame" | "hudNow";

/**
 * A match against a bot from the menu on show, the bot targeted, the HUD
 * noted; in `lobby`'s size and map when given, else 1v1 on ember-pits. A
 * `touch` phone has no drag to build a Team Build with.
 */
async function phoneMatch(
  page: Page,
  phone: Phone,
  lobby?: { readonly size: 1 | 2 | 4 | 8; readonly map: string },
  touch = false,
): Promise<void> {
  await page.setViewportSize(phone);
  await page.goto("./");
  // A team lobby's own Team Build, proposed, ends the vote at once: with
  // none, the side waits out the vote's 30 s clock for a preset team,
  // which put an 8v8 within seconds of the test's timeout (#3778). It is
  // built at a desktop's width, where a character drags onto a member; a
  // touch page has no drag to build one with, so it waits the clock out.
  let team: string | undefined;
  if (!touch && lobby !== undefined && lobby.size !== 1) {
    await page.setViewportSize({ width: 1280, height: 800 });
    team = await saveSoloTeam(page, lobby.size);
    await page.setViewportSize(phone);
  }
  // The toast hides after a few seconds: note where it is, every frame it
  // shows in the match, as music.spec.ts does (#372). Every other part is
  // noted in that same frame (#1793): the build banner still grows early
  // in a match, so boxes read in different frames come from different
  // layouts.
  await page.evaluate((parts) => {
    const toast = document.querySelector<HTMLElement>(".now-playing");
    const screens = document.querySelector<HTMLElement>("#screens");
    if (toast === null || screens === null) {
      throw new Error("no now-playing toast or #screens");
    }
    /** Its box, or null where it is not shown, as Playwright's `isVisible` judges. */
    const boxOf = (element: Element | null): DOMRectReadOnly | null => {
      if (element === null || getComputedStyle(element).visibility === "hidden") {
        return null;
      }
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0 ? box : null;
    };
    const note = (): void => {
      if (screens.style.display === "none") {
        const boxes: Record<string, unknown> = {
          ".now-playing": toast.hidden ? null : (toast.getBoundingClientRect().toJSON() as unknown),
        };
        for (const part of parts) {
          boxes[part] = boxOf(document.querySelector(part))?.toJSON() ?? null;
        }
        const frame = { width: innerWidth, height: innerHeight, boxes };
        // Only once the bot is targeted, which also means the HUD is up.
        const target = document.querySelector(".hud-target-text")?.textContent ?? "";
        if (target !== "" && target !== "no target") {
          Object.assign(
            window,
            toast.hidden ? { hudNow: frame } : { hudNow: frame, hudFrame: frame },
          );
        }
      }
      requestAnimationFrame(note);
    };
    note();
  }, PARTS);
  await hostLobby(page, lobby);
  // Team 2's empty side plays a house team of bots (#2029).
  await page.getByRole("button", { name: "join team 1" }).click();
  await page.getByRole("button", { name: "Ready", exact: true }).click();
  await page.getByRole("button", { name: "start match" }).click();
  // Any character will do: a 1v1's house team's one seat (#1525), or the
  // own Team Build's first in a team lobby. Targeted
  // while held before the start (#3818): the toast, up as the match's
  // music begins, is gone by the time the countdown is.
  await (team === undefined ? enterHouseTeams([page]) : enterOwnTeams([{ page, team }]));
  await page.keyboard.press(key("target-closest"));
  await expect(page.locator(".hud-target-text")).not.toHaveText("no target");
}

/**
 * What a mouse's 1v1 leaves out: the party toggle, and the party window
 * unless the house handed out a pet, which makes a party of two.
 */
async function soloAbsent(page: Page): Promise<readonly string[]> {
  const pet = (await page.locator(".party-row").count()) > 0;
  return pet ? [".party-toggle"] : [".party-window", ".party-toggle"];
}

/**
 * The `which` frame noted at `phone`'s size: every box in it misses every
 * other. Only fullscreen, which shows only where the browser offers it,
 * and the parts named in `absent` may be missing; those in `ignored` are
 * not measured. Returns the boxes measured.
 */
async function expectApart(
  page: Page,
  {
    which = "hudFrame",
    absent = [],
    ignored = [],
    phone,
  }: {
    readonly which?: FrameName;
    readonly absent?: readonly string[];
    readonly ignored?: readonly string[];
    readonly phone?: Phone;
  } = {},
): Promise<Map<string, Box>> {
  const read = (): Promise<Frame | null> =>
    page.evaluate(
      (name) => (window as unknown as Record<string, Frame | undefined>)[name] ?? null,
      which,
    );
  await expect
    .poll(
      async () => {
        const frame = await read();
        return (
          frame !== null &&
          (phone === undefined || (frame.width === phone.width && frame.height === phone.height))
        );
      },
      { timeout: 5_000 },
    )
    .toBe(true);
  const boxes = new Map<string, Box>();
  for (const [part, box] of Object.entries((await read())?.boxes ?? {})) {
    if (ignored.includes(part)) {
      continue;
    }
    if (box === null) {
      if (!(which === "hudNow" && part === ".now-playing")) {
        expect(absent, `${part} is missing`).toContain(part);
      }
      continue;
    }
    expect(absent, `${part} is shown`).not.toContain(part);
    boxes.set(part, box);
  }
  const named = [...boxes];
  for (const [i, [name, box]] of named.entries()) {
    for (const [other, otherBox] of named.slice(i + 1)) {
      expect(overlaps(box, otherBox), `${name} overlaps ${other}`).toBe(false);
    }
  }
  return boxes;
}

/**
 * The arena's room on `phone` (#3778): every box wholly on screen; the
 * boxes together cover at most half of it, sampled every 8 px; and the
 * centred rectangle `free` (shares of the width and height) misses them all.
 */
function expectArenaFree(
  boxes: ReadonlyMap<string, Box>,
  phone: Phone,
  free: { readonly width: number; readonly height: number },
): void {
  const slack = 0.5;
  for (const [name, box] of boxes) {
    expect(
      box.x >= -slack &&
        box.y >= -slack &&
        box.x + box.width <= phone.width + slack &&
        box.y + box.height <= phone.height + slack,
      `${name} is wholly on screen: ${JSON.stringify(box)}`,
    ).toBe(true);
  }
  let covered = 0;
  let samples = 0;
  for (let y = 4; y < phone.height; y += 8) {
    for (let x = 4; x < phone.width; x += 8) {
      samples += 1;
      const inside = [...boxes.values()].some(
        (box) => x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height,
      );
      covered += inside ? 1 : 0;
    }
  }
  expect(covered / samples, "the HUD covers at most half the arena").toBeLessThanOrEqual(0.5);
  const middle: Box = {
    x: (phone.width * (1 - free.width)) / 2,
    y: (phone.height * (1 - free.height)) / 2,
    width: phone.width * free.width,
    height: phone.height * free.height,
  };
  for (const [name, box] of boxes) {
    expect(overlaps(box, middle), `${name} is in the arena's middle`).toBe(false);
  }
}

/**
 * The skill bar (#3778): eight slots, each a finger's size, in one row along
 * the bottom. A phone narrower than eight fingers shrinks them to `slot`.
 */
async function expectSkillRow(page: Page, phone: Phone, slot = TOUCH_TARGET): Promise<void> {
  const slots = page.locator(".hud-skills > .hud-skill");
  await expect(slots).toHaveCount(8);
  const boxes = await slots.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().toJSON() as Box),
  );
  for (const [i, box] of boxes.entries()) {
    expect(box.width, `slot ${String(i + 1)} width`).toBeGreaterThanOrEqual(slot);
    expect(box.height, `slot ${String(i + 1)} height`).toBeGreaterThanOrEqual(slot);
    expect(box.y, `slot ${String(i + 1)} is in the first's row`).toBeCloseTo(boxes[0]?.y ?? -1, 0);
    expect(box.x + box.width, `slot ${String(i + 1)} is on screen`).toBeLessThanOrEqual(
      phone.width,
    );
  }
  const bottom = (boxes[0]?.y ?? 0) + (boxes[0]?.height ?? 0);
  expect(phone.height - bottom, "the row is along the bottom edge").toBeLessThanOrEqual(24);
}

for (const phone of PHONES) {
  const size = `${String(phone.width)}x${String(phone.height)}`;

  test(`on a ${size} phone the match HUD's top boxes do not overlap (#1297, #1306)`, async ({
    page,
  }) => {
    await phoneMatch(page, phone);
    // Alone on a team, no party window unless the house hands out a pet;
    // a mouse, no party toggle.
    await expectApart(page, { absent: await soloAbsent(page) });
    // In ☰'s list (#3923), named in full, its key shown to a mouse.
    const leave = await hudMenuRow(page, ".hud-leave");
    await expect(leave.getByRole("button", { name: "leave match (F10)" })).toBeVisible();
    await expect(leave).toContainText("F10", { useInnerText: true });
    await page.keyboard.press("Escape");
    // A mouse keeps its keys' hints (#3889).
    await expect(page.locator(".hud-skill-key").first()).toBeVisible();
    await expect(page.locator(".weapon-set-key").first()).toBeVisible();
  });

  test(`on a ${size} phone with the new-version banner up, they still do not (#1297, #1306)`, async ({
    page,
  }) => {
    await page.route("**/build.json", (route) => route.fulfill({ json: { build: "newer" } }));
    await phoneMatch(page, phone);
    await expect(page.locator(".build-banner")).toBeVisible();
    await expectApart(page, { absent: await soloAbsent(page) });
  });

  test(`on a ${size} phone a Guild Battle's long scoreboard wraps clear of them too (#1226)`, async ({
    page,
  }) => {
    // A Guild Hall is played eight a side (#2104).
    await phoneMatch(page, phone, { size: 8, map: "guild-hall-isle" });
    await expect(page.locator(".hud-scoreboard")).toContainText("Lord");
    // A mouse keeps the party window open, under the compass, where the
    // long scoreboard and target frame may reach: a phone collapses it.
    // The toast is not what this measures: an 8v8's load may outlast it.
    await expectApart(page, {
      which: "hudNow",
      absent: [".party-toggle"],
      ignored: [".party-window"],
    });
  });
}

for (const [held, device, free] of [
  ["upright", PIXEL_8A_PORTRAIT, { width: 0.5, height: 0.5 }],
  ["on its side", PIXEL_8A_LANDSCAPE, { width: 0.4, height: 0.3 }],
] as const) {
  test.describe(`a Pixel 8a held ${held} (#3778)`, () => {
    test.use(device);
    const phone = device.viewport;

    test("every HUD part is on screen, apart, the skill bar one row of fingers, the arena's middle free", async ({
      page,
    }) => {
      await phoneMatch(page, phone, undefined, true);
      // A 1v1 has no party, unless the house hands out a pet: then its
      // toggle shows, the panel behind it closed.
      const pet = (await page.locator(".party-row").count()) > 0;
      const boxes = await expectApart(page, {
        absent: pet ? [".party-window"] : [".party-window", ".party-toggle"],
      });
      expectArenaFree(boxes, phone, free);
      await expectSkillRow(page, phone);
    });

    test("in an 8v8 the party window waits behind a toggle a press opens and closes", async ({
      page,
    }) => {
      // A touch page waits out the vote's 30 s clock (see phoneMatch), and
      // an 8v8's 16 bodies load on top of it: ~50 s of a 60 s budget.
      test.slow();
      await phoneMatch(page, phone, { size: 8, map: "ember-pits" }, true);
      // The toast is not what this measures: an 8v8's load may outlast it.
      const boxes = await expectApart(page, { which: "hudNow", absent: [".party-window"] });
      expectArenaFree(boxes, phone, free);
      await expectSkillRow(page, phone);
      const toggle = page.locator(".party-toggle");
      const panel = page.locator(".party-window");
      await expect(toggle).toHaveText("Party");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.click();
      await expect(panel).toBeVisible();
      await expect(panel.locator(".party-row")).toHaveCount(8);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      // Open, it stays inside the window and misses the toggle.
      const [open, button] = await Promise.all([panel.boundingBox(), toggle.boundingBox()]);
      expect(open, "the open party window has a box").not.toBeNull();
      expect(button, "the toggle has a box").not.toBeNull();
      if (open !== null && button !== null) {
        expect(overlaps(open, button), "the open window misses its toggle").toBe(false);
        expect(open.y + open.height, "the open window ends on screen").toBeLessThanOrEqual(
          phone.height,
        );
      }
      await toggle.click();
      await expect(panel).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    test("every control is a finger's size, and no key's hint shows (#3889)", async ({ page }) => {
      await phoneMatch(page, phone, undefined, true);
      const small = await page
        .locator(".hud button, .hud-controls button, #topbar button")
        .filter({ visible: true })
        .evaluateAll(
          (nodes, target) =>
            nodes.flatMap((node) => {
              const { width, height } = node.getBoundingClientRect();
              return width < target || height < target
                ? [`${node.getAttribute("class") ?? ""} ${String(width)}x${String(height)}`]
                : [];
            }),
          TOUCH_TARGET,
        );
      expect(small, "buttons under a finger's size").toEqual([]);
      await expect(
        page.locator(".hud-skill-key, .weapon-set-key").filter({ visible: true }),
      ).toHaveCount(0);
      // In ☰'s list (#3923), "leave" is its word alone.
      const leave = await hudMenuRow(page, ".hud-leave");
      await expect(leave.getByRole("button")).toBeVisible();
      await expect(leave.getByRole("button")).not.toContainText("F10", { useInnerText: true });
      // Each weapon set is told apart by its number instead (#3889).
      await expect(page.locator(".hud .weapon-set")).toHaveText(["1", "2", "3", "4"], {
        useInnerText: true,
      });
    });

    test("a chat line shows nowhere over the arena while the chat is closed", async ({ page }) => {
      await phoneMatch(page, phone, undefined, true);
      const chat = page.locator("#viewport > .chat");
      // A line in, as the host's own: the icon is not marked for it, and it
      // shows nowhere over the arena while the panel is closed.
      await page.keyboard.press("Enter");
      await page.locator(".chat-input").fill("gg");
      await page.keyboard.press("Enter");
      await expect(chat.locator(".chat-line")).toHaveCount(1);
      await expect(chat.locator(".chat-lines")).toBeHidden();
      await expect(chat).not.toHaveClass(/has-unread/);
      await chat.locator(".chat-toggle").click();
      await expect(chat.locator(".chat-lines")).toBeVisible();
    });
  });
}

for (const [held, device] of [
  ["upright, 360 px wide", { ...PIXEL_8A_PORTRAIT, viewport: { width: 360, height: 780 } }],
  ["on its side", PIXEL_8A_LANDSCAPE],
] as const) {
  test.describe(`the match's ☰ on a touch phone held ${held} (#3923)`, () => {
    test.use(device);

    test("only ☰ shows top right; its list's rows take a finger, clear of the chat and the skill bar", async ({
      page,
    }) => {
      await phoneMatch(page, device.viewport, undefined, true);
      const toggle = page.locator(".hud-menu-toggle");
      await expect(page.locator(".hud-controls button").filter({ visible: true })).toHaveCount(1);
      await expect(toggle).toBeVisible();
      const toggleBox = await toggle.boundingBox();
      expect(toggleBox?.width ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET);
      expect(toggleBox?.height ?? 0).toBeGreaterThanOrEqual(TOUCH_TARGET);

      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const menu = page.locator(".hud-menu");
      await expect(menu).toBeVisible();
      const short = await menu.locator(":scope > *").evaluateAll(
        (rows, target) =>
          rows.flatMap((row) => {
            const { height } = row.getBoundingClientRect();
            return height > 0 && height < target
              ? [`${row.getAttribute("class") ?? ""} ${String(height)}`]
              : [];
          }),
        TOUCH_TARGET,
      );
      expect(short, "rows under a finger's height").toEqual([]);
      const menuBox = await menu.boundingBox();
      expect(menuBox).not.toBeNull();
      if (menuBox !== null) {
        expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(device.viewport.height);
        for (const part of [".chat-toggle", ".hud-skills"]) {
          const box = await page.locator(part).first().boundingBox();
          expect(box, `${part} is shown`).not.toBeNull();
          if (box !== null) {
            expect(overlaps(menuBox, box), `☰'s list overlaps ${part}`).toBe(false);
          }
        }
      }

      // Leave asks in its row, and "no" leaves the list open.
      const leave = menu.locator(".hud-leave");
      await leave.getByRole("button").click();
      await expect(leave).toContainText("leave?");
      await leave.getByRole("button", { name: "no" }).click();
      await expect(leave.getByRole("button", { name: "no" })).toHaveCount(0);
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(menu).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
    });
  });
}

test.describe("a 360 px touch phone (#3778)", () => {
  test.use({ ...PIXEL_8A_PORTRAIT, viewport: { width: 360, height: 740 } });

  test("the skill bar stays one row on screen, its slots shrunk to fit", async ({ page }) => {
    await phoneMatch(page, { width: 360, height: 740 }, undefined, true);
    // (360 - 1rem padding - 7 × 4 px gaps) / 8 = 39.5 px a slot.
    await expectSkillRow(page, { width: 360, height: 740 }, 39);
  });
});

test.describe("a Pixel 8a turned mid-match (#3778)", () => {
  test.use(PIXEL_8A_PORTRAIT);

  test("upright, then on its side, then upright: the HUD lays out apart each time", async ({
    page,
  }) => {
    // A touch 8v8, as above: the vote's clock and 16 bodies take most of 60 s.
    test.slow();
    await phoneMatch(page, PIXEL_8A_PORTRAIT.viewport, { size: 8, map: "ember-pits" }, true);
    await expectApart(page, { which: "hudNow", absent: [".party-window"] });
    for (const [phone, free] of [
      [PIXEL_8A_LANDSCAPE.viewport, { width: 0.4, height: 0.3 }],
      [PIXEL_8A_PORTRAIT.viewport, { width: 0.5, height: 0.5 }],
    ] as const) {
      await page.setViewportSize(phone);
      // A few frames for the HUD's observers to re-measure.
      await page.waitForTimeout(300);
      const boxes = await expectApart(page, {
        which: "hudNow",
        absent: [".party-window"],
        phone,
      });
      expectArenaFree(boxes, phone, free);
      await expectSkillRow(page, phone);
    }
  });
});

test.describe("a Pixel 8a at the end of a match (#3778)", () => {
  test.use(PIXEL_8A_PORTRAIT);

  test("the match summary fits it either way: no sideways scroll, a finger's targets, readable text", async ({
    page,
  }) => {
    await page.goto("./?summary-fixture");
    await expect(page.locator(".hud-summary")).toBeVisible();
    await expectFitsPhone(page, "match summary", [".hud-end"]);
  });
});
