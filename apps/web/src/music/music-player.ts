import {
  parseHostToGame,
  type GameToHost,
  type HostToGame,
  type MusicLevel,
  type MusicStats,
} from "./host-protocol.js";
import { musicHostUrl } from "./music-urls.js";
import { STRESS_BUILD, audioStressMs } from "./stress.js";

/**
 * The game's side of the music (#371, ADR-0028): a facade over the
 * sandboxed music host. The engine, and everything it costs, loads only
 * after the player's first click or key press; calls made before then,
 * or before the host says `ready`, wait in a queue.
 *
 * The host runs player-written code, and a pattern can navigate its own
 * frame, so the host is untrusted: only messages from its own frame are
 * read, only after `parseHostToGame` accepts them, and a host that stops
 * answering the heartbeat, or floods the game with messages (#878), is
 * torn down rather than waited on.
 */

export interface MusicTrack {
  readonly id: string;
  readonly source: string;
  readonly phraseCycles: number;
}

export interface MusicError {
  readonly message: string;
  readonly line?: number;
  /** The `evaluate` this answers; none for a load or a pattern failing as it plays. */
  readonly evaluation?: number;
}

export interface MusicPlayer {
  /** Play `track` now. */
  load(track: MusicTrack): void;
  /** Switch to `track` on the playing track's next phrase boundary. */
  crossfadeTo(track: MusicTrack): void;
  setIntensity(level: MusicLevel): void;
  /** Ramp the music's volume to `gain`, 0 to 1. */
  setVolume(gain: number, rampSeconds: number): void;
  /**
   * Replace the playing track's pattern with `source` (the beat editor).
   * Returns the evaluation's number, which its answer carries.
   */
  evaluate(source: string): number;
  /** Start again what `stop` stopped. */
  play(): void;
  stop(): void;
  onNowPlaying(handler: (trackId: string) => void): void;
  onError(handler: (error: MusicError) => void): void;
  /** The host replaced the pattern with this evaluation's source. */
  onEvaluated(handler: (evaluation: number) => void): void;
  /** Each second's stats, from a host that measures (`measure` in the deps). */
  onStats(handler: (stats: MusicStats) => void): void;
  /** The host was torn down, after its `onError` said why (#878). */
  onTornDown(handler: (reason: TeardownReason) => void): void;
}

/** Why a host was torn down: it stopped answering, or it sent too much. */
export type TeardownReason = "hung" | "flooded";

/** The host as the player sees it: an iframe in the page, or a test's fake. */
export interface MusicFrame {
  post(message: GameToHost): void;
  destroy(): void;
}

export interface MusicPlayerDeps {
  /**
   * Make the host. It calls `receive` only with messages from that host:
   * parsed, or `null` for one that did not parse, which still counts (#878).
   */
  readonly createFrame: (receive: (message: HostToGame | null) => void) => MusicFrame;
  /**
   * Where the first gesture is heard: `window`. The page makes its player
   * at boot, before any gesture, so it always waits for one rather than
   * trust `userActivation`, which a browser may report as already active.
   */
  readonly gestures: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  /** Milliseconds, for the watchdog. */
  readonly now: () => number;
  /** Call `tick` every `ms` until the returned function is called. */
  readonly every: (ms: number, tick: () => void) => () => void;
  /** Ask every host to count what the music costs (`?musicstats`, #420). */
  readonly measure: boolean;
  /** Ask every host to busy-wait this long per render quantum (`?audiostress=`, #519), or `null`. */
  readonly audioStress: number | null;
}

/** A track switch fades over this many cycles (#366 §3.1). */
export const CROSSFADE_CYCLES = 2;
/** How often the watchdog pings the host. */
export const HEARTBEAT_MS = 1_000;
/** A ping unanswered for this long means the host is hung, by a pattern or anything else. */
export const HEARTBEAT_TIMEOUT_MS = 5_000;

/**
 * More messages than this from the host in one second, and it is torn down
 * (#878). It sends about two a second: a pong, its stats, and one answer
 * per track or evaluation.
 */
export const HOST_MESSAGES_PER_SECOND = 100;

export const HUNG_MESSAGE = "The music stopped responding and was switched off.";
export const FLOODED_MESSAGE = "The music flooded the game with messages and was switched off.";

/** Whether `later` makes `earlier` pointless to send. */
function supersedes(later: GameToHost, earlier: GameToHost): boolean {
  const track = new Set(["load", "crossfadeTo", "play", "stop"]);
  return (
    later.type === earlier.type ||
    (track.has(later.type) && track.has(earlier.type) && later.type !== "play")
  );
}

export function createMusicPlayer(deps: MusicPlayerDeps): MusicPlayer {
  const nowPlaying: ((trackId: string) => void)[] = [];
  const errors: ((error: MusicError) => void)[] = [];
  const evaluated: ((evaluation: number) => void)[] = [];
  const statsHandlers: ((stats: MusicStats) => void)[] = [];
  const tornDown: ((reason: TeardownReason) => void)[] = [];
  let gestured = false;
  let frame: MusicFrame | undefined;
  let ready = false;
  let queue: GameToHost[] = [];
  let stopHeartbeat: (() => void) | undefined;
  let outstanding: { seq: number; sentAt: number } | undefined;
  let seq = 0;
  let evaluations = 0;
  // Replayed to a new host, after a hung one was torn down.
  let volume = 1;
  let intensity: MusicLevel = 0;
  // The flood budget's window: when it began, and what arrived in it.
  let windowStart = 0;
  let received = 0;
  // One error per evaluation, and one without one per track sent (#878).
  const evaluationsFailed = new Set<number>();
  let trackFailed = false;

  const report = (error: MusicError): void => {
    for (const handler of errors) {
      handler(error);
    }
  };

  const teardown = (reason: TeardownReason): void => {
    stopHeartbeat?.();
    stopHeartbeat = undefined;
    frame?.destroy();
    frame = undefined;
    ready = false;
    queue = [];
    outstanding = undefined;
    received = 0;
    report({ message: reason === "hung" ? HUNG_MESSAGE : FLOODED_MESSAGE });
    for (const handler of tornDown) {
      handler(reason);
    }
  };

  const heartbeat = (): void => {
    if (outstanding !== undefined) {
      if (deps.now() - outstanding.sentAt > HEARTBEAT_TIMEOUT_MS) {
        teardown("hung");
      }
      return;
    }
    seq += 1;
    outstanding = { seq, sentAt: deps.now() };
    frame?.post({ type: "ping", seq });
  };

  /** Whether this message from the host is one too many for this second. */
  const flooding = (): boolean => {
    const at = deps.now();
    if (at - windowStart >= 1_000) {
      windowStart = at;
      received = 0;
    }
    received += 1;
    return received > HOST_MESSAGES_PER_SECOND;
  };

  const receive = (message: HostToGame | null): void => {
    if (frame === undefined) {
      return;
    }
    if (flooding()) {
      teardown("flooded");
      return;
    }
    if (message === null) {
      return;
    }
    switch (message.type) {
      case "ready": {
        if (ready) {
          return;
        }
        ready = true;
        const waiting = queue;
        queue = [];
        for (const queued of waiting) {
          frame.post(queued);
        }
        stopHeartbeat = deps.every(HEARTBEAT_MS, heartbeat);
        return;
      }
      case "pong":
        if (outstanding?.seq === message.seq) {
          outstanding = undefined;
        }
        return;
      case "playing":
        for (const handler of nowPlaying) {
          handler(message.trackId);
        }
        return;
      case "error":
        if (message.seq === undefined) {
          if (trackFailed) {
            return;
          }
          trackFailed = true;
        } else {
          if (evaluationsFailed.has(message.seq)) {
            return;
          }
          evaluationsFailed.add(message.seq);
        }
        report({
          message: message.message,
          ...(message.line === undefined ? {} : { line: message.line }),
          ...(message.seq === undefined ? {} : { evaluation: message.seq }),
        });
        return;
      case "stats": {
        const { type: _type, ...stats } = message;
        for (const handler of statsHandlers) {
          handler(stats);
        }
        return;
      }
      case "evaluated":
        for (const handler of evaluated) {
          handler(message.seq);
        }
        return;
    }
  };

  const open = (): void => {
    if (frame !== undefined) {
      return;
    }
    frame = deps.createFrame(receive);
    queue = [
      ...(deps.measure ? [{ type: "measure" } as const] : []),
      ...(deps.audioStress === null
        ? []
        : [{ type: "audioStress", ms: deps.audioStress } as const]),
      { type: "setVolume", gain: volume, rampSeconds: 0 },
      { type: "setIntensity", level: intensity },
      ...queue.filter((message) => message.type !== "setVolume" && message.type !== "setIntensity"),
    ];
  };

  const send = (message: GameToHost): void => {
    if (frame !== undefined && ready) {
      frame.post(message);
      return;
    }
    queue = [...queue.filter((earlier) => !supersedes(message, earlier)), message];
    // A host torn down for hanging comes back for the next track.
    if (
      gestured &&
      frame === undefined &&
      (message.type === "load" || message.type === "crossfadeTo")
    ) {
      open();
    }
  };

  const onGesture = (): void => {
    gestured = true;
    deps.gestures.removeEventListener("pointerdown", onGesture);
    deps.gestures.removeEventListener("keydown", onGesture);
    open();
  };
  deps.gestures.addEventListener("pointerdown", onGesture);
  deps.gestures.addEventListener("keydown", onGesture);

  const trackMessage = (
    track: MusicTrack,
  ): { trackId: string; source: string; phraseCycles: number } => ({
    trackId: track.id,
    source: track.source,
    phraseCycles: track.phraseCycles,
  });

  return {
    load(track) {
      trackFailed = false;
      send({ type: "load", ...trackMessage(track) });
    },
    crossfadeTo(track) {
      // A fresh host has nothing to fade from; it plays the track at once.
      trackFailed = false;
      send({ type: "crossfadeTo", cycles: CROSSFADE_CYCLES, ...trackMessage(track) });
    },
    setIntensity(level) {
      intensity = level;
      send({ type: "setIntensity", level });
    },
    setVolume(gain, rampSeconds) {
      volume = Math.min(1, Math.max(0, gain));
      send({ type: "setVolume", gain: volume, rampSeconds });
    },
    evaluate(source) {
      evaluations += 1;
      send({ type: "evaluate", seq: evaluations, source });
      return evaluations;
    },
    play() {
      send({ type: "play" });
    },
    stop() {
      send({ type: "stop" });
    },
    onNowPlaying(handler) {
      nowPlaying.push(handler);
    },
    onError(handler) {
      errors.push(handler);
    },
    onEvaluated(handler) {
      evaluated.push(handler);
    },
    onStats(handler) {
      statsHandlers.push(handler);
    },
    onTornDown(handler) {
      tornDown.push(handler);
    },
  };
}

/** The `sandbox` attribute of the host's iframe: exactly this, never `allow-same-origin` (ADR-0028). */
export const HOST_SANDBOX = "allow-scripts";

/** The host as an iframe in `document`, which only its own messages get out of. */
export function createHostFrame(
  url: string,
  receive: (message: HostToGame | null) => void,
): MusicFrame {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", HOST_SANDBOX);
  iframe.setAttribute("allow", "autoplay");
  iframe.className = "music-host";
  iframe.title = "music";
  iframe.tabIndex = -1;
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = url;
  const listener = (event: MessageEvent): void => {
    // The host's origin is "null", like every sandboxed frame's, so the
    // origin says nothing: the source window is the check.
    if (event.source !== iframe.contentWindow || event.source === null) {
      return;
    }
    receive(parseHostToGame(event.data));
  };
  window.addEventListener("message", listener);
  document.body.appendChild(iframe);
  return {
    post(message) {
      // An opaque origin cannot be named as the target.
      iframe.contentWindow?.postMessage(message, "*");
    },
    destroy() {
      window.removeEventListener("message", listener);
      iframe.remove();
    },
  };
}

/** Whether the page asked to measure the music: `?musicstats` (#420). */
export function measuringMusic(search: string): boolean {
  return new URLSearchParams(search).has("musicstats");
}

let shared: MusicPlayer | undefined;

/** The page's one music player. */
export function musicPlayer(): MusicPlayer {
  if (shared !== undefined) {
    return shared;
  }
  const measure = measuringMusic(location.search);
  shared = createMusicPlayer({
    createFrame: (receive) => createHostFrame(musicHostUrl(import.meta.env.BASE_URL), receive),
    gestures: window,
    now: () => performance.now(),
    every: (ms, tick) => {
      const id = window.setInterval(tick, ms);
      return () => {
        window.clearInterval(id);
      };
    },
    measure,
    audioStress: audioStressMs(location.search, STRESS_BUILD),
  });
  if (measure) {
    // For scripts/music-stress.mjs, which reads the last second's stats.
    shared.onStats((stats) => {
      Object.assign(window, { __musicStats: stats });
    });
  }
  return shared;
}
