import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import {
  getAudioContext,
  initAudio,
  registerSynthSounds,
  samples,
  webaudioOutput,
  webaudioRepl,
  type Hap,
} from "@strudel/webaudio";

import referenceDawn from "./reference-dawn.strudel.js?raw";

/**
 * Spike (#368): Strudel in a sandboxed, opaque-origin iframe. The game
 * talks to it only through `postMessage`. Throwaway: step 4 lifts from it.
 *
 * `?timers=worker` drives the scheduler from a Worker, `?timers=default`
 * from the iframe's own `setInterval`, which a hidden tab throttles.
 */

type ToHost = { type: "play" } | { type: "stop" } | { type: "setIntensity"; level: number };

const params = new URLSearchParams(location.search);
const timers = params.get("timers") === "worker" ? workerTimers() : undefined;

let intensity = 0;

/** A layer that plays only while the director's intensity is at least `n`. */
const layer = (n: number, pat: core.Pattern): core.Pattern =>
  pat.mask(core.ref(() => (intensity >= n ? 1 : 0)));

const post = (message: object): void => {
  parent.postMessage(message, "*");
};

/** Every triggered event goes to the parent, so a test can count them. */
const countingOutput = (
  hap: Hap,
  deadline: number,
  duration: number,
  cps: number,
  t: number,
): unknown => {
  post({
    type: "hap",
    s: hap.value.s ?? "",
    cycle: hap.whole?.begin.valueOf() ?? 0,
    target: t,
    now: getAudioContext().currentTime,
  });
  return webaudioOutput(hap, deadline, duration, cps, t);
};

const repl = webaudioRepl({
  transpiler,
  defaultOutput: countingOutput,
  onEvalError: (error) => {
    post({ type: "error", message: error.message });
  },
  ...timers,
});

async function boot(): Promise<void> {
  Object.defineProperty(globalThis, "INTENSITY", { get: () => intensity });
  await core.evalScope(core, mini, tonal, { layer });
  registerSynthSounds();
  const base = new URL(`${import.meta.env.BASE_URL}music/samples/`, location.href).href;
  await samples({ ping: "ping.wav" }, base);
  post({ type: "ready", origin: self.origin, timers: timers ? "worker" : "default" });
}

let started = false;
addEventListener("message", (event: MessageEvent<ToHost>) => {
  if (event.source !== parent) return;
  const message = event.data;
  switch (message.type) {
    case "play":
      void play();
      return;
    case "stop":
      repl.stop();
      started = false;
      return;
    case "setIntensity":
      intensity = message.level;
      post({ type: "intensity", level: intensity, cycle: repl.scheduler.now() });
      return;
  }
});

async function play(): Promise<void> {
  if (started) return;
  started = true;
  await initAudio();
  await getAudioContext().resume();
  // `?mute`: same events, no sound, to see how an inaudible tab is throttled.
  await repl.evaluate(
    params.has("mute") ? referenceDawn.replace(".postgain(.38)", ".postgain(0)") : referenceDawn,
  );
  post({ type: "playing", state: getAudioContext().state, cps: repl.scheduler.cps });
}

// Once a second: where the scheduler is, for the hidden-tab measurement.
setInterval(() => {
  if (started)
    post({ type: "tick", cycle: repl.scheduler.now(), now: getAudioContext().currentTime });
}, 1000);

/**
 * `setInterval`/`clearInterval` backed by a dedicated Worker, whose timers
 * a hidden tab does not throttle the way it throttles the page's.
 */
function workerTimers(): {
  setInterval: (callback: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
} {
  const source = `const ids = new Map();
onmessage = (e) => {
  const [op, id, ms] = e.data;
  if (op === "set") ids.set(id, setInterval(() => postMessage(id), ms));
  else { clearInterval(ids.get(id)); ids.delete(id); }
};`;
  const worker = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
  const callbacks = new Map<number, () => void>();
  let next = 1;
  worker.onmessage = (event: MessageEvent<number>) => callbacks.get(event.data)?.();
  return {
    setInterval: (callback, ms) => {
      const id = next++;
      callbacks.set(id, callback);
      worker.postMessage(["set", id, ms]);
      return id;
    },
    clearInterval: (id) => {
      callbacks.delete(id);
      worker.postMessage(["clear", id]);
    },
  };
}

void boot().catch((error: unknown) => {
  post({ type: "error", message: String(error) });
});
