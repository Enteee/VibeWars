import { expect, test, type Page } from "@playwright/test";

import { projection } from "./camera.js";

/**
 * A map whose ground is layer 0, and one whose ground is layer 1 (#3248):
 * the tutorial walks on either.
 */
const FLAT_MAP = "jungle-ruins";
const RAISED_MAP = "arena-crossroads";
/** Where the pair arrives in the canyon (#3247), its first map's arrival pad. */
const CANYON_ARRIVAL = { x: 1000, y: 1800 };
/**
 * Beside the canyon's first rockfall, 200 south of its middle (#3247):
 * near enough for each of its strikes to count as a dodge, out of its reach.
 */
const DODGE_SPOT = { x: 1860, y: 1920 };
/** The middle of the canyon's cracked wall (#3302), station 5's, east of its mark. */
const WALL_MIDDLE = { x: 3600, y: 1800 };
/**
 * West of the canyon's clearing (#3303), out of its rockfall's reach and
 * in a heal's range of the tutor waiting east of it.
 */
const BY_CLEARING = { x: 4900, y: 1800 };
/**
 * Station 7's way round the mire (#3310): up the north leg's east side and
 * through the bulge east of the mud, in no zone; then its mark, north of it.
 */
const CLEAR_WAY = [
  { x: 7000, y: 1450 },
  { x: 7150, y: 1100 },
];
const PAST_THE_MUD = { x: 6900, y: 720 };
/**
 * On station 9's ledge (#3323), just west of its stairs' top and near its
 * north edge: a click here picks the deck, never the ground beside or
 * under it, so the walk up ends on the ledge (the ledge spans x 3290-3910,
 * y 1800-1980 on the canyon's second map).
 */
const ON_THE_LEDGE = { x: 3850, y: 1830 };
/**
 * Where station 10's mark (#3325), at the high deck's middle, is drawn:
 * the deck (x 1780-2180, y 1480-1740, layer 3) stands two layers over the
 * ground (layer 1), 112 world units up, so a click here picks the mark.
 */
const OVER_THE_HIGH_DECK = { x: 1980, y: 1610 - 112 };
/**
 * On the canyon floor south of station 10's first flight (#3325), clear of
 * the tutor waiting at its foot (x 2350, y 1850).
 */
const SOUTH_OF_THE_FLIGHTS = { x: 2600, y: 2050 };
/**
 * On the ground under station 10's high deck (#3325), in the notch of the
 * bounds that holds the deck and its landing: 210 world units below where
 * the deck is drawn, so from here a plain click on it is one stride.
 */
const UNDER_THE_HIGH_DECK = { x: 1980, y: 1700 };
/**
 * Where the middle of station 10's landing (#3325) is drawn: the landing
 * (x 2260-2440, y 1480-1640, layer 2) stands one layer, 56 world units,
 * over the ground.
 */
const OVER_THE_LANDING = { x: 2350, y: 1560 - 56 };
/**
 * Station 11's way off the high deck (#3326): down both flights, west along
 * the south leg, north up the west one, onto the top of the tunnel's west
 * steps, one long stride from the tunnel's west half. The west leg bends west
 * past its foot: a stride north from there can land where no path goes,
 * so one waypoint takes the bend. Each stride a long
 * one: a short first one from the deck falls on the rock round it.
 */
const TO_THE_TUNNEL = [
  { x: 2350, y: 1950 },
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
/** Station 12's two rats (#3331), west of them: `site-12` on the canyon's second map. */
const BY_THE_RATS = { x: 4000, y: 700 };
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
    test(`Learn on ${mapId}, walk to the mark, look around, step in, dodge in the canyon, break the wall, heal the tutor, round the mud, kill the rats, climb the ledge, up to the high deck, through the tunnel, call a rat: then the menu, and no offer again`, async ({
      page,
    }) => {
      // Four stations, each a walk or a drag in a sim that runs no faster than
      // the page draws: a loaded runner takes most of a minute (#3222), and
      // the canyon's three dodges at least 18 s more (#3247), and the wall
      // some 10 to 15 s, slower where the page draws slowly (#3302), and the
      // walk to the clearing and the heal some 30 s more (#3303), and the
      // walk round the bad ground some 20 s more (#3310), and the walk to the
      // rats and their fight some 60 s more (#3316), and the ledge some 30 s
      // more (#3323), and the walk up to the high deck some 30 s more (#3325), and the walk
      // round to the tunnel and through it two to five minutes more (#3326).
      test.setTimeout(900_000);
      await pastTheSplash(page, mapId);
      await page.getByRole("button", { name: "Learn to play" }).click();
      const frame = page.locator(".tutorial-frame");
      await expect(frame.locator(".tutorial-said")).toHaveText(
        "This war never ends. Walk with me; I have an idea.",
      );
      await expect(frame.locator(".tutorial-how")).toContainText("W");
      // The guide's praise shows for 2.5 s only, which a slow runner can
      // outlast: keep every line said on the body, which outlives the frame.
      await frame.evaluate((element) => {
        new MutationObserver(() => {
          const text = element.querySelector(".tutorial-said")?.textContent ?? "";
          const said = document.body.getAttribute("data-said-log") ?? "";
          if (!said.endsWith(`|${text}`)) {
            document.body.setAttribute("data-said-log", `${said}|${text}`);
          }
        }).observe(element, { childList: true, characterData: true, subtree: true });
      });
      const saidLog = page.locator("body");
      const hasSaid = async (line: string): Promise<boolean> =>
        ((await saidLog.getAttribute("data-said-log")) ?? "").split("|").includes(line);
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

      // Station 4 (#3247): the canyon, the player on its arrival.
      await expect(frame).toHaveAttribute("data-world", "canyon", { timeout: 15_000 });
      const stage = page.locator("#viewport");
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

      // Station 5 (#3302): up to the wall's mark, target the wall, strike it until it falls.
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

      // Station 8 (#3316): on to the canyon's second map, its three rats at
      // the pocket west of the arrival; the closest targeted again and
      // again, two skills and the plain attack kill them all.
      await expect
        .poll(() => hasSaid("Rats! Different skills, different jobs."), { timeout: 15_000 })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-world", "canyon-2");
      await expect(frame).toHaveAttribute("data-rats", "3", { timeout: 10_000 });
      await expect(frame).toHaveAttribute("data-mark", /^-?\d+,-?\d+$/);
      const [pocketX = 0, pocketY = 0] = ((await frame.getAttribute("data-mark")) ?? "")
        .split(",")
        .map(Number);
      await expect(async () => {
        await walkTo({ x: pocketX, y: pocketY });
        const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
          .split(",")
          .map(Number);
        expect(Math.hypot(cx - pocketX, cy - pocketY)).toBeLessThan(150);
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

      // Station 10 (#3325): a click on the high deck walks up both flights.
      await expect
        .poll(() => hasSaid("Steps join layers. Walk on, and they carry you up."), {
          timeout: 15_000,
        })
        .toBe(true);
      await expect(frame).toHaveAttribute("data-mark-layer", "3");
      const high = "High ground. Foes below can't easily reach you.";
      // Along the ground to under the deck, an Alt walk at every stride: a
      // plain one would pick the ledge or the landing on the way, and from
      // the ledge the next stride lies out of bounds. South of the tutor
      // first, so no stride falls on it or north of the canyon floor.
      for (const waypoint of [SOUTH_OF_THE_FLIGHTS, UNDER_THE_HIGH_DECK]) {
        await expect(async () => {
          await page.keyboard.down("Alt");
          await walkTo(waypoint);
          await page.keyboard.up("Alt");
          const [cx = 0, cy = 0] = ((await stage.getAttribute("data-camera")) ?? "")
            .split(",")
            .map(Number);
          expect(Math.hypot(cx - waypoint.x, cy - waypoint.y)).toBeLessThan(150);
        }).toPass({ timeout: 90_000 });
      }
      // A click on the landing climbs the first flight, and the landing,
      // stood on, gets its line; a click on the deck from there, the second.
      // One click from the ground taking both is the unit test's.
      await expect(async () => {
        if (await hasSaid("One more flight.")) {
          return;
        }
        await walkTo(OVER_THE_LANDING);
        await expect.poll(() => hasSaid("One more flight."), { timeout: 10_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });
      await expect(async () => {
        if (await hasSaid(high)) {
          return;
        }
        await walkTo(OVER_THE_HIGH_DECK);
        await expect.poll(() => hasSaid(high), { timeout: 5_000 }).toBe(true);
      }).toPass({ timeout: 60_000 });

      // Station 11 (#3326): down off the deck, round to the tunnel's west
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
      await expect(page.locator(".screen-rail")).toBeVisible({ timeout: 15_000 });
      await expect(frame).toHaveCount(0);

      await pastTheSplash(page, mapId);
      await expect(page.locator(".tutorial-offer")).toHaveCount(0);
    });
  }

  test("a guild link, even through a forced splash, is never offered it", async ({ page }) => {
    await pastTheSplash(page, FLAT_MAP, "#guild=VW.gold.black.cross");
    await expect(page.locator(".screen-rail")).toBeVisible();
    await expect(page.locator(".tutorial-offer")).toHaveCount(0);
  });
});
