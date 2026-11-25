import { expect, test, type Locator, type Page } from "@playwright/test";

import { BUILD_FORMAT_VERSION } from "../../apps/web/src/storage/build-transfer.js";
import { TEAM_FORMAT_VERSION } from "../../apps/web/src/storage/team-transfer.js";
import { STARTER_BUILDS } from "../../packages/game-core/src/starter-builds.js";
import { projection } from "../camera.js";
import { hudMenuRow } from "./hud-menu.js";

/**
 * A map whose ground is layer 0, and one whose ground is layer 1 (#3248):
 * the tutorial walks on either. No player map is flat (#3444), so the flat
 * one is the bench's frozen flat map, which the e2e build offers.
 */
export const FLAT_MAP = "bench-flat";

/** A team code of two starter builds, each with a skill (#3544): a playable team of two. */
export function duoCode(): string {
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
export const RAISED_MAP = "arena-crossroads";
/** Where the pair arrives in the canyon (#3247), its arrival pad. */
export const CANYON_ARRIVAL = { x: 1000, y: 3500 };
/**
 * Beside the canyon's first rockfall, 200 south of its middle (#3247):
 * near enough for each of its strikes to count as a dodge, out of its reach.
 */
export const DODGE_SPOT = { x: 1860, y: 3620 };
/** The middle of the canyon's cracked wall (#3302), station 5's, east of its mark. */
export const WALL_MIDDLE = { x: 3600, y: 3500 };
/**
 * West of the canyon's clearing (#3303), out of its rockfall's reach and
 * in a heal's range of the tutor waiting east of it.
 */
export const BY_CLEARING = { x: 4900, y: 3500 };
/**
 * Station 7's way round the mire (#3310): up the north leg's east side and
 * through the bulge east of the mud, in no zone; then its mark, north of it.
 */
export const CLEAR_WAY = [
  { x: 7000, y: 3150 },
  { x: 7150, y: 2800 },
];
export const PAST_THE_MUD = { x: 6900, y: 2420 };
/**
 * On station 9's ledge (#3323), just west of its stairs' top and near its
 * north edge: a click here picks the deck, never the ground beside or
 * under it, so the walk up ends on the ledge (the ledge spans x 3290-3910,
 * y 1800-1980).
 */
export const ON_THE_LEDGE = { x: 3850, y: 1830 };
/**
 * Station 11's way from the foot of station 9's ledge (#3326): south, clear
 * of its stairs, west along the second row, north up the west leg, onto
 * the top of the tunnel's west steps, one long stride from the tunnel's
 * west half. The west leg bends west past its foot: a stride north from
 * there can land where no path goes, so one waypoint takes the bend.
 */
export const TO_THE_TUNNEL = [
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
export const CLEAR_ABOVE = 200;
/** How far each stride of station 11 (#3326) reaches, in world units: still inside the view. */
export const LONG_STRIDE = 500;
/** How far to one side station 11's walk clicks when a click has not moved it (#3363). */
export const SIDESTEP = 60;
/**
 * In station 11's tunnel (#3326), west and east of its middle: the tunnel
 * (x 2080-2800, y 450-950, layer 0) is a layer, 56 world units, under the
 * rock over it, so its floor is drawn this far below where it lies.
 */
export const IN_THE_TUNNEL_WEST = { x: 2200, y: 700 + 56 };
export const IN_THE_TUNNEL_EAST = { x: 2700, y: 700 + 56 };
/** Station 11's mark (#3326), just past the top of the tunnel's east steps. */
export const PAST_THE_TUNNEL = { x: 3240, y: 700 };
/** Station 12's two rats (#3331), west of them: `site-12` is at x 3800. */
export const BY_THE_RATS = { x: 3600, y: 700 };
/** Station 13's fork (#3332), `site-13`, where its mark is drawn. */
export const AT_THE_FORK = { x: 4900, y: 700 };
/**
 * Station 13's two arms round the rock island (#3792), each by its mark
 * (`site-13n`, `site-13s`) to the rejoin (`site-13r`), where it is done.
 */
export const NORTH_ARM = [
  { x: 5120, y: 460 },
  { x: 5450, y: 375 },
  { x: 5780, y: 460 },
];
export const SOUTH_ARM = [
  { x: 5150, y: 1250 },
  { x: 5450, y: 1335 },
  { x: 5750, y: 1250 },
];
export const AT_THE_REJOIN = { x: 6150, y: 700 };
/** Station 14's mist gate (#3334), `CANYON_EXIT` at the canyon's east end. */
export const IN_THE_MIST_GATE = { x: 7600, y: 700 };
/** The tutor's id, as its party row names it. */
export const TUTOR_ID = "tutorial-tutor";
/** The furthest a click in the canyon sends the player, in world units: well inside the view. */
export const STRIDE = 250;

/**
 * Through the splash to its end, where a first-timer is offered the
 * tutorial (#3218), with the menu fight, which the tutorial plays on,
 * pinned to `mapId`.
 */
export async function pastTheSplash(page: Page, mapId: string, fragment = ""): Promise<void> {
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
export async function takeTheArm(
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
export interface Lesson {
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
export async function learn(page: Page, mapId: string, station: number): Promise<Lesson> {
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

/**
 * The tutorial played through on `mapId` (#3218), from the start and from
 * each seeded station (#3383): a spec per map, so no one spec outgrows an
 * e2e-repeat job (#3873).
 */
export function learnTests(mapId: string): void {
  test(`Learn on ${mapId}, from the start`, async ({ page }) => {
    // A walk, a drag and a walk in a sim that runs no faster than the page
    // draws: a loaded runner takes most of a minute (#3222).
    test.setTimeout(240_000);
    const { frame, stage, hasSaid } = await learn(page, mapId, 1);
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

    // Station 2 (#3222): a right-drag north to the leash finds it, no wheel (#3970).
    await expect
      .poll(() => hasSaid("Maybe this teleporter gets us around the battlefield. Look north!"), {
        timeout: 10_000,
      })
      .toBe(true);
    await expect(frame).not.toHaveAttribute("data-mark", /.+/);
    // Walking is locked while it runs (#3970): W held does not move the view's centre.
    const camera = async (): Promise<readonly number[]> =>
      ((await stage.getAttribute("data-camera")) ?? "").split(",").map(Number);
    let settled: readonly number[] = [];
    await expect(async () => {
      settled = await camera();
      await page.waitForTimeout(300);
      expect(await camera()).toEqual(settled);
    }).toPass({ timeout: 10_000 });
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(500);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(300);
    expect(await camera()).toEqual(settled);
    const box = await page.locator("#viewport canvas:not(.compass)").boundingBox();
    if (box === null) {
      throw new Error("no canvas");
    }
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(centre.x, centre.y);
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
    // (#3331), the walk on to the fork some 30 s; the junction is the next
    // test's, which a loaded runner's 7 min here left no room for.
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
    // tutor walks over and hits it. The target bar its line names is lit
    // meanwhile (#3884).
    await expect
      .poll(() => hasSaid("Two rats. You pick, I hit. Call one."), { timeout: 15_000 })
      .toBe(true);
    await expect(page.locator(".hud-target")).toHaveClass(/tutorial-pulse/);
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

    // Station 13 (#3332, #3792): on east to the fork, the compass lit.
    await expect.poll(() => hasSaid("Left or right? You call it."), { timeout: 15_000 }).toBe(true);
    await expect(page.locator("canvas.compass")).toHaveClass(/tutorial-pulse/);
    await expect(async () => {
      await walkTo(AT_THE_FORK, LONG_STRIDE);
      await near(AT_THE_FORK, 100);
    }).toPass({ timeout: 90_000 });
  });

  test(`Learn on ${mapId}, from the junction by its north arm`, async ({ page }) => {
    // Seeded at the junction's fork (#3792), the arm some 40 s.
    test.setTimeout(180_000);
    const { frame, stage, hasSaid, walkTo } = await learn(page, mapId, 12);
    // Station 13 (#3332, #3792): a wheel-click on the north arm sends the
    // tutor along it, and the player walks it too, round the island to the
    // rejoin, told once that the call was heard.
    await expect.poll(() => hasSaid("Left or right? You call it."), { timeout: 15_000 }).toBe(true);
    await takeTheArm(page, stage, frame, hasSaid, walkTo, NORTH_ARM);
    expect(await hasSaid("On my way. Meet me where the paths join.")).toBe(true);
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
    await expect.poll(() => hasSaid("Left or right? You call it."), { timeout: 15_000 }).toBe(true);
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
    const leave = await hudMenuRow(page, "leave");
    await leave.getByRole("button", { name: "leave match" }).click();
    await leave.getByRole("button", { name: "yes" }).click();
    await expect(page.locator(".screen-rail")).toBeVisible({ timeout: 15_000 });
    await expect(frame).toHaveCount(0);
    await expect(page.locator(".coach-panel")).toBeVisible();

    await pastTheSplash(page, mapId);
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
}
