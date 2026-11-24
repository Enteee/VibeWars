/**
 * The pure parts of the promo cut (#3811): which moments of a capture to
 * use, where the music's beat falls, and where a caption sits. No I/O, so
 * `plan.test.mjs` can check them; `assemble.mjs` does the ffmpeg.
 */

/**
 * @typedef {{ t: number, kind: string, skillId: string }} CaptureEvent  `t` in seconds of the video
 * @typedef {{ scene: string, from: number, to: number, speed: number }} Cut  a slice of a scene video, played at `speed`
 */

/** What the fight scene looks for, in the order the storyboard shows it. */
export const FIGHT_KINDS = ["interrupted", "resurrected", "invulnerable"];

/**
 * The first event of `kind` at or after `after`, or `undefined`.
 *
 * @param {readonly CaptureEvent[]} events
 * @param {string} kind
 * @param {number} [after]
 */
export function firstOf(events, kind, after = 0) {
  return events.find((event) => event.kind === kind && event.t >= after);
}

/**
 * The fight's cuts: a run-up at full speed, the event itself in slow
 * motion, then the aftermath, for each kind found. `interrupted` is the
 * one the music must land on, so the plan names its slow-mo cut `hit`.
 * Returns `undefined` when there is no interrupt, which the caller treats as a failed run.
 *
 * @param {readonly CaptureEvent[]} events
 * @param {number} sceneSeconds length of the scene video
 * @returns {{ cuts: Cut[], hit: number } | undefined} `hit`: index of the interrupt's slow-mo cut
 */
export function fightCuts(events, sceneSeconds) {
  const interrupt = firstOf(events, "interrupted", 2);
  if (interrupt === undefined) {
    return undefined;
  }
  /** @type {Cut[]} */
  const cuts = [
    { scene: "fight", from: Math.max(0, interrupt.t - 2), to: interrupt.t - 0.4, speed: 1 },
    { scene: "fight", from: interrupt.t - 0.4, to: interrupt.t + 0.6, speed: 0.5 },
  ];
  const hit = 1;
  let after = interrupt.t + 0.6;
  for (const kind of FIGHT_KINDS.slice(1)) {
    const found = firstOf(events, kind, after);
    if (found !== undefined && found.t + 1.5 < sceneSeconds) {
      cuts.push({ scene: "fight", from: found.t - 1, to: found.t + 1.5, speed: 1 });
      after = found.t + 1.5;
    }
  }
  return { cuts, hit };
}

/**
 * Seconds a cut takes on the timeline.
 *
 * @param {Cut} cut
 */
export function cutSeconds(cut) {
  return (cut.to - cut.from) / cut.speed;
}

/**
 * The beat grid of a track from its onsets: the period is the median gap
 * between onsets folded into 0.3-1.0 s, the phase the first onset.
 *
 * @param {readonly number[]} onsets seconds, ascending
 * @returns {{ period: number, phase: number } | undefined}
 */
export function beatGrid(onsets) {
  if (onsets.length < 4) {
    return undefined;
  }
  const gaps = [];
  for (let at = 1; at < onsets.length; at += 1) {
    let gap = (onsets[at] ?? 0) - (onsets[at - 1] ?? 0);
    while (gap > 0 && gap < 0.3) {
      gap *= 2;
    }
    while (gap > 1) {
      gap /= 2;
    }
    if (gap >= 0.3) {
      gaps.push(gap);
    }
  }
  gaps.sort((a, b) => a - b);
  const period = gaps[Math.floor(gaps.length / 2)];
  const phase = onsets[0];
  return period === undefined || phase === undefined ? undefined : { period, phase };
}

/**
 * Where to start the music so a beat falls at `at` on the timeline: the
 * first offset `>= 0` that puts a beat there.
 *
 * @param {{ period: number, phase: number }} grid
 * @param {number} at timeline seconds of the frame the beat must hit
 */
export function musicOffset(grid, at) {
  // A beat sits at phase + k * period in the music; it must sit at `at`.
  const offset = (grid.phase - at) % grid.period;
  return offset < 0 ? offset + grid.period : offset;
}

/**
 * A caption's box on a frame: a lower third on 16:9, higher and
 * narrower on 9:16, where phones' own controls cover the bottom.
 *
 * @param {number} width
 * @param {number} height
 */
export function captionBox(width, height) {
  const portrait = height > width;
  return {
    fontSize: Math.round((portrait ? width : height) * (portrait ? 0.065 : 0.07)),
    // Centre line of the text, as a fraction of the frame's height.
    y: Math.round(height * (portrait ? 0.74 : 0.86)),
    maxChars: portrait ? 22 : 48,
  };
}

/**
 * Break `text` at spaces into lines of at most `maxChars`.
 *
 * @param {string} text
 * @param {number} maxChars
 */
export function wrap(text, maxChars) {
  /** @type {string[]} */
  const lines = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= maxChars) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}
