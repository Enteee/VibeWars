import { CHANNELS, type Channel, parseWireKeyChallenge } from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { KEY_PROOF_TIMEOUT_MS, keyGated } from "./key-gate.js";
import { PROOF_KEY } from "./lobby-harness.test-support.js";
import { cryptoTurns, settle, until } from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
import type { Transport } from "./transport.js";

/**
 * A peer dropped while proving the key, though the transport still lists
 * it (#4222): a page frozen past `KEY_PROOF_TIMEOUT_MS` answers late, and
 * no join comes to say it should be challenged again.
 */

const GUEST_NONCE = "1a".repeat(16);
const HOST_NONCE = "2b".repeat(16);

/** Every message `transport` is sent, by channel, in order. */
function heard(transport: Transport): [Channel, unknown][] {
  const got: [Channel, unknown][] = [];
  for (const channel of CHANNELS) {
    transport.on(channel, (data) => got.push([channel, data]));
  }
  return got;
}

const channels = (got: readonly [Channel, unknown][]): Channel[] => got.map(([channel]) => channel);

/** `side`'s MAC, as a peer holding `PROOF_KEY` makes it. */
async function mac(
  side: "guest" | "host",
  hostNonce: string,
  guestNonce: string,
  guestId: string,
  hostId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    PROOF_KEY,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = `vibewars-key\n${side}\n${hostNonce}\n${guestNonce}\n${guestId}\n${hostId}`;
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The nonce of the last challenge in `got`. */
function lastChallenge(got: readonly [Channel, unknown][]): string {
  const challenge = got.filter(([channel]) => channel === "key-challenge").at(-1);
  const nonce = parseWireKeyChallenge(challenge?.[1])?.nonce;
  if (nonce === undefined) {
    throw new Error("no key challenge");
  }
  return nonce;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a peer dropped while it proved the key, still here (#4222)", () => {
  it("is challenged again by the host on its next message, once a timeout, and heard once it proves the key", async () => {
    const network = createMemoryNetwork();
    const host = keyGated(network.join("host"), PROOF_KEY, "host");
    const joined: string[] = [];
    host.onPeerJoin((peerId) => joined.push(peerId));
    const above: Channel[] = [];
    host.on("lobby-join", () => above.push("lobby-join"));
    const late = network.join("late");
    const got = heard(late);
    await cryptoTurns();
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);

    // Dropped, and still listed: a flood brings one challenge, and is not heard.
    late.send("lobby-join", {}, "host");
    late.send("lobby-join", {}, "host");
    late.send("key-ask", {}, "host");
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-challenge", "key-challenge"]);
    expect(above).toEqual([]);

    late.send(
      "key-proof",
      {
        nonce: GUEST_NONCE,
        mac: await mac("guest", lastChallenge(got), GUEST_NONCE, "late", "host"),
      },
      "host",
    );
    await until(() => joined.length > 0);
    expect(channels(got)).toEqual(["key-challenge", "key-challenge", "key-proven"]);
    expect(joined).toEqual(["late"]);
    late.send("lobby-join", {}, "host");
    await settle();
    expect(above).toEqual(["lobby-join"]);
  });

  it("is challenged again at once when its answer comes after the timeout", async () => {
    const network = createMemoryNetwork();
    const host = keyGated(network.join("host"), PROOF_KEY, "host");
    const joined: string[] = [];
    host.onPeerJoin((peerId) => joined.push(peerId));
    const late = network.join("late");
    const got = heard(late);
    await cryptoTurns();
    const stale = lastChallenge(got);
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);

    // Its page thawed: the answer to the lapsed challenge brings a fresh one.
    late.send(
      "key-proof",
      { nonce: GUEST_NONCE, mac: await mac("guest", stale, GUEST_NONCE, "late", "host") },
      "host",
    );
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-challenge", "key-challenge"]);
    expect(lastChallenge(got)).not.toBe(stale);
    expect(joined).toEqual([]);

    late.send(
      "key-proof",
      {
        nonce: GUEST_NONCE,
        mac: await mac("guest", lastChallenge(got), GUEST_NONCE, "late", "host"),
      },
      "host",
    );
    await until(() => joined.length > 0);
    expect(joined).toEqual(["late"]);
  });

  it("answers a host that challenges again while its answer waits, and is in on that one", async () => {
    const network = createMemoryNetwork();
    const guest = keyGated(network.join("guest"), PROOF_KEY, "guest", () => "host");
    const saw: string[] = [];
    guest.onPeerJoin((peerId) => saw.push(peerId));
    const host = network.join("host");
    const got = heard(host);
    await cryptoTurns();
    host.send("key-challenge", { nonce: "3c".repeat(16) }, "guest");
    await cryptoTurns();
    host.send("key-challenge", { nonce: HOST_NONCE }, "guest");
    await cryptoTurns();
    const proofs = got.filter(([channel]) => channel === "key-proof");
    expect(proofs).toHaveLength(2);
    const { nonce } = proofs.at(-1)?.[1] as { nonce: string };
    host.send(
      "key-proven",
      { mac: await mac("host", HOST_NONCE, nonce, "guest", "host") },
      "guest",
    );
    await until(() => saw.length > 0);
    expect(saw).toEqual(["host"]);
  });

  it("is challenged again no sooner than KEY_PROOF_TIMEOUT_MS after its last challenge", async () => {
    const network = createMemoryNetwork();
    const host = keyGated(network.join("host"), PROOF_KEY, "host");
    host.on("lobby-join", () => undefined);
    const late = network.join("late");
    const got = heard(late);
    await cryptoTurns();
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);
    late.send("lobby-join", {}, "host");
    // A wrong answer drops it at once: the next challenge still waits out the timeout.
    late.send("key-proof", { nonce: GUEST_NONCE, mac: "00".repeat(32) }, "host");
    await cryptoTurns();
    late.send("lobby-join", {}, "host");
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-challenge", "key-challenge"]);
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);
    late.send("lobby-join", {}, "host");
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-challenge", "key-challenge", "key-challenge"]);
  });

  it("asks a host that sent no key-proven in KEY_PROOF_TIMEOUT_MS for a challenge, not sooner", async () => {
    const network = createMemoryNetwork();
    const silent = network.join("host");
    const got = heard(silent);
    silent.onPeerJoin((peerId) => {
      silent.send("key-challenge", { nonce: HOST_NONCE }, peerId);
    });
    keyGated(network.join("guest"), PROOF_KEY, "guest", () => "host");
    await until(() => got.length > 0);
    expect(channels(got)).toEqual(["key-proof"]);
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS - 1);
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-proof"]);
    vi.advanceTimersByTime(1);
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-proof", "key-ask"]);
    // One ask until it is challenged again.
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);
    await cryptoTurns();
    expect(channels(got)).toEqual(["key-proof", "key-ask"]);
  });

  it("is in again, both ways, when its page froze past the host's challenge", async () => {
    const network = createMemoryNetwork();
    const host = keyGated(network.join("host"), PROOF_KEY, "host");
    const guest = keyGated(network.join("guest"), PROOF_KEY, "guest", () => "host");
    const toHost: unknown[] = [];
    const toGuest: unknown[] = [];
    host.on("lobby-join", (data) => toHost.push(data));
    guest.on("lobby-state", (data) => toGuest.push(data));
    const hostSaw: string[] = [];
    host.onPeerJoin((peerId) => hostSaw.push(`join ${peerId}`));
    host.onPeerLeave((peerId) => hostSaw.push(`leave ${peerId}`));
    const guestSaw: string[] = [];
    guest.onPeerJoin((peerId) => guestSaw.push(`join ${peerId}`));
    guest.onPeerLeave((peerId) => guestSaw.push(`leave ${peerId}`));
    await until(() => hostSaw.length > 0 && guestSaw.length > 0);
    guest.send("lobby-join", { n: 1 }, "host");
    await settle();
    expect(toHost).toEqual([{ n: 1 }]);

    // The guest's page stalls: the host drops it, and challenges it when it
    // is back, but the answer is still being worked when the timeout runs
    // out. No key-proven comes for it, so the guest asks again.
    network.stall("host", "guest");
    await settle();
    network.wake("host", "guest");
    await settle();
    vi.advanceTimersByTime(KEY_PROOF_TIMEOUT_MS);
    await until(() => hostSaw.length === 3 && guestSaw.length === 3);
    expect(hostSaw).toEqual(["join guest", "leave guest", "join guest"]);
    expect(guestSaw).toEqual(["join host", "leave host", "join host"]);
    host.send("lobby-state", { n: 2 }, "guest");
    guest.send("lobby-join", { n: 3 }, "host");
    await settle();
    expect(toGuest).toEqual([{ n: 2 }]);
    expect(toHost).toEqual([{ n: 1 }, { n: 3 }]);
  });
});
