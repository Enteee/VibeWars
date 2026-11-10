import { afterEach, describe, expect, it, vi } from "vitest";

import { onRelayStatus, relayStatus, setRelayStatus } from "./relay-status.js";

describe("relay status (#2981)", () => {
  afterEach(() => {
    setRelayStatus({ sharedBy: undefined, sharingWith: 0 });
  });

  it("tells a listener of every set, until it unsubscribes", () => {
    const listener = vi.fn();
    const off = onRelayStatus(listener);
    setRelayStatus({ sharedBy: undefined, sharingWith: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(relayStatus().sharingWith).toBe(2);
    off();
    setRelayStatus({ sharedBy: undefined, sharingWith: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(relayStatus().sharingWith).toBe(3);
  });
});
