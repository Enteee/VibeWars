/**
 * Input scripts for the trailer's action shots (#3982). Each helper drives
 * the page through the keyboard and steps the frame clock, so the video is
 * smooth. They read the page only through `?capture`: its `__capture` combat
 * events (each marked `own` when the local player caused it) and `__captureState`
 * (the player's spot, the gates). A scene's script is a loop of these until its
 * event shows.
 */

/** @typedef {{ steps(count: number): Promise<void> }} Steps */
/** @typedef {{ t: number, kind: string, skillId: string, own: boolean }} Seen */

const FPS = 20;
const frames = (/** @type {number} */ ms) => Math.round((ms * FPS) / 1000);

/** @param {import("@playwright/test").Page} page */
export async function seenEvents(page) {
  return page.evaluate(
    () =>
      /** @type {Seen[]} */ (/** @type {unknown} */ (Reflect.get(globalThis, "__capture")) ?? []),
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

/**
 * The page's `__captureState` (`?capture` only): the local player's spot
 * and which gates are open.
 *
 * @param {import("@playwright/test").Page} page
 * @returns {Promise<{ position: { x: number, y: number } | null, gatesOpen: boolean[] }>}
 */
export async function captureState(page) {
  return page.evaluate(() => {
    const read = /** @type {unknown} */ (Reflect.get(globalThis, "__captureState"));
    const none = { position: null, gatesOpen: /** @type {boolean[]} */ ([]) };
    return typeof read === "function"
      ? /** @type {typeof none} */ (Reflect.apply(read, globalThis, []))
      : none;
  });
}

/**
 * Walk onto `target` (world units): the cursor is held off the screen's
 * centre toward it, W walks to the cursor, and the position read back
 * closes the loop, so the camera's tilt does not matter. Returns once
 * `done` says so or `limitMs` has passed.
 *
 * @param {import("@playwright/test").Page} page
 * @param {Steps} stepper
 * @param {{ x: number, y: number }} target
 * @param {(state: Awaited<ReturnType<typeof captureState>>) => boolean} done
 * @param {number} limitMs
 */
export async function walkTo(page, stepper, target, done, limitMs) {
  await page.keyboard.down("KeyW");
  try {
    for (let waited = 0; waited < limitMs; waited += 250) {
      const state = await captureState(page);
      if (waited % 2000 === 0) {
        console.log(
          `walkTo ${String(waited)} ms: ${JSON.stringify(state)} -> ${JSON.stringify(target)}`,
        );
      }
      if (done(state)) {
        return true;
      }
      if (state.position !== null) {
        const dx = target.x - state.position.x;
        const dy = target.y - state.position.y;
        const length = Math.hypot(dx, dy) || 1;
        await page.mouse.move(960 + (dx / length) * 300, 540 + (dy / length) * 300);
      }
      await stepper.steps(frames(250));
    }
    return false;
  } finally {
    await page.keyboard.up("KeyW");
  }
}
