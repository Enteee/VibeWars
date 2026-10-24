import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server configuration, resolved once from the environment.
 *
 * Everything is optional with a LAN-friendly default so that `docker run -p
 * 2567:2567 vibewars` works with no configuration at all (project brief §27).
 */

export interface ServerConfig {
  /** TCP port for both HTTP and the WebSocket upgrade. */
  readonly port: number;
  /** Interface to bind. Defaults to all interfaces so LAN peers can connect. */
  readonly host: string;
  /**
   * Absolute path to the built web client, or `undefined` to not serve
   * one. Set `VIBEWARS_WEB_ROOT=none` to serve no client even when a
   * built one exists — which is what `pnpm run dev` does, so an
   * hour-old bundle at the server's own port cannot be mistaken for the
   * hot-reloading one Vite is serving.
   */
  readonly webRoot: string | undefined;
  /** Enables dev-only diagnostics (brief §34). Never on by default. */
  readonly devMode: boolean;
  /**
   * Origin allowed to call this server cross-origin, and ONLY honoured
   * when `devMode` is on.
   *
   * `pnpm run dev` serves the client from Vite on another port, which
   * makes matchmaking a cross-origin request. An exact origin rather than
   * `*`: a wildcard would still be a wildcard on the day someone runs a
   * dev server on a shared network.
   *
   * Optional because it is meaningless unless `devMode` is on — a caller
   * building a production config has nothing to say about it.
   */
  readonly devClientOrigin?: string;
}

export class ConfigError extends Error {
  public override readonly name = "ConfigError";
}

const DEFAULT_PORT = 2567;

/** Where `pnpm run dev` serves the client from. */
export const DEFAULT_DEV_CLIENT_ORIGIN = "http://localhost:5173";

/**
 * Parse a port from a string, rejecting anything that is not a usable TCP port.
 *
 * `Number()` alone is too permissive here — it accepts `""`, `"0x10"` and
 * `"1e3"`, which would silently bind somewhere unexpected.
 */
export function parsePort(raw: string | undefined, fallback: number = DEFAULT_PORT): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new ConfigError(`PORT must be a decimal integer, got ${JSON.stringify(raw)}`);
  }
  const port = Number.parseInt(raw.trim(), 10);
  if (port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be between 1 and 65535, got ${String(port)}`);
  }
  return port;
}

/** Treats only explicit truthy spellings as true; anything else is false. */
export function parseBoolean(raw: string | undefined, fallback = false): boolean {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  throw new ConfigError(`Expected a boolean-ish value, got ${JSON.stringify(raw)}`);
}

/**
 * The web client build, if one happens to live where the monorepo layout
 * puts it relative to this file (`apps/server/dist/config.js` ->
 * `apps/web/dist`). True in both a local `pnpm run build` and the production
 * container (`docs/adr/0009-production-deployment.md`), so a LAN host never
 * has to set `VIBEWARS_WEB_ROOT` by hand for the common case.
 */
function conventionalWebRoot(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, "../../web/dist");
  return existsSync(candidate) ? candidate : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const webRoot = env.VIBEWARS_WEB_ROOT?.trim();
  const devOrigin = env.VIBEWARS_DEV_ORIGIN?.trim();
  const resolvedWebRoot =
    webRoot === "none"
      ? undefined
      : webRoot !== undefined && webRoot !== ""
        ? webRoot
        : conventionalWebRoot();
  return {
    port: parsePort(env.PORT),
    host: env.HOST?.trim() ?? "0.0.0.0",
    webRoot: resolvedWebRoot,
    devMode: parseBoolean(env.VIBEWARS_DEV, false),
    devClientOrigin:
      devOrigin === undefined || devOrigin === "" ? DEFAULT_DEV_CLIENT_ORIGIN : devOrigin,
  };
}
