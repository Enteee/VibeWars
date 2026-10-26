/**
 * What a returning player sends to take its seat back (#593): an
 * HMAC-SHA-256 of a host's challenge, keyed by the rejoin token, so the
 * token itself never leaves the guest. A peer posing as the host learns a
 * proof that names the guest's own peer id, which the real host refuses
 * from anyone else. Host and guest both call this, so they cannot disagree
 * on the layout.
 */
export async function rejoinProof(
  token: string,
  nonce: string,
  playerId: string,
  guestPeerId: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = `vibewars-rejoin\n${nonce}\n${playerId}\n${guestPeerId}`;
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
