import { describe, expect, it } from "vitest";

import { CONNECTION_LOST_MESSAGE, HOST_CLOSED_MESSAGE, lobbyClosedNotice } from "./session.js";

describe("the notice for a closed lobby (#515)", () => {
  it("says the host closed it when the host said so", () => {
    expect(lobbyClosedNotice("host-left")).toBe(HOST_CLOSED_MESSAGE);
  });

  it("blames no one when the host's peer was gone for the whole window", () => {
    expect(lobbyClosedNotice("connection-lost")).toBe(CONNECTION_LOST_MESSAGE);
    expect(CONNECTION_LOST_MESSAGE).not.toBe(HOST_CLOSED_MESSAGE);
  });
});
