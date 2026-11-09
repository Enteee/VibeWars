import { t } from "../i18n/index.js";
import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import { prefersReducedMotion } from "./recharge-overlay.js";
import {
  meetFromHeard,
  SPLASH_CRASH_OFFSET_MS,
  SPLASH_FLY_MS,
  SPLASH_MEET_MS,
  SPLASH_MUSIC_WAIT_MS,
  splashPhase,
  type SplashPhase,
} from "./splash-timeline.js";

/** The game's name, in its two colours: not translated. */
const NAME_VIBE = "Vibe";
const NAME_WARS = "Wars";

const SEEN_KEY = `${STORAGE_NAMESPACE}.splash-seen`;

/** Denied storage reads as not seen. */
export function splashSeen(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) !== null;
  } catch {
    return false;
  }
}

function markSplashSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Denied storage: it just shows again on the next load.
  }
}

/** A key that is neither held down nor a bare modifier, or any press. */
export function isSplashInput(event: KeyboardEvent | PointerEvent): boolean {
  if (event.type === "pointerdown") {
    return true;
  }
  const { key, repeat } = event as KeyboardEvent;
  return !repeat && !["Shift", "Control", "Alt", "Meta"].includes(key);
}

export interface Splash {
  /** Over now: everything of it is gone, and `onDone` has run. */
  end(): void;
}

export interface SplashOptions {
  /** Draws the fight into the element; resolves to what stops it. */
  readonly startFight: (stage: HTMLElement) => Promise<() => void>;
  /**
   * Once: on the first input, or at the prompt under reduced motion, with
   * `startAtEpochMs` `null`. `false` when nothing will play; otherwise
   * `onHeard` says when the theme's first beat is heard.
   */
  readonly playTheme: (
    startAtEpochMs: number | null,
    onHeard: (heardAtEpochMs: number) => void,
  ) => boolean;
  readonly onDone: () => void;
}

/** The first screen of a tab session (#2884): a live fight, then the name. */
export function showSplash(parent: HTMLElement, options: SplashOptions): Splash {
  markSplashSeen();
  const root = document.createElement("div");
  root.className = "splash";
  root.dataset.testid = "splash";
  const stage = document.createElement("div");
  stage.className = "splash-stage";
  const scrim = document.createElement("div");
  scrim.className = "splash-scrim";
  const hint = document.createElement("p");
  hint.className = "splash-hint";
  hint.textContent = t("splash.clickToStart");
  const title = document.createElement("div");
  title.className = "splash-title";
  const vibe = document.createElement("span");
  vibe.className = "splash-vibe";
  vibe.textContent = NAME_VIBE;
  const wars = document.createElement("span");
  wars.className = "splash-wars";
  wars.textContent = NAME_WARS;
  const wordmark = document.createElement("h1");
  wordmark.className = "splash-wordmark";
  wordmark.setAttribute("dir", "ltr");
  wordmark.append(vibe, wars);
  const rule = document.createElement("div");
  rule.className = "splash-rule";
  const prompt = document.createElement("p");
  prompt.className = "splash-prompt";
  prompt.textContent = t("splash.pressAnyKey");
  title.append(wordmark, rule, prompt);
  const flash = document.createElement("div");
  flash.className = "splash-flash";
  root.append(stage, scrim, hint, title, flash);
  parent.appendChild(root);

  let armedAtMs: number | undefined;
  let meetAtMs: number | undefined;
  let phase: SplashPhase = "waiting";
  let ended = false;
  let stopFight: (() => void) | undefined;
  let frame = 0;

  const show = (next: SplashPhase): void => {
    phase = next;
    root.dataset.phase = next;
    hint.hidden = next !== "waiting";
    root.dataset.reducedMotion = String(prefersReducedMotion());
    if (next === "prompt" && prefersReducedMotion()) {
      options.playTheme(null, () => undefined);
    }
  };
  const tick = (): void => {
    const nowMs = performance.now();
    if (
      armedAtMs !== undefined &&
      meetAtMs === undefined &&
      nowMs - armedAtMs >= SPLASH_MUSIC_WAIT_MS
    ) {
      meetAtMs = nowMs + SPLASH_FLY_MS;
    }
    const next = splashPhase(armedAtMs, meetAtMs, nowMs, prefersReducedMotion());
    if (next !== phase) {
      show(next);
    }
    // Nothing further changes at the prompt.
    if (next !== "prompt") {
      frame = requestAnimationFrame(tick);
    }
  };
  const onInput = (event: KeyboardEvent | PointerEvent): void => {
    if (!isSplashInput(event)) {
      return;
    }
    if (phase === "waiting") {
      const armedAt = performance.now();
      armedAtMs = armedAt;
      show("armed");
      if (!prefersReducedMotion()) {
        const started = options.playTheme(
          Date.now() + SPLASH_MEET_MS - SPLASH_CRASH_OFFSET_MS,
          (heardAtEpochMs) => {
            if (!ended && meetAtMs === undefined) {
              meetAtMs = meetFromHeard(heardAtEpochMs, Date.now(), performance.now());
            }
          },
        );
        if (!started) {
          meetAtMs = armedAt + SPLASH_MEET_MS;
        }
      }
    } else if (phase === "prompt") {
      end();
    }
  };
  const end = (): void => {
    if (ended) {
      return;
    }
    ended = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onInput);
    window.removeEventListener("pointerdown", onInput);
    stopFight?.();
    root.remove();
    options.onDone();
  };

  window.addEventListener("keydown", onInput);
  window.addEventListener("pointerdown", onInput);
  show("waiting");
  frame = requestAnimationFrame(tick);
  options.startFight(stage).then(
    (stop) => {
      if (ended) {
        stop();
      } else {
        stopFight = stop;
      }
    },
    (error: unknown) => {
      // No arena to show: straight to the menu, and nothing said.
      console.warn("[web] no splash fight", error);
      end();
    },
  );
  return { end };
}
