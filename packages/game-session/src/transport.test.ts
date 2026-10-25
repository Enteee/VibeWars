import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryNetwork } from "./memory-transport.js";
import { MAX_MESSAGE_BYTES, messageBytes, sizeChecked } from "./transport.js";

afterEach(() => {
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await new Promise<void>((resolve) => {
    queueMicrotask(resolve);
  });
}

describe("messageBytes", () => {
  it("counts UTF-8 bytes of the JSON, not characters", () => {
    // `"é"` is 3 characters of JSON, and 4 bytes: é is two.
    expect(messageBytes("é")).toBe(4);
  });
});

describe("sizeChecked (#403)", () => {
  it("says once per channel when a message is over the limit, and still sends it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const network = createMemoryNetwork();
    const host = sizeChecked(network.join());
    const peer = network.join();
    const got: unknown[] = [];
    peer.on("snapshot", (data) => got.push(data));

    const big = "x".repeat(MAX_MESSAGE_BYTES);
    host.send("snapshot", big);
    host.send("snapshot", big);
    host.send("combat", big);
    host.send("intent", "small");
    await settle();

    expect(got).toEqual([big, big]);
    expect(error).toHaveBeenCalledTimes(2);
    expect(error.mock.calls[0]?.[0]).toMatch(/a snapshot message is \d+ bytes/);
    expect(error.mock.calls[1]?.[0]).toMatch(/a combat message is \d+ bytes/);
  });
});
