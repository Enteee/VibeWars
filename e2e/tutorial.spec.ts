import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../packages/game-core/src/starter-builds.js";
import { projection } from "./camera.js";
import { openLibraryGroup } from "./helpers/library.js";
import { openRail } from "./helpers/menu.js";
import { professionField } from "./helpers/professions.js";

/**
 * A map whose ground is layer 0, and one whose ground is layer 1 (#3248):
 * the tutorial walks on either. No player map is flat (#3444), so the flat
 * one is the bench's frozen flat map, which the e2e build offers.
 */
const FLAT_MAP = "bench-flat";

/** A team code of two starter builds, each with a skill (#3544): a playable team of two. */
function duoCode(): string {
  return JSON.stringify({
    format: "vibewars.team",
    formatVersion: TEAM_FORMAT_VERSION,
    name: "Duo",
    size: 2,
    members: STARTER_BUILDS.slice(1, 3).map((build) => ({
      format: "vibewars.character",
      formatVersion: BUILD_FORMAT_VERSION,
      ...build,
      secondaryProfession: build.secondaryProfession ?? null,
    })),
  });
}
const RAISED_MAP = "arena-crossroads";
/** Where the pair arrives in the canyon (#3247), its arrival pad. */
const CANYON_ARRIVAL = { x: 1000, y: 3500 };
/**
 * Beside the canyon's first rockfall, 200 south of its middle (#3247):
 * near enough for each of its strikes to count as a dodge, out of its reach.
 */
const DODGE_SPOT = { x: 1860, y: 3620 };
/** The middle of the canyon's cracked wall (#3302), station 5's, east of its mark. */
const WALL_MIDDLE = { x: 3600, y: 3500 };
/**
 * West of the canyon's clearing (#3303), out of its rockfall's reach and
 * in a heal's range of the tutor waiting east of it.
 */
const BY_CLEARING = { x: 4900, y: 3500 };
/**
 * Station 7's way round the mire (#3310): up the north leg's east side and
 * through the bulge east of the mud, in no zone; then its mark, north of it.
 */
const CLEAR_WAY = [
  { x: 7000, y: 3150 },
  { x: 7150, y: 2800 },
];
const PAST_THE_MUD = { x: 6900, y: 2420 };
/**
 * On station 9's ledge (#3323), just west of its stairs' top and near its
 * north edge: a click here picks the deck, never the ground beside or
 * under it, so the walk up ends on the ledge (the ledge spans x 3290-3910,
 * y 1800-1980).
 */
const ON_THE_LEDGE = { x: 3850, y: 1830 };
/**
 * Station 11's way from the foot of station 9's ledge (#3326): south, clear
 * of its stairs, west along the second row, north up the west leg, onto
 * the top of the tunnel's west steps, one long stride from the tunnel's
 * west half. The west leg bends west past its foot: a stride north from
 * there can land where no path goes, so one waypoint takes the bend.
 */
const TO_THE_TUNNEL = [
  { x: 4100, y: 2250 },
  { x: 3000, y: 2250 },
  { x: 1300, y: 2100 },
  { x: 1030, y: 1650 },
  { x: 1200, y: 1300 },
  { x: 1200, y: 800 },
  { x: 1600, y: 700 },
  { x: 1720, y: 700 },
];
/**
 * How far above the view's middle a walk's click may land, in CSS px
 * (#3363): below the target frame at the top, which a click calls.
 */
const CLEAR_ABOVE = 200;
/** How far each stride of station 11 (#3326) reaches, in world units: still inside the view. */
const LONG_STRIDE = 500;
/** How far to one side station 11's walk clicks when a click has not moved it (#3363). */
const SIDESTEP = 60;
/**
 * In station 11's tunnel (#3326), west and east of its middle: the tunnel
 * (x 2080-2800, y 450-950, layer 0) is a layer, 56 world units, under the
 * rock over it, so its floor is drawn this far below where it lies.
 */
const IN_THE_TUNNEL_WEST = { x: 2200, y: 700 + 56 };
const IN_THE_TUNNEL_EAST = { x: 2700, y: 700 + 56 };
/** Station 11's mark (#3326), just past the top of the tunnel's east steps. */
const PAST_THE_TUNNEL = { x: 3240, y: 700 };
/** Station 12's two rats (#3331), west of them: `site-12` is at x 3800. */
const BY_THE_RATS = { x: 3600, y: 700 };
/** Station 13's fork (#3332), `site-13`, where its mark is drawn. */
const AT_THE_FORK = { x: 4900, y: 700 };
/**
 * Station 13's two arms round the rock island (#3792), each by its mark
 * (`site-13n`, `site-13s`) to the rejoin (`site-13r`), where it is done.
 */
const NORTH_ARM = [
  { x: 5120, y: 460 },
  { x: 5450, y: 375 },
  { x: 5780, y: 460 },
];
const SOUTH_ARM = [
  { x: 5150, y: 1250 },
  { x: 5450, y: 1335 },
  { x: 5750, y: 1250 },
];
const AT_THE_REJOIN = { x: 6150, y: 700 };
/** Station 14's mist gate (#3334), `CANYON_EXIT` at the canyon's east end. */
const IN_THE_MIST_GATE = { x: 7600, y: 700 };
/** The tutor's id, as its party row names it. */
const TUTOR_ID = "tutorial-tutor";
/** The furthest a click in the canyon sends the player, in world units: well inside the view. */
const STRIDE = 250;

/**
 * Through the splash to its end, where a first-timer is offered the
 * tutorial (#3218), with the menu fight, which the tutorial plays on,
 * pinned to `mapId`.
 */
async function pastTheSplash(page: Page, mapId: string, fragment = ""): Promise<void> {
  await page.goto(`./?splash&menu-background=${mapId}${fragment}`);
  const splash = page.locator(".splash");
  await expect(splash.locator(".splash-hint")).toBeVisible();
  // The fight is drawn before the offer reads its map.
  await expect(page.locator("#menu-background")).toHaveAttribute("data-map", mapId);
  await page.keyboard.press("Space");
  await expect(splash.locator(".splash-prompt")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Space");
  await expect(splash).toHaveCount(0);
}

/**
 * Station 13's arm (#3792), from the fork: a wheel-click on its mark pings
 * it, then the player walks it, waypoint by waypoint, round the island to
 * the rejoin, where the praise is said.
 */
async function takeTheArm(
  page: Page,
  stage: Locator,
  frame: Locator,
  hasSaid: (line: string) => Promise<boolean>,
  walkTo: (point: { x: number; y: number }, stride?: number) => Promise<void>,
  arm: readonly { x: number; y: number }[],
): Promise<void> {
  const mark = arm[1] ?? AT_THE_REJOIN;
  const canvas = page.locator("#viewport canvas:not(.compass)");
  await expect(async () => {
    const view = await projection(stage, canvas);
    const box = await canvas.boundingBox();
    // The ping goes where the arm is seen from the fork: on its way to
    // the mark, past halfway, no further than a third of the view off
    // its middle, clear of the skill bar below.
    const reach = (box?.height ?? 0) / 3 / view.zoom / Math.abs(mark.y - AT_THE_FORK.y);
    const along = Math.min(1, reach);
    expect(along).toBeGreaterThan(0.55);
    const at = view.onPage({
      x: AT_THE_FORK.x + (mark.x - AT_THE_FORK.x) * along,
      y: AT_THE_FORK.y + (mark.y - AT_THE_FORK.y) * along,
    });
    await page.mouse.click(at.x, at.y, { button: "middle" });
    // Once an arm is called, the rejoin is marked.
    await expect(frame).toHaveAttribute(
      "data-mark",
      `${String(AT_THE_REJOIN.x)},${String(AT_THE_REJOIN.y)}`,
      { timeout: 3_000 },
    );
  }).toPass({ timeout: 30_000 });
  for (const point of [...arm, AT_THE_REJOIN]) {
    await expect(async () => {
      if (await hasSaid("Good call. Onward.")) {
        return;
      }
      await walkTo(point);
      const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
        .split(",")
        .map(Number);
      expect(Math.hypot(cx - point.x, cy - point.y)).toBeLessThan(60);
    }).toPass({ timeout: 60_000 });
  }
  await expect.poll(() => hasSaid("Good call. Onward."), { timeout: 15_000 }).toBe(true);
}

/** What a stage of the tutorial reads and does (#3383). */
interface Lesson {
  readonly frame: Locator;
  /** The match view, its `data-camera` where the view looks. */
  readonly stage: Locator;
  /** The body, every line said kept on its `data-said-log`. */
  readonly saidLog: Locator;
  readonly hasSaid: (line: string) => Promise<boolean>;
  /** A click toward `point`, `stride` away at most. */
  readonly walkTo: (point: { x: number; y: number }, stride?: number) => Promise<void>;
}

/**
 * The tutorial on `mapId` begun at `station`: the first through the splash
 * and "Learn to play"; a later one seeded by the e2e build (#3383), which
 * opens straight on it, so each stage is its own test and the shards can
 * spread them.
 */
async function learn(page: Page, mapId: string, station: number): Promise<Lesson> {
  if (station === 1) {
    await pastTheSplash(page, mapId);
    await page.getByRole("button", { name: "Learn to play" }).click();
  } else {
    await page.goto(`./?menu-background=${mapId}&tutorial-station=${String(station)}`);
  }
  const frame = page.locator(".tutorial-frame");
  const stage = page.locator("#viewport");
  // A seeded start shows it once its canyon map is built, which a slow
  // runner takes a while over.
  await expect(frame).toHaveCount(1, { timeout: 30_000 });
  // The guide's praise shows for 2.5 s only, which a slow runner can
  // outlast: keep every line said on the body, which outlives the frame,
  // starting with the one said already.
  await frame.evaluate((element) => {
    const keep = (): void => {
      const text = element.querySelector(".tutorial-said")?.textContent ?? "";
      const said = document.body.getAttribute("data-said-log") ?? "";
      if (!said.endsWith(`|${text}`)) {
        document.body.setAttribute("data-said-log", `${said}|${text}`);
      }
    };
    keep();
    new MutationObserver(keep).observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const saidLog = page.locator("body");
  const hasSaid = async (line: string): Promise<boolean> =>
    ((await saidLog.getAttribute("data-said-log")) ?? "").split("|").includes(line);
  const walkTo = async (point: { x: number; y: number }, stride = STRIDE): Promise<void> => {
    // A stride toward it at most, so the click stays clear of the HUD
    // at the screen's edges, whoever follows it up clicks again.
    const view = await projection(stage, page.locator("#viewport canvas:not(.compass)"));
    const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
      .split(",")
      .map(Number);
    const far = Math.hypot(point.x - cx, point.y - cy);
    // Never up into the target frame, either: a click there calls the
    // target, and a rat called on the way finishes station 12 (#3363).
    const up = Math.max(0, (cy - point.y) * view.zoom);
    const reach = Math.min(1, stride / Math.max(far, 1), CLEAR_ABOVE / Math.max(up, 1));
    const at = view.onPage({ x: cx + (point.x - cx) * reach, y: cy + (point.y - cy) * reach });
    await page.mouse.click(at.x, at.y);
  };
  return { frame, stage, saidLog, hasSaid, walkTo };
}

test.describe("the first-time tutorial (#3218)", () => {
  test("Skip opens the menu, and it is not offered again", async ({ page }) => {
    await pastTheSplash(page, FLAT_MAP);
    const offer = page.locator(".tutorial-offer");
    await expect(offer).toBeVisible();
    await offer.getByRole("button", { name: "Skip" }).click();
    await expect(offer).toHaveCount(0);
    await expect(page.locator(".screen-rail")).toBeVisible();

    await pastTheSplash(page, FLAT_MAP);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });

  for (const mapId of [FLAT_MAP, RAISED_MAP]) {
    test(`Learn on ${mapId}, from the start`, async ({ page }) => {
      // A walk, a drag and a walk in a sim that runs no faster than the page
      // draws: a loaded runner takes most of a minute (#3222).
      test.setTimeout(240_000);
      const { frame, hasSaid } = await learn(page, mapId, 1);
      await expect(frame.locator(".tutorial-said")).toHaveText(
        "This war never ends. Walk with me; I have an idea.",
      );
      await expect(frame.locator(".tutorial-how")).toContainText("W");
      // Only the pair in the party window, and no scoreline (#3221).
      await expect(page.locator(".party-window .party-row")).toHaveCount(2);
      await expect(page.locator(".hud-scoreboard")).toBeHidden();
      // No empty target frame over the teleporter's pad (#3222).
      await expect(page.locator(".hud-target")).toBeHidden();
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [x = 0, y = 0] = ((await frame.getAttribute("data-mark")) ?? "").split(",").map(Number);
      // The camera may still be easing in on a slow runner, which makes one
      // projection stale: project afresh and click again until the walk lands.
      const stride = "Nice stride! You're a natural.";
      await expect(async () => {
        if (await hasSaid(stride)) {
          return;
        }
        const view = await projection(
          page.locator("#viewport"),
          page.locator("#viewport canvas:not(.compass)"),
        );
        const at = view.onPage({ x, y });
        await page.mouse.click(at.x, at.y);
        await expect.poll(() => hasSaid(stride), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 30_000 });

      // Station 2 (#3222): one wheel notch out, then a right-drag north to the leash.
      await expect
        .poll(() => hasSaid("Maybe this teleporter gets us around the battlefield. Look north!"), {
          timeout: 10_000,
        })
        .toBe(true);
      await expect(frame).not.toHaveAttribute("data-mark", /.+/);
      const box = await page.locator("#viewport canvas:not(.compass)").boundingBox();
      if (box === null) {
        throw new Error("no canvas");
      }
      const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      await page.mouse.move(centre.x, centre.y);
      await page.mouse.wheel(0, 100);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(centre.x, box.y + 1, { steps: 10 });
      await expect.poll(() => hasSaid("There it is! Our way around the fight.")).toBe(true);
      await page.mouse.up({ button: "right" });

      // Station 3: the pad carries the mark. The view has glided back, so the
      // pad may be off the top: click toward it until it shows, then on it.
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/, { timeout: 10_000 });
      const [padX = 0, padY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      // Once on the pad the guide speaks and the view closes: a retry that
      // starts after that has nothing to project, so it asks the log first.
      const together = "Together. Hold your breath.";
      await expect(async () => {
        if (await hasSaid(together)) {
          return;
        }
        const view = await projection(
          page.locator("#viewport"),
          page.locator("#viewport canvas:not(.compass)"),
        );
        const at = view.onPage({ x: padX, y: padY });
        const inset = 40;
        await page.mouse.click(
          Math.min(box.x + box.width - inset, Math.max(box.x + inset, at.x)),
          Math.min(box.y + box.height - inset, Math.max(box.y + inset, at.y)),
        );
        await expect.poll(() => hasSaid(together), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });

      // On to station 4 (#3247), in the canyon.
      await expect(frame).toHaveAttribute("data-world", "canyon", { timeout: 15_000 });
    });

    test(`Learn on ${mapId}, from the canyon`, async ({ page }) => {
      // The three dodges at least 18 s (#3247): slower where the page draws slowly.
      test.setTimeout(240_000);
      const { frame, stage, hasSaid, walkTo } = await learn(page, mapId, 4);
      // Station 4 (#3247): the canyon, the player on its arrival.
      await expect(frame).toHaveAttribute("data-world", "canyon", { timeout: 15_000 });
      await expect
        .poll(async () => {
          const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
            .split(",")
            .map(Number);
          return Math.hypot(cx - CANYON_ARRIVAL.x, cy - CANYON_ARRIVAL.y);
        })
        .toBeLessThan(150);
      await expect
        .poll(() => hasSaid("Rocks fall here. When a shadow grows, step aside!"), {
          timeout: 10_000,
        })
        .toBe(true);
      // Beside the first landing, until three of its strikes have missed.
      await expect(async () => {
        await walkTo(DODGE_SPOT);
        await expect(frame).toHaveAttribute("data-dodges", /^[3-9]$/, { timeout: 3_000 });
      }).toPass({ timeout: 90_000 });
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [goalX = 0, goalY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      const quick = "Quick feet! The rocks can't catch you.";
      await expect(async () => {
        if (await hasSaid(quick)) {
          return;
        }
        await walkTo({ x: goalX, y: goalY });
        await expect.poll(() => hasSaid(quick), { timeout: 3_000 }).toBe(true);
      }).toPass({ timeout: 90_000 });

      // On to station 5 (#3302), by the wall.
      await expect
        .poll(() => hasSaid("A wall blocks the trail. Right click it, then hit it."), {
          timeout: 10_000,
        })
        .toBe(true);
    });

    test(`Learn on ${mapId}, from the wall`, async ({ page }) => {
      // The wall some 10 to 15 s (#3302), the clearing and the heal some 30 s
      // (#3303), the bad ground some 20 s (#3310): slower where the page
      // draws slowly.
      test.setTimeout(300_000);
      const { frame, stage, hasSaid, walkTo } = await learn(page, mapId, 5);
      // Station 5 (#3302): from station 4's mark up to the wall's, target
      // the wall, strike it until it falls.
      await expect(frame).toHaveAttribute("data-world", "canyon", { timeout: 15_000 });
      await expect
        .poll(() => hasSaid("A wall blocks the trail. Right click it, then hit it."), {
          timeout: 10_000,
        })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-wall", "700");
      const [faceX = 0, faceY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      const target = page.locator(".hud-target");
      await expect(async () => {
        await walkTo({ x: faceX, y: faceY });
        const view = await projection(stage, page.locator("#viewport canvas:not(.compass)"));
        const at = view.onPage(WALL_MIDDLE);
        await page.mouse.click(at.x, at.y, { button: "right" });
        await expect(target).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 60_000 });
      await expect(target).toHaveClass(/tutorial-pulse/);
      // The frame shows the wall's health, as it does a body's (#3317).
      const wallBar = target.locator(".hud-target-health");
      await expect(wallBar).toBeVisible();
      await expect(wallBar.locator(".hud-bar-label")).toHaveText("100%");
      // The mark by the wall goes once it is targeted; the frame pulses on.
      await expect(frame).not.toHaveAttribute("data-mark", /./);
      await page.keyboard.press("Space");
      await expect
        .poll(() => hasSaid("There! It cracks. Keep going."), { timeout: 15_000 })
        .toBe(true);
      await expect(wallBar.locator(".hud-bar-label")).not.toHaveText("100%");
      await expect(frame).toHaveAttribute("data-wall", "0", { timeout: 90_000 });
      await expect
        .poll(() => hasSaid("Down it goes! The trail is open."), { timeout: 5_000 })
        .toBe(true);

      // Station 6 (#3303): into the clearing behind the tutor, which a rock
      // hits; target it by its name in the party window, then heal it.
      await expect
        .poll(() => hasSaid("Through the gap and into the clearing. Follow me!"), {
          timeout: 10_000,
        })
        .toBe(true);
      const tutorRow = page.locator(`.party-row[data-member="${TUTOR_ID}"]`);
      await expect(tutorRow).toHaveClass(/tutorial-pulse/);
      await expect(async () => {
        await walkTo(BY_CLEARING);
        const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
          .split(",")
          .map(Number);
        expect(Math.hypot(cx - BY_CLEARING.x, cy - BY_CLEARING.y)).toBeLessThan(150);
      }).toPass({ timeout: 60_000 });
      await expect
        .poll(() => hasSaid("Ow! The rock got me. A little help?"), { timeout: 30_000 })
        .toBe(true);
      await tutorRow.click();
      const healSlot = page.locator(".hud-skill:nth-child(8)");
      await expect(healSlot).toHaveClass(/tutorial-pulse/);
      const thanks = "Much better, thank you! You're a healer too.";
      await expect(async () => {
        if (await hasSaid(thanks)) {
          return;
        }
        await page.keyboard.press("Digit8");
        await expect.poll(() => hasSaid(thanks), { timeout: 4_000 }).toBe(true);
      }).toPass({ timeout: 30_000 });
      expect(await hasSaid("That blue bar is energy. Skills spend it.")).toBe(true);

      // Station 7 (#3310): the mark past the bad ground, reached the clear way round.
      await expect
        .poll(() => hasSaid("Mud slows you. Lava burns. Your call."), { timeout: 10_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute(
        "data-mark",
        `${String(PAST_THE_MUD.x)},${String(PAST_THE_MUD.y)}`,
      );
      for (const point of CLEAR_WAY) {
        await expect(async () => {
          await walkTo(point);
          const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
            .split(",")
            .map(Number);
          expect(Math.hypot(cx - point.x, cy - point.y)).toBeLessThan(150);
        }).toPass({ timeout: 60_000 });
      }
      const across = "Across! Now you know what the ground can do.";
      await expect(async () => {
        if (await hasSaid(across)) {
          return;
        }
        await walkTo(PAST_THE_MUD);
        await expect.poll(() => hasSaid(across), { timeout: 3_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });
      // Round the mud, no status: the effects monitor was never pointed at.
      expect(await hasSaid("See that icon? Mud. It wears off.")).toBe(false);

      // On to station 8 (#3316), on the same map (#3792).
      await expect
        .poll(() => hasSaid("Rats! Different skills, different jobs."), { timeout: 15_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-world", "canyon");
    });

    test(`Learn on ${mapId}, from the rat pocket`, async ({ page }) => {
      // The rats some 60 s (#3316), the ledge some 30 s (#3323).
      test.setTimeout(240_000);
      const { frame, stage, hasSaid, walkTo } = await learn(page, mapId, 8);
      // Station 8 (#3316): from station 7's mark, its three rats at the
      // pocket west along the second row; the closest targeted again and
      // again, two skills and the plain attack kill them all.
      await expect
        .poll(() => hasSaid("Rats! Different skills, different jobs."), { timeout: 15_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-world", "canyon");
      await expect(frame).toHaveAttribute("data-rats", "3", { timeout: 10_000 });
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [pocketX = 0, pocketY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      // Near enough to fight: the rats meet the player on the way in and
      // can hold them some 150 short of the pocket's middle (#3792).
      await expect(async () => {
        await walkTo({ x: pocketX, y: pocketY });
        const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
          .split(",")
          .map(Number);
        const d = Math.hypot(cx - pocketX, cy - pocketY);
        expect(
          d,
          `camera ${String(cx)},${String(cy)}, pocket ${String(pocketX)},${String(pocketY)}`,
        ).toBeLessThan(250);
      }).toPass({ timeout: 90_000 });
      const fought = "Well fought! Every skill has its job.";
      await expect(async () => {
        if (await hasSaid(fought)) {
          return;
        }
        // The closest rat, attacked, then Protector's Strike and Crushing Blow.
        for (const key of ["KeyC", "Space", "Digit4", "Digit3"]) {
          await page.keyboard.press(key);
        }
        await expect.poll(() => hasSaid(fought), { timeout: 3_000 }).toBe(true);
      }).toPass({ timeout: 120_000 });

      // Station 9 (#3323): up the steps onto the ledge, its mark; then an
      // Alt+click on the same mark walks to the ground under it.
      await expect
        .poll(() => hasSaid("Up the steps. A solid ring is where you'll stand."), {
          timeout: 15_000,
        })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [ledgeX = 0, ledgeY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      // Up by the stairs' top, not the mark: a click toward the mark can
      // pick the ground under or past the deck, a walk up the stairs,
      // across and off the edge, and that one earns the tip. No click once
      // the mark has gone under.
      const upper = (await frame.getAttribute("data-mark-layer")) ?? "";
      await expect(async () => {
        if ((await frame.getAttribute("data-mark-layer")) !== upper) {
          return;
        }
        await walkTo(ON_THE_LEDGE);
        await expect(frame).not.toHaveAttribute("data-mark-layer", upper, { timeout: 3_000 });
      }).toPass({ timeout: 90_000 });
      await expect
        .poll(() => hasSaid("Hold Alt and click. The dashed ring is below you."), {
          timeout: 15_000,
        })
        .toBe(true);
      const tip = "Tip: Alt+click picks the ground under a ledge.";
      expect(await hasSaid(tip), "no tip while the player is still up").toBe(false);
      const climbed = "Two layers, one spot. You read the ground now.";
      await expect(async () => {
        if (await hasSaid(climbed)) {
          return;
        }
        await page.keyboard.down("Alt");
        await walkTo({ x: ledgeX, y: ledgeY });
        await page.keyboard.up("Alt");
        await expect.poll(() => hasSaid(climbed), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });
      // Down by an Alt walk: no tip.
      expect(await hasSaid(tip), "no tip after an Alt walk down").toBe(false);

      // On to station 11 (#3326), station 10's high deck gone (#3792).
      await expect
        .poll(() => hasSaid("Shh. Don't wake them. We go under."), { timeout: 15_000 })
        .toBe(true);
    });

    test(`Learn on ${mapId}, from the tunnel to the fork`, async ({ page }) => {
      // Seeded at the foot of station 9's ledge, where it leaves the player
      // (#3383). The tunnel some two minutes (#3326), the call some 40 s
      // (#3331), the junction some 40 s (#3332).
      test.setTimeout(420_000);
      const { frame, stage, saidLog, hasSaid, walkTo } = await learn(page, mapId, 10);
      const target = page.locator(".hud-target");
      // Station 11 (#3326): west along the second row, round to the tunnel's west
      // steps, an Alt walk down into its west half, on through its east half
      // under the sleeping guard, and up the far steps to the mark.
      await expect
        .poll(() => hasSaid("Shh. Don't wake them. We go under."), { timeout: 15_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-mark-layer", "1");
      // A walk that stuck says where (#3379): which leg, from where, and on
      // which layer the mark is, so a flake explains itself in the log.
      const near = async (
        point: { x: number; y: number },
        reach: number,
        leg = "",
      ): Promise<void> => {
        const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
          .split(",")
          .map(Number);
        const markLayer = (await frame.getAttribute("data-mark-layer")) ?? "none";
        expect(
          Math.hypot(cx - point.x, cy - point.y),
          `${leg}at ${String(cx)},${String(cy)}, bound for ${String(point.x)},${String(point.y)}, the mark on layer ${markLayer}`,
        ).toBeLessThan(reach);
      };
      // On each waypoint, not just near it: there is no pathing, and a leg
      // begun beside one can run its straight line into a corner (#3363).
      // Stuck since the last try, the same click would never move it: a
      // short stride, a little to one side, instead.
      for (const [index, waypoint] of TO_THE_TUNNEL.entries()) {
        let last = "";
        let tries = 0;
        await expect(async () => {
          const camera = (await stage.getAttribute("data-camera")) ?? "";
          const [cx = 0, cy = 0] = camera.split(",").map(Number);
          if (camera === last) {
            tries += 1;
            const far = Math.max(Math.hypot(waypoint.x - cx, waypoint.y - cy), 1);
            const side = tries % 2 === 0 ? SIDESTEP : -SIDESTEP;
            await walkTo(
              {
                x: waypoint.x - ((waypoint.y - cy) / far) * side,
                y: waypoint.y + ((waypoint.x - cx) / far) * side,
              },
              LONG_STRIDE / 2,
            );
          } else {
            await walkTo(waypoint, LONG_STRIDE);
          }
          last = camera;
          await near(waypoint, 40, `TO_THE_TUNNEL[${String(index)}]: `);
        }).toPass({ timeout: 90_000 });
      }
      // One click each, then a wait for the walk: an Alt click from inside
      // the tunnel goes back up onto the rock (#3234), where the guard bars
      // the way east.
      await expect(async () => {
        await page.keyboard.down("Alt");
        await walkTo(IN_THE_TUNNEL_WEST, LONG_STRIDE);
        await page.keyboard.up("Alt");
        await expect(() => near(IN_THE_TUNNEL_WEST, 100)).toPass({ timeout: 20_000 });
      }).toPass({ timeout: 60_000 });
      await expect(async () => {
        await walkTo(IN_THE_TUNNEL_EAST, LONG_STRIDE);
        await expect(() => near(IN_THE_TUNNEL_EAST, 100)).toPass({ timeout: 20_000 });
      }).toPass({ timeout: 60_000 });
      const quiet = "Not a peep. Tunnels hide you from whoever's above.";
      await expect(async () => {
        if (await hasSaid(quiet)) {
          return;
        }
        await walkTo(PAST_THE_TUNNEL, LONG_STRIDE);
        await expect.poll(() => hasSaid(quiet), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });

      // Station 12 (#3331): on to the two rats, the closest targeted and
      // called with a click on the target frame, T on the call, and the
      // tutor walks over and hits it. The party window is lit meanwhile.
      await expect
        .poll(() => hasSaid("Two rats. You pick, I hit. Call one."), { timeout: 15_000 })
        .toBe(true);
      await expect(page.locator(".party-window")).toHaveClass(/tutorial-pulse/);
      await expect(async () => {
        // Its view gone, the tutorial has ended under the walk (#3363):
        // what the tutor said last says how.
        await expect(
          frame,
          `said: ${(await saidLog.getAttribute("data-said-log")) ?? ""}`,
        ).toHaveCount(1, { timeout: 1_000 });
        await walkTo(BY_THE_RATS, LONG_STRIDE);
        await near(BY_THE_RATS, 150);
      }).toPass({ timeout: 90_000 });
      await expect(async () => {
        await page.keyboard.press("KeyC");
        await expect(target).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30_000 });
      await target.click();
      await page.keyboard.press("KeyT");
      await expect
        .poll(() => hasSaid("That's it. T finds the call."), { timeout: 10_000 })
        .toBe(true);
      await expect
        .poll(() => hasSaid("Call it, and the team hits the same thing."), { timeout: 90_000 })
        .toBe(true);

      // Station 13 (#3332, #3792): on east to the fork, the compass lit; a
      // wheel-click on the north arm sends the tutor along it, and the
      // player walks it too, round the island to the rejoin.
      await expect
        .poll(() => hasSaid("Left or right? You call it."), { timeout: 15_000 })
        .toBe(true);
      await expect(page.locator("canvas.compass")).toHaveClass(/tutorial-pulse/);
      await expect(async () => {
        await walkTo(AT_THE_FORK, LONG_STRIDE);
        await near(AT_THE_FORK, 100);
      }).toPass({ timeout: 90_000 });
      await takeTheArm(page, stage, frame, hasSaid, walkTo, NORTH_ARM);

      // On to station 14 (#3334).
      await expect
        .poll(() => hasSaid("Our team fights beyond the mist. Follow me."), { timeout: 15_000 })
        .toBe(true);
    });

    test(`Learn on ${mapId}, from the junction by its south arm to the gate`, async ({ page }) => {
      // Seeded at the junction's fork (#3792), the arm some 40 s, the gate some 20 s.
      test.setTimeout(180_000);
      const { frame, stage, hasSaid, walkTo } = await learn(page, mapId, 12);
      // Station 13 (#3792): the south arm pinged, the tutor along it, the
      // player after it round the island to the rejoin.
      await expect
        .poll(() => hasSaid("Left or right? You call it."), { timeout: 15_000 })
        .toBe(true);
      await takeTheArm(page, stage, frame, hasSaid, walkTo, SOUTH_ARM);
      // Station 14 (#3334): on into the mist gate.
      await expect
        .poll(() => hasSaid("Our team fights beyond the mist. Follow me."), { timeout: 15_000 })
        .toBe(true);
      await expect(async () => {
        if (await hasSaid("Now they're in front of us. Charge!")) {
          return;
        }
        await walkTo(IN_THE_MIST_GATE, LONG_STRIDE);
        await expect
          .poll(() => hasSaid("Now they're in front of us. Charge!"), { timeout: 5_000 })
          .toBe(true);
      }).toPass({ timeout: 90_000 });
    });

    test(`Learn on ${mapId}, from the gate to the menu`, async ({ page }) => {
      // Seeded at the junction's rejoin, where station 13 leaves the pair (#3334, #3792).
      test.setTimeout(180_000);
      const { frame, hasSaid, walkTo } = await learn(page, mapId, 13);
      // Station 14 (#3334): east from the rejoin into the mist gate, the
      // tutor ahead, and out among its team.
      await expect
        .poll(() => hasSaid("Our team fights beyond the mist. Follow me."), { timeout: 15_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-mark-layer", "1");
      await expect(async () => {
        if (await hasSaid("Now they're in front of us. Charge!")) {
          return;
        }
        await walkTo(IN_THE_MIST_GATE, LONG_STRIDE);
        await expect
          .poll(() => hasSaid("Now they're in front of us. Charge!"), { timeout: 5_000 })
          .toBe(true);
      }).toPass({ timeout: 90_000 });

      // The front: a match like any other, its HUD and no marks; Leave
      // leads into the menu quest (#3540), and the menu never offers it again.
      await expect(page.locator(".hud-scoreboard")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".tutorial-frame[data-mark]")).toHaveCount(0);
      const leave = page.locator(".hud-leave");
      await leave.getByRole("button", { name: "leave match" }).click();
      await leave.getByRole("button", { name: "yes" }).click();
      await expect(page.locator(".screen-rail")).toBeVisible({ timeout: 15_000 });
      await expect(frame).toHaveCount(0);
      await expect(page.locator(".coach-panel")).toBeVisible();

      await pastTheSplash(page, mapId);
      await expect(page.locator(".tutorial-offer")).toHaveCount(0);
    });
  }

  test("a guild link, even through a forced splash, is never offered it", async ({ page }) => {
    await pastTheSplash(page, FLAT_MAP, `#guild=VW.e6c04a.23272e.${"A".repeat(171)}.`);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});

test.describe("the menu quest (#3540)", () => {
  test("dims the menu but the beat's target, and walks the main menu", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    await expect(panel).toContainText("To go on, you must change your spec.");
    const rail = page.locator('[data-tutorial="rail"]');
    await expect(rail).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-hole")).toBeVisible();

    const bubble = page.locator(".coach-bubble");
    await bubble.getByRole("button", { name: "Got it" }).click();
    const characters = page.locator('[data-tutorial="rail-characters"]');
    await expect(characters).toHaveClass(/tutorial-pulse/);
    await expect(rail).not.toHaveClass(/tutorial-pulse/);

    // Teams is dimmed: a click on it never reaches the menu.
    const teams = page.locator('[data-tutorial="rail-teams"]');
    await expect(teams).toHaveAttribute("aria-pressed", "false");
    await teams.click({ force: true });
    await expect(page.locator(".screen-teams")).toHaveCount(0);

    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(teams).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    // On to the spec step (#3541): a thing to do, with no Got it.
    await expect(panel).toContainText("Change your spec.");
    await expect(teams).not.toHaveClass(/tutorial-pulse/);
    await expect(characters).toHaveClass(/tutorial-pulse/);
    await expect(bubble.getByRole("button", { name: "Got it" })).toBeHidden();
  });

  test("at 800x600 the docked panel never covers the bubble or the cut-out", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    for (const target of ["rail", "rail-characters", "rail-teams"]) {
      await expect(page.locator(`[data-tutorial="${target}"]`)).toHaveClass(/tutorial-pulse/);
      const panelBox = await panel.boundingBox();
      // The whole rail is as tall as the window: no edge clears it, so
      // that beat keeps only its bubble clear.
      const clear = target === "rail" ? [bubble] : [bubble, page.locator(".coach-hole")];
      for (const other of clear) {
        const box = await other.boundingBox();
        const apart =
          panelBox === null ||
          box === null ||
          panelBox.y >= box.y + box.height ||
          box.y >= panelBox.y + panelBox.height;
        expect(
          apart,
          `the panel clears ${target}'s ${String(await other.getAttribute("class"))}`,
        ).toBe(true);
      }
      // A real click, not forced: nothing may sit on top of Got it.
      await bubble.getByRole("button", { name: "Got it" }).click();
    }
    await expect(panel).toContainText("Change your spec.");
  });

  test("Clone on the Random character counts as New character (#3786)", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=spec`);
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await target("rail-characters").click();
    const random = target("character-random");
    await expect(random).toHaveClass(/tutorial-pulse/);
    // The Random beat's line offers Clone, and it sits in the beat's hole.
    await random.locator(".roster-clone").click();
    await expect(target("professions")).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-panel")).toContainText("Switch a profession");
  });

  test("changes the spec in the builder, one locked target at a time (#3541)", async ({ page }) => {
    // A walk through the whole builder: ~50 s on a loaded runner, past the default.
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=spec`);
    const panel = page.locator(".coach-panel");
    await expect(panel).toContainText("Change your spec.");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await expect(target("rail-characters")).toHaveClass(/tutorial-pulse/);
    await target("rail-characters").click();
    // A fresh player's one character is the rolled Random one: said, not opened (#3786).
    const random = target("character-random");
    await expect(random).toHaveClass(/tutorial-pulse/);
    await expect(random).toContainText("Random");
    const bubble = page.locator(".coach-bubble");
    await expect(bubble).toContainText("This is your Random character");
    // Teams is dimmed: a click on it never reaches the menu.
    await target("rail-teams").click({ force: true });
    await expect(page.locator(".screen-teams")).toHaveCount(0);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("character-new")).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Make your own: press New character.");
    await target("character-new").click();

    await expect(target("professions")).toHaveClass(/tutorial-pulse/);
    await expect(panel).toContainText("Switch a profession");
    await expect(bubble).toContainText("a Warrior's Strength, a Monk's Divine Favor");
    // Save is dimmed until its beat: a click on it saves nothing.
    await target("save").click({ force: true });
    await expect(page.locator(".editor-professions")).toBeVisible();
    // A new character has no secondary: take one.
    await professionField(page, "secondary").click();
    const cells = target("professions").locator(".profession-grid .profession-cell");
    await cells.and(page.locator(':not([data-profession="none"])')).first().click();

    await expect(target("attributes").first()).toHaveClass(/tutorial-pulse/);
    // No point is spent yet: a first rank always goes through.
    await page.locator('.editor-attribute .attribute-pip[data-pip="1"]').first().click();

    await expect(target("skills").first()).toHaveClass(/tutorial-pulse/);
    await openLibraryGroup(page);
    const slot = page.locator(".skill-slot").last();
    const fresh = page.locator(".skill-library .skill-box:not(.is-equipped):not(.is-elite)");
    expect(await fresh.count()).toBeGreaterThan(0);
    await fresh.first().dragTo(slot);

    await expect(target("weapons").first()).toHaveClass(/tutorial-pulse/);
    const weapon = page.locator(".gear-slot").first();
    const held = (await weapon.textContent()) ?? "";
    await weapon.click();
    await page
      .locator(".gear-box")
      .filter({ hasText: held.includes("Hammer") ? "Axe" : "Hammer" })
      .first()
      .click();

    await expect(target("gear").first()).toHaveClass(/tutorial-pulse/);
    await page.locator('.paper-doll-hotspot[data-slot="head"]').click();
    const popover = page.locator(".paper-doll-popover");
    await popover.locator('.paper-doll-choice[aria-selected="false"]').first().click();
    await page.keyboard.press("Escape");

    await expect(target("save")).toHaveClass(/tutorial-pulse/);
    await target("save").click();
    // The builder is left, and the quest goes on to the team step (#3542).
    await expect(page.locator(".editor-professions")).toHaveCount(0);
    await expect(panel).toContainText("Build a team to be successful.");
    await expect(target("rail-teams")).toHaveClass(/tutorial-pulse/);
  });

  test("builds and saves a team of two in the team editor (#3542)", async ({ page }) => {
    // A walk through the team editor, drags included: past the default on a loaded runner.
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=team`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    await expect(panel).toContainText("Build a team to be successful.");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await expect(target("rail-teams")).toHaveClass(/tutorial-pulse/);
    await target("rail-teams").click();

    // The sidebar's size first, at 4v4, with New team build dimmed (#3794).
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-build-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    await expect(stepper).toContainText("4v4");
    await expect(bubble).toContainText("Set the team size to 2v2.");
    await expect(target("team-new")).not.toHaveClass(/tutorial-pulse/);
    await stepper.getByRole("button", { name: "Smaller team" }).click();
    await expect(stepper).toContainText("2v2");
    // Then New team build alone.
    await expect(target("team-new")).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Now make a new team build.");
    await target("team-new").click();
    await expect(page.locator(".team-grid .team-row")).toHaveCount(2);

    await expect(target("team-members")).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("team-member-build").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    await expect(target("team-problems").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();

    // Save is dimmed until its beat: a click on it stores nothing.
    const save = page.locator('#topbar [data-tutorial~="team-save"]');
    await save.click({ force: true });
    await expect(page.locator(".team-grid")).toBeVisible();

    await expect(panel).toContainText("Put your character in the team");
    const rows = page.locator(".team-grid .team-row");
    const pick = page.locator(".team-pick").first();
    await pick.dragTo(rows.nth(0));
    await expect(panel).toContainText("Fill the team");
    await pick.dragTo(rows.nth(1));

    await expect(save).toHaveClass(/tutorial-pulse/);
    await save.click();
    // The editor is left, and on to the modes step (#3543).
    await expect(page.locator(".team-grid")).toHaveCount(0);
    await expect(panel).toContainText("Know where to fight.");
  });

  test("a member's name opens its build, and Back carries on in the team (#3785)", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=team`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);

    await target("rail-teams").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-build-size"]');
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    await page.locator(".play-card-new").click();
    await expect(target("team-members")).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();

    // The name, as the line invites: its build, with Back pointed at and nothing locked.
    const name = target("team-member-build").first();
    await expect(name).toHaveClass(/tutorial-pulse/);
    await name.click();
    await expect(bubble).toContainText("This is that member's build.");
    const back = page.locator('#topbar [data-tutorial~="screen-back"]');
    await expect(back).toHaveClass(/tutorial-pulse/);
    await expect(page.locator(".coach-dim")).toBeHidden();
    await back.click();

    // The team editor again, the name's beat done: on to the problems, then Save.
    await expect(page.locator(".team-grid")).toBeVisible();
    await expect(target("team-problems").first()).toHaveClass(/tutorial-pulse/);
    await bubble.getByRole("button", { name: "Got it" }).click();
    const rows = page.locator(".team-grid .team-row");
    const pick = page.locator(".team-pick").first();
    await expect(panel).toContainText("Put your character in the team");
    await pick.dragTo(rows.nth(0));
    await expect(panel).toContainText("Fill the team");
    await pick.dragTo(rows.nth(1));
    const save = page.locator('#topbar [data-tutorial~="team-save"]');
    await expect(save).toHaveClass(/tutorial-pulse/);
    await save.click();
    await expect(panel).toContainText("Know where to fight.");
  });

  test("opens and explains the five modes from the rail, locked (#3543)", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=modes`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    await expect(panel).toContainText("Know where to fight.");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    const ticked = panel.locator(`li[aria-checked="true"]`);

    const modes = [
      ["random-arena", "Random Arena is the quickest fight"],
      ["team-arena", "Team Arena is your party"],
      ["heroes-ascent", "Heroes' Ascent is a run of maps"],
      ["gvg", "GvG is guild against guild"],
      ["hosted-game", "A Hosted Game is your own lobby"],
    ] as const;
    for (const [at, [mode, line]] of modes.entries()) {
      // Already on Random Arena, the first beat is past: its entry does nothing.
      if (at > 0) {
        await expect(target(`rail-${mode}`)).toHaveClass(/tutorial-pulse/);
        await target(`rail-${mode}`).click();
      }
      await expect(target(`mode-${mode}`)).toHaveClass(/tutorial-pulse/);
      await expect(bubble).toContainText(line);
      await expect(ticked).toHaveCount(at + 1);
      if (mode === "team-arena") {
        // Find a match is dimmed: a click on it queues nothing.
        await page.locator("#topbar .lobby-find").click({ force: true });
        await expect(page.locator(".team-lobby-stage")).toHaveCount(0);
        await expect(page.locator("#topbar .topbar-queue")).toBeHidden();
      }
      await bubble.getByRole("button", { name: "Got it" }).click();
    }
    // On to the arena step (#3544).
    await expect(panel).toContainText("Prove your team in a 2v2 Team Arena match.");
    await expect(target("rail-team-arena")).toHaveClass(/tutorial-pulse/);
  });

  test("queues a team of two for Team Arena, then lifts and is done (#3544)", async ({ page }) => {
    test.setTimeout(120_000);
    // A saved, playable team of two, as the team step leaves one.
    await page.goto("./");
    await openRail(page, "Team Builder");
    await expect(page.getByRole("button", { name: "New team build", exact: true })).toBeVisible();
    await page.locator(".screen").evaluate((element, pasted) => {
      const data = new DataTransfer();
      data.setData("text/plain", pasted);
      element.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    }, duoCode());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator(".toast")).toHaveText("Saved");

    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=arena`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await expect(panel).toContainText("Prove your team in a 2v2 Team Arena match.");

    await target("rail-team-arena").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("Only teams of the same size are matched");
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    await expect(stepper).toContainText("2v2");

    const find = page.locator("#topbar .lobby-find");
    await expect(find).toHaveClass(/tutorial-pulse/);
    await expect(bubble).toContainText("a teammate who joins by your invite link");
    await find.click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");

    // The Team Lobby's builds drawer: the duo is the one it offers at 2v2.
    const tab = page.getByRole("button", { name: "Your Team Builds", exact: true });
    await expect(tab).toHaveClass(/tutorial-pulse/);
    await tab.click();
    const drawer = page.getByRole("complementary", { name: "Your Team Builds" });
    await drawer.getByRole("button", { name: "Duo", exact: true }).click();
    await drawer.getByRole("button", { name: "Propose this build", exact: true }).click();

    await expect(target("team-lobby")).toHaveClass(/tutorial-pulse/);
    // The only vote ends the stage, the only seat taken the next.
    await page.locator(".team-lobby-proposals .play-card-open").first().click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character");
    await page.locator(".team-lobby-seat").first().click();

    // Queued: the dim is gone, the closing line shows, and the record is done.
    await expect(panel).toHaveText(/You're in the queue\. Good luck\./);
    await expect(page.locator(".coach-dim")).toBeHidden();
    await expect(page.locator(".coach-hole")).toBeHidden();
    await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage)
          .filter((key) => key.endsWith(".tutorial"))
          .map((key) => localStorage.getItem(key)),
      ),
    ).toEqual(["done"]);
    // A click takes the line away; the party stays queued.
    await panel.click();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator("#topbar .topbar-queue")).toBeVisible();
  });

  test("the Team Lobby's vote timer picking the team carries the quest on (#3785)", async ({
    page,
  }) => {
    // The vote's own 30 s run out: no hook shortens it.
    test.setTimeout(120_000);
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=arena`);
    const panel = page.locator(".coach-panel");
    const bubble = page.locator(".coach-bubble");
    const target = (id: string): Locator => page.locator(`[data-tutorial~="${id}"]`);
    await target("rail-team-arena").click();
    const stepper = page.locator('.mode-rail-stepper[data-tutorial~="team-size"]');
    await expect(stepper).toHaveClass(/tutorial-pulse/);
    const smaller = stepper.getByRole("button", { name: "Smaller team" });
    while (!(await smaller.isDisabled())) {
      await smaller.click();
    }
    const find = page.locator("#topbar .lobby-find");
    await expect(find).toHaveClass(/tutorial-pulse/);
    await find.click();
    await expect(page.locator(".team-lobby-stage")).toHaveText("Choose a team build");
    await expect(target("team-builds").first()).toHaveClass(/tutorial-pulse/);

    // Nobody votes: the timer picks, and the quest says so and goes on.
    await expect(page.locator(".team-lobby-stage")).toHaveText("Take a character", {
      timeout: 45_000,
    });
    await expect(bubble).toContainText("Time ran out, so the lobby picked a team for you.");
    await expect(target("team-lobby")).toHaveClass(/tutorial-pulse/);
    await page.locator(".team-lobby-seat").first().click();
    await expect(panel).toHaveText(/You're in the queue\. Good luck\./);
  });

  test("Skip tutorial, confirmed, ends it for good", async ({ page }) => {
    await page.goto(`./?menu-background=${FLAT_MAP}&tutorial-menu=menu`);
    const panel = page.locator(".coach-panel");
    await panel.getByRole("button", { name: "Skip tutorial" }).click();
    await panel.getByRole("button", { name: "Skip", exact: true }).click();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator(".screen-rail")).toBeVisible();

    await pastTheSplash(page, FLAT_MAP);
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".coach")).toHaveCount(0);
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});
