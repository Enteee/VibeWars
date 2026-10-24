import { describe, expect, it } from "vitest";

import { endpointFromLocation, httpOriginFrom, resolveEndpoint } from "./match-client.js";

describe("endpointFromLocation", () => {
  it("uses ws:// for http pages", () => {
    expect(endpointFromLocation({ protocol: "http:", host: "localhost:5173" })).toBe(
      "ws://localhost:5173",
    );
  });

  it("uses wss:// for https pages, so a TLS-terminated LAN host still works", () => {
    expect(endpointFromLocation({ protocol: "https:", host: "vibewars.local" })).toBe(
      "wss://vibewars.local",
    );
  });

  it("preserves a non-default port", () => {
    expect(endpointFromLocation({ protocol: "http:", host: "192.168.1.50:2567" })).toBe(
      "ws://192.168.1.50:2567",
    );
  });
});

describe("resolveEndpoint", () => {
  const page = { protocol: "http:", host: "localhost:5173" } as const;

  it("uses the page's own origin when there is no override", () => {
    // Production: the server serves the client, so same-origin is right
    // and nothing has to be configured on a LAN host.
    expect(resolveEndpoint(page, undefined)).toBe("ws://localhost:5173");
  });

  it("uses the override when one is set", () => {
    // `pnpm run dev`: Vite serves the client on 5173, the game is on 2567.
    expect(resolveEndpoint(page, "ws://localhost:2567")).toBe("ws://localhost:2567");
  });

  it("ignores a blank override rather than connecting to nowhere", () => {
    // An env var defined-but-empty is a very easy mistake to make in a
    // shell script, and it must not produce an empty endpoint.
    expect(resolveEndpoint(page, "")).toBe("ws://localhost:5173");
    expect(resolveEndpoint(page, "   ")).toBe("ws://localhost:5173");
  });
});

describe("httpOriginFrom", () => {
  it("maps a websocket endpoint to the same server over http", () => {
    expect(httpOriginFrom("ws://localhost:2567")).toBe("http://localhost:2567");
    expect(httpOriginFrom("wss://vibewars.local")).toBe("https://vibewars.local");
  });

  it("only rewrites the scheme, not a host that happens to start with ws", () => {
    expect(httpOriginFrom("ws://ws-host:2567")).toBe("http://ws-host:2567");
  });
});
