import { describe, expect, it } from "vitest";

import { isHardNat, type NatCandidate } from "./nat-check.js";

/** NAT classification (#2090) from literal candidate lists. */

const CLOUDFLARE = "stun:stun.cloudflare.com:3478";
const GOOGLE = "stun:stun.l.google.com:19302";

function srflx(
  port: number,
  url: string | undefined,
  relatedAddress = "192.168.1.20",
  relatedPort = 54321,
): NatCandidate {
  return { type: "srflx", port, relatedAddress, relatedPort, url };
}

const HOST: NatCandidate = {
  type: "host",
  port: 54321,
  relatedAddress: "",
  relatedPort: 0,
  url: undefined,
};

describe("isHardNat", () => {
  it("is hard when one base maps to two public ports: symmetric", () => {
    expect(isHardNat([HOST, srflx(40001, CLOUDFLARE), srflx(40002, GOOGLE)], true)).toBe(true);
  });

  it("is not hard when one base maps to one public port: cone", () => {
    expect(isHardNat([HOST, srflx(40001, CLOUDFLARE)], true)).toBe(false);
    expect(isHardNat([HOST, srflx(40001, CLOUDFLARE), srflx(40001, GOOGLE)], true)).toBe(false);
  });

  it("is not hard when two bases each map once", () => {
    const wired = srflx(40001, CLOUDFLARE, "192.168.1.20", 50000);
    const wifi = srflx(40002, GOOGLE, "10.0.0.5", 50001);
    expect(isHardNat([wired, wifi], true)).toBe(false);
  });

  it("is hard when gathering completed with no srflx: UDP blocked", () => {
    expect(isHardNat([HOST], true)).toBe(true);
    expect(isHardNat([], true)).toBe(true);
  });

  it("is not hard when the budget ran out with no srflx: unknown", () => {
    expect(isHardNat([HOST], false)).toBe(false);
  });

  it("with the base hidden, is hard only on one srflx per server at different ports", () => {
    expect(
      isHardNat([srflx(40001, CLOUDFLARE, "0.0.0.0", 0), srflx(40002, GOOGLE, "0.0.0.0", 0)], true),
    ).toBe(true);
    expect(
      isHardNat([srflx(40001, CLOUDFLARE, "0.0.0.0", 0), srflx(40001, GOOGLE, "0.0.0.0", 0)], true),
    ).toBe(false);
  });

  it("with the base hidden, more than one srflx per server is ambiguous: not hard", () => {
    const candidates = [
      srflx(40001, CLOUDFLARE, "0.0.0.0", 0),
      srflx(40003, CLOUDFLARE, "0.0.0.0", 0),
      srflx(40002, GOOGLE, "0.0.0.0", 0),
    ];
    expect(isHardNat(candidates, true)).toBe(false);
  });

  it("with the base hidden and no server named, is not hard", () => {
    expect(
      isHardNat(
        [srflx(40001, undefined, "0.0.0.0", 0), srflx(40002, undefined, "0.0.0.0", 0)],
        true,
      ),
    ).toBe(false);
  });

  it("one server answering is not hard", () => {
    expect(isHardNat([srflx(40001, GOOGLE, "0.0.0.0", 0)], true)).toBe(false);
  });
});
