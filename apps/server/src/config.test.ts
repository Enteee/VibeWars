import { describe, expect, it } from "vitest";

import {
  ConfigError,
  DEFAULT_DEV_CLIENT_ORIGIN,
  DEFAULT_MAX_ROOMS,
  loadConfig,
  parseBoolean,
  parseMaxRooms,
  parsePort,
} from "./config.js";

describe("parseMaxRooms (#114)", () => {
  it("defaults to 200, and reads a positive integer", () => {
    expect(parseMaxRooms(undefined)).toBe(DEFAULT_MAX_ROOMS);
    expect(DEFAULT_MAX_ROOMS).toBe(200);
    expect(parseMaxRooms(" ")).toBe(DEFAULT_MAX_ROOMS);
    expect(parseMaxRooms("50")).toBe(50);
    expect(loadConfig({ VIBEWARS_MAX_ROOMS: "7" }).maxRooms).toBe(7);
  });

  it("rejects zero, a negative number and anything not a number", () => {
    for (const raw of ["0", "-1", "abc", "1.5", "1e3"]) {
      expect(() => parseMaxRooms(raw), raw).toThrow(ConfigError);
    }
  });
});

describe("parsePort", () => {
  it("defaults to 2567 when unset or blank", () => {
    expect(parsePort(undefined)).toBe(2567);
    expect(parsePort("")).toBe(2567);
    expect(parsePort("   ")).toBe(2567);
  });

  it("accepts a custom fallback", () => {
    expect(parsePort(undefined, 9999)).toBe(9999);
  });

  it("parses a valid decimal port", () => {
    expect(parsePort("2567")).toBe(2567);
    expect(parsePort(" 80 ")).toBe(80);
    expect(parsePort("65535")).toBe(65535);
    expect(parsePort("1")).toBe(1);
  });

  it("rejects non-decimal input", () => {
    expect(() => parsePort("0x10")).toThrow(ConfigError);
    expect(() => parsePort("1e3")).toThrow(ConfigError);
    expect(() => parsePort("abc")).toThrow(ConfigError);
    expect(() => parsePort("80.5")).toThrow(ConfigError);
    expect(() => parsePort("-1")).toThrow(ConfigError);
  });

  it("rejects ports outside the valid TCP range", () => {
    expect(() => parsePort("0")).toThrow(ConfigError);
    expect(() => parsePort("65536")).toThrow(ConfigError);
  });
});

describe("parseBoolean", () => {
  it("defaults to false when unset or blank", () => {
    expect(parseBoolean(undefined)).toBe(false);
    expect(parseBoolean("")).toBe(false);
  });

  it("accepts a custom fallback", () => {
    expect(parseBoolean(undefined, true)).toBe(true);
  });

  it("accepts truthy spellings case-insensitively", () => {
    for (const value of ["1", "true", "TRUE", "yes", "Yes", "on", "ON"]) {
      expect(parseBoolean(value)).toBe(true);
    }
  });

  it("accepts falsy spellings case-insensitively", () => {
    for (const value of ["0", "false", "FALSE", "no", "No", "off", "OFF"]) {
      expect(parseBoolean(value)).toBe(false);
    }
  });

  it("rejects anything else rather than silently coercing it", () => {
    expect(() => parseBoolean("maybe")).toThrow(ConfigError);
    expect(() => parseBoolean("2")).toThrow(ConfigError);
  });
});

describe("loadConfig", () => {
  it("applies LAN-friendly defaults from an empty environment", () => {
    const config = loadConfig({});
    expect(config.port).toBe(2567);
    expect(config.host).toBe("0.0.0.0");
    expect(config.devMode).toBe(false);
  });

  it("reads every field from the environment when present", () => {
    const config = loadConfig({
      PORT: "4000",
      HOST: "127.0.0.1",
      VIBEWARS_WEB_ROOT: "/srv/web",
      VIBEWARS_DEV: "true",
    });
    expect(config).toEqual({
      port: 4000,
      host: "127.0.0.1",
      webRoot: "/srv/web",
      devMode: true,
      devClientOrigin: DEFAULT_DEV_CLIENT_ORIGIN,
      maxRooms: DEFAULT_MAX_ROOMS,
    });
  });

  it("treats a blank VIBEWARS_WEB_ROOT the same as unset", () => {
    // Both fall through to the same conventional-path lookup. Whether that
    // path exists depends on whether `apps/web` has been built, which this
    // test must not assume either way — it only asserts the two inputs are
    // handled identically.
    expect(loadConfig({ VIBEWARS_WEB_ROOT: "   " }).webRoot).toBe(loadConfig({}).webRoot);
  });

  it("serves no client at all for VIBEWARS_WEB_ROOT=none", () => {
    // What `pnpm run dev` relies on: Vite serves the client, and the
    // game server must not also serve a previously built copy at its own
    // port, or you end up debugging an hour-old bundle.
    expect(loadConfig({ VIBEWARS_WEB_ROOT: "none" }).webRoot).toBeUndefined();
  });

  it("defaults the dev client origin, and lets it be overridden", () => {
    expect(loadConfig({}).devClientOrigin).toBe(DEFAULT_DEV_CLIENT_ORIGIN);
    expect(loadConfig({ VIBEWARS_DEV_ORIGIN: "http://192.168.1.5:5173" }).devClientOrigin).toBe(
      "http://192.168.1.5:5173",
    );
  });

  it("propagates a malformed PORT as a loud ConfigError", () => {
    expect(() => loadConfig({ PORT: "not-a-port" })).toThrow(ConfigError);
  });
});
