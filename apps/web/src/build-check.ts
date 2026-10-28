/**
 * A newer deployed build (#1268). The Pages deploy replaces the old
 * build's chunks, so a tab opened before it fails at its next lazy
 * import. The build stamps its id into the bundle and beside
 * `index.html` as `build.json`; a tab whose id differs from the served
 * one is outdated. Like `PROTOCOL_VERSION` (ADR-0016) the comparison
 * only ever says "reload", never picks a code path.
 */

/** The id of a build made without a sha: `vite dev`, local builds. Never checked. */
export const DEV_BUILD = "dev";

/** How often a visible tab asks for the served build. */
export const CHECK_EVERY_MS = 5 * 60_000;

/** How long the banner counts down on an idle screen before it reloads. */
export const RELOAD_COUNTDOWN_SECONDS = 30;

/** A lazy import that failed while entering a match, and the banner that cannot reload by itself. */
export const NEW_VERSION_NOTICE = "A new version of VibeWars is out. Reload to play.";

/** The banner on a screen that is not idle: a match, a lobby, an editor, a dialog. */
export const NEW_VERSION_WAITING =
  "A new version of VibeWars is out. It loads when you are back on the menu.";

/** The banner counting down on the menu or the ended screen. */
export function newVersionCountdown(seconds: number): string {
  return `A new version of VibeWars is out. Reloading in ${String(seconds)} s.`;
}

/** The id in a `build.json`, or `undefined` for anything that is not one. */
export function parseBuildFile(json: unknown): string | undefined {
  if (typeof json !== "object" || json === null || !("build" in json)) {
    return undefined;
  }
  const { build } = json;
  return typeof build === "string" && build !== "" ? build : undefined;
}

/**
 * Whether `error` is a lazy import that could not load, as each browser
 * words it: a chunk the deploy removed comes back as Pages' HTML 404.
 */
export function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS/.test(
    error.message,
  );
}

/** What the banner shows, or nothing. */
export type BuildBanner =
  /** On an idle screen, reloading by itself at 0. */
  | { readonly kind: "countdown"; readonly seconds: number }
  /** On a busy screen: the countdown starts on the menu. */
  | { readonly kind: "waiting" }
  /** It reloaded for this id once already, or cannot remember that it did: only Reload now. */
  | { readonly kind: "manual" };

/**
 * The id a reload was last made for, in this tab's session. `load` and
 * `save` may throw, as `sessionStorage` does where it is denied: then it
 * never reloads by itself, since it could not tell a loop from a first.
 */
export interface ReloadMemory {
  load(): string | undefined;
  save(id: string): void;
}

export interface BuildWatchOptions {
  /** This bundle's id. */
  readonly current: string;
  /** The served id, or `undefined` when it cannot be read: never outdated. */
  readonly fetchLatest: () => Promise<string | undefined>;
  /** Whether the player is on the menu or the ended screen, with no dialog open. */
  readonly idle: () => boolean;
  readonly reloadedFor: ReloadMemory;
  readonly reload: () => void;
  readonly show: (banner: BuildBanner | undefined) => void;
}

export interface BuildWatch {
  /** Ask for the served id now. */
  check(): Promise<void>;
  /** A lazy import failed: ask now, and bring a dismissed banner back. */
  chunkFailed(): Promise<void>;
  /** *Not now*: no banner and no countdown for this id. */
  dismiss(): void;
  /** *Reload now*, remembered as a reload for this id. */
  reloadNow(): void;
  dispose(): void;
}

/**
 * Watch for a served build other than `current`. Outdated, the banner
 * counts down once a second while `idle()`, and starts over whenever it
 * is not; at 0 it reloads, at most once per served id.
 */
export function createBuildWatch(options: BuildWatchOptions): BuildWatch {
  const { current, reloadedFor } = options;
  /** The served id, once it differs from `current`. */
  let latest: string | undefined;
  let dismissed: string | undefined;
  let secondsLeft = RELOAD_COUNTDOWN_SECONDS;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const mayReloadFor = (id: string): boolean => {
    try {
      return reloadedFor.load() !== id;
    } catch {
      return false;
    }
  };

  const remember = (id: string): boolean => {
    try {
      reloadedFor.save(id);
      return true;
    } catch {
      return false;
    }
  };

  const stopTicking = (): void => {
    if (ticker !== undefined) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };

  const tick = (): void => {
    if (latest === undefined || latest === dismissed) {
      return;
    }
    if (!mayReloadFor(latest)) {
      stopTicking();
      options.show({ kind: "manual" });
      return;
    }
    if (!options.idle()) {
      secondsLeft = RELOAD_COUNTDOWN_SECONDS;
      options.show({ kind: "waiting" });
      return;
    }
    if (secondsLeft > 0) {
      options.show({ kind: "countdown", seconds: secondsLeft });
      secondsLeft -= 1;
      return;
    }
    stopTicking();
    if (!remember(latest)) {
      options.show({ kind: "manual" });
      return;
    }
    options.reload();
  };

  const showOutdated = (): void => {
    stopTicking();
    secondsLeft = RELOAD_COUNTDOWN_SECONDS;
    tick();
    if (latest !== undefined && mayReloadFor(latest)) {
      ticker = setInterval(tick, 1000);
    }
  };

  const check = async (): Promise<void> => {
    const served = await options.fetchLatest();
    if (disposed || served === undefined || served === current || served === latest) {
      return;
    }
    latest = served;
    if (served !== dismissed) {
      showOutdated();
    }
  };

  return {
    check,
    async chunkFailed() {
      dismissed = undefined;
      const before = latest;
      await check();
      if (!disposed && latest !== undefined && latest === before) {
        showOutdated();
      }
    },
    dismiss() {
      dismissed = latest;
      stopTicking();
      options.show(undefined);
    },
    reloadNow() {
      if (latest !== undefined) {
        remember(latest);
      }
      options.reload();
    },
    dispose() {
      disposed = true;
      stopTicking();
    },
  };
}

/**
 * Ask `${base}build.json` past the HTTP cache: Pages sends
 * `max-age=600`, which would show the old one. Any failure, offline or
 * a dev server with no file, reads as nothing served.
 */
export async function fetchServedBuild(base: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${base}build.json`, { cache: "no-store" });
    if (!response.ok) {
      return undefined;
    }
    return parseBuildFile(await response.json());
  } catch {
    return undefined;
  }
}
