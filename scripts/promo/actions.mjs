/**
 * Input scripts for the trailer's action shots (#3982). Each helper drives
 * the page through the keyboard and steps the frame clock, so the video is
 * smooth; none reads game state, because the match page exposes only its
 * `__capture` combat events. A scene's script is a loop of these until its
 * event shows.
 */

/** @typedef {{ steps(count: number): Promise<void> }} Steps */
/** @typedef {{ t: number, kind: string, skillId: string }} Seen */

const FPS = 20;
const frames = (/** @type {number} */ ms) => Math.round((ms * FPS) / 1000);

/** @param {import("@playwright/test").Page} page */
export async function seenEvents(page) {
  return page.evaluate(
    () =>
      /** @type {{ t: number, kind: string, skillId: string }[]} */ (
        /** @type {unknown} */ (Reflect.get(globalThis, "__capture")) ?? []
      ),
  );
}

/**
 * Step the clock, `ms` at a time, until an event matches `predicate` or
 * `limitMs` has passed.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Steps} stepper
 * @param {(event: Seen) => boolean} predicate
 * @param {number} limitMs
 * @param {() => Promise<void>} [between]  run before each wait: the scene's input
 * @returns {Promise<Seen | undefined>}
 */
export async function waitEvent(page, stepper, predicate, limitMs, between) {
  for (let waited = 0; waited < limitMs; waited += 500) {
    await between?.();
    await stepper.steps(frames(500));
    const hit = (await seenEvents(page)).find(predicate);
    if (hit !== undefined) {
      return hit;
    }
  }
  return undefined;
}

/**
 * Take the nearest foe (Tab) and press skill `slot` (1 to 8).
 *
 * @param {import("@playwright/test").Page} page
 * @param {number} slot
 */
export async function castAt(page, slot) {
  await page.keyboard.press("Tab");
  await page.keyboard.press(`Digit${String(slot)}`);
}

/**
 * Press every skill slot once, left to right, then attack: the build's
 * own mix goes off, and whichever slot is the AoE or the heal is among them.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Steps} stepper
 */
export async function cycleSkills(page, stepper) {
  await page.keyboard.press("Tab");
  for (let slot = 1; slot <= 8; slot += 1) {
    await page.keyboard.press(`Digit${String(slot)}`);
    await stepper.steps(frames(250));
  }
  await page.keyboard.press("Space");
}

/**
 * Walk forward for `ms` (W is toward the cursor, held at the centre).
 *
 * @param {import("@playwright/test").Page} page
 * @param {Steps} stepper
 * @param {number} ms
 */
export async function advance(page, stepper, ms) {
  await page.keyboard.down("KeyW");
  await stepper.steps(frames(ms));
  await page.keyboard.up("KeyW");
}
