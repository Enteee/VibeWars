import { expect, test, type Page } from "@playwright/test";

import { SPAWN_BUBBLE_RADIUS } from "../packages/game-core/src/distances.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../packages/game-core/src/ruleset.js";
import { joinFriend } from "./helpers/menu.js";
import { enterOwnTeams, hostLobby, openPeers, waitForMatchStart } from "./helpers/peers.js";
import { bringStarter, starterKey } from "./helpers/starter.js";
import { key } from "./keys.js";

const BUILD = "Elementalist/Mesmer";
/** A timed enchantment on yourself: allowed before the start (#3910). */
const ARMOR_OF_EARTH = starterKey(BUILD, "elementalist.armor-of-earth");

/** One look at the host's page: is the pre-match line up, and where its view stands. */
interface Sample {
  readonly held: boolean;
  /** The line's text while it is up. */
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Start sampling `page` every 100 ms, the line and `data-camera` (which
 * follows the hero) read together, in the page: a read from the test
 * could see the line of one frame and the view of a later one.
 */
async function startSampling(page: Page): Promise<() => Promise<readonly Sample[]>> {
  await page.evaluate(() => {
    const samples: Sample[] = [];
    (window as unknown as { preMatchSamples: Sample[] }).preMatchSamples = samples;
    setInterval(() => {
      const line = document.querySelector<HTMLElement>(".hud-pre-match");
      const [x = 0, y = 0] = (
        document.querySelector<HTMLElement>("#viewport")?.dataset.camera ?? ""
      )
        .split(",")
        .map(Number);
      samples.push({ held: line?.hidden === false, text: line?.textContent ?? "", x, y });
    }, 100);
  });
  return () =>
    page.evaluate(() => (window as unknown as { preMatchSamples: Sample[] }).preMatchSamples);
}

test("#3818: both in, the match counts 10 s down with everyone held in the spawn, then starts", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const { context, pages } = await openPeers(browser, 2);
  const [host, guest] = pages as [Page, Page];
  try {
    // The pages share one storage: both play this character, a side of one each.
    // The host runs the real 10 s/20 s, not the e2e build's 1 s (#3855).
    await bringStarter(host, BUILD, "./?pre-match=real");
    const code = await hostLobby(host);
    await guest.goto("./");
    await joinFriend(guest, code);
    await guest.getByRole("button", { name: "join team 2" }).click();
    await guest.getByRole("button", { name: "Ready", exact: true }).click();
    await host.getByRole("button", { name: "join team 1" }).click();
    await host.getByRole("button", { name: "Ready", exact: true }).click();
    await host.bringToFront();
    // Sampled from before the start: a loaded runner can spend most of the
    // countdown entering the match, so the hold is checked on whatever of
    // it the host still sees.
    const samples = await startSampling(host);
    await host.getByRole("button", { name: "start match" }).click();

    // The host is checked while the guest, a tab behind, still loads: the
    // countdown runs from the moment both scenes are drawn (#3852).
    const line = host.locator(".hud-pre-match");
    await Promise.all([
      enterOwnTeams([{ page: host }, { page: guest }]),
      (async () => {
        // Held: the centre line says when it starts.
        await expect(line).toBeVisible();
        // Above 1 s, so the host runs the real countdown, not the e2e
        // build's (#3855): it fails should ?pre-match=real be lost.
        await expect(line).toHaveText(/^Match starts in ([2-9]|10)$/);
        // Any skill goes while held (#3931): Armor of Earth lands.
        await host.keyboard.press(ARMOR_OF_EARTH);
        const effects = host.getByRole("list", { name: "your effects" });
        await expect(
          effects.getByRole("listitem").filter({ has: host.getByAltText("Armor Boost") }),
        ).toBeVisible();
        // Up from team 1's first spawn on Ember Pits is open ground onto
        // the middle lane: held from now until the hero has walked.
        await host.keyboard.down(key("move-up"));
        // Checked together: a loaded runner spends seconds on each, and the
        // countdown does not wait for them.
        await Promise.all([
          // Your own spawn bubble stands while held (#3909).
          expect(host.locator("#viewport")).toHaveAttribute("data-spawn-bubble", ""),
          // Walked into its wall, the hero is told why (#3909).
          expect(
            host.getByRole("status").filter({
              hasText: "You are held near your spawn until the match starts.",
            }),
          ).toBeVisible(),
          // A picture of it on Ember Pits, round the hero, goes with the
          // report for the eye: no pixel is asserted.
          (async () => {
            const box = await host.locator("#viewport").boundingBox();
            if (box !== null) {
              await host.screenshot({
                path: test.info().outputPath("spawn-bubble.png"),
                clip: {
                  x: box.x + box.width / 2 - 240,
                  y: box.y + box.height / 2 - 200,
                  width: 480,
                  height: 320,
                },
              });
            }
          })(),
        ]);
      })(),
    ]);

    // Started: the line goes, and the key held all along walks.
    await waitForMatchStart([host, guest]);
    // The bubble fades with the start, and leaves nothing behind (#3909).
    await expect(host.locator("#viewport")).not.toHaveAttribute("data-spawn-bubble");
    const speed = MINIMAL_GW_INSPIRED_PVP_V1.movement.maxSpeedUnitsPerSecond;
    // The first held sample is the hero in its spawn: before it, the page
    // was still in the lobby.
    const spawn = (await samples()).find((sample) => sample.held);
    const away = async (): Promise<number> => {
      const last = (await samples()).at(-1);
      return spawn === undefined || last === undefined
        ? 0
        : Math.hypot(last.x - spawn.x, last.y - spawn.y);
    };
    await expect
      .poll(away, { message: "the host should walk off the spawn" })
      .toBeGreaterThan(SPAWN_BUBBLE_RADIUS + speed / 2);
    await host.keyboard.up(key("move-up"));

    // The countdown waits for every scene to be up (#3852), so the host's
    // first look at it is close to the whole 10 s.
    const counted = (await samples()).flatMap(({ held, text }) =>
      held ? (/^Match starts in (\d+)$/.exec(text)?.slice(1, 2) ?? []) : [],
    );
    expect(Number(counted[0]), "the first countdown second the host sees").toBeGreaterThanOrEqual(
      9,
    );

    // While the line was up, the held key walked the hero to its spawn
    // bubble's edge and no further (#3817); started, it walked on past it.
    const held = (await samples()).filter((sample) => sample.held);
    expect(held.length, "samples while held").toBeGreaterThan(0);
    for (const sample of held) {
      expect(Math.hypot(sample.x - (spawn?.x ?? 0), sample.y - (spawn?.y ?? 0))).toBeLessThan(
        SPAWN_BUBBLE_RADIUS + 5,
      );
    }
  } finally {
    await context.close();
  }
});
