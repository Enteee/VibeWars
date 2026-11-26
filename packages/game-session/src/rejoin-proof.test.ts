import { describe, expect, it } from "vitest";

import { rejoinProof } from "./rejoin-proof.js";

/** Repeated, so it reads as no secret. */
const TOKEN = "0f".repeat(16);
const NONCE = "a5".repeat(16);

describe("rejoinProof", () => {
  it("is HMAC-SHA-256 keyed by the token over the nonce, the player and the guest's peer id", async () => {
    // Computed once with Node's crypto.createHmac("sha256", TOKEN).
    expect(await rejoinProof(TOKEN, NONCE, "player-1", "peer-guest")).toBe(
      "054c50ea1b91a2976d9627bd3b4fe93c539312d095b6b4af6be925704866b828",
    );
  });

  it("changes with every one of its inputs", async () => {
    const proof = await rejoinProof(TOKEN, NONCE, "player-1", "peer-guest");
    const others = await Promise.all([
      rejoinProof(TOKEN.replace("0", "1"), NONCE, "player-1", "peer-guest"),
      rejoinProof(TOKEN, NONCE.replace("a", "b"), "player-1", "peer-guest"),
      rejoinProof(TOKEN, NONCE, "player-2", "peer-guest"),
      rejoinProof(TOKEN, NONCE, "player-1", "peer-impostor"),
    ]);
    for (const other of others) {
      expect(other).not.toBe(proof);
    }
  });
});
