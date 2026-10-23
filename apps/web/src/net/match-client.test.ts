import { describe, expect, it } from "vitest";

import { endpointFromLocation } from "./match-client.js";

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
