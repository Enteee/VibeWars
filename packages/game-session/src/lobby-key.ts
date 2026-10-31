import { LOBBY_KEY_ITERATIONS, LOBBY_KEY_SALT, normalizeLobbyCode } from "@vibewars/game-protocol";

/**
 * Where a lobby meets, as a transport is told it (#1681, ADR-0043): the
 * room on the relays and its password, both derived from the lobby key
 * through a slow function, so neither gives the key back. `proofKey` is
 * what peers prove the key with to each other (`keyGated`); it never
 * leaves the page, and a transport never reads it. `null` for a Random
 * Arena queue room, which strangers meet in by design.
 */
export interface LobbyRoom {
  readonly roomId: string;
  readonly password: string;
  readonly proofKey: Uint8Array | null;
}

const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array, label: string): Promise<ArrayBuffer> {
  const imported = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", imported, encoder.encode(label));
}

/**
 * The room lobby key `key` names (ADR-0043): PBKDF2-HMAC-SHA-256 of the
 * normalised key into a seed, and from the seed one HMAC each for the
 * room, its password and the proof key. A peer pays the stretch once per
 * open or join; someone hashing topics pays it for every key they try.
 */
export async function deriveLobbyRoom(key: string): Promise<LobbyRoom> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(normalizeLobbyCode(key)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const seed = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: encoder.encode(LOBBY_KEY_SALT),
        iterations: LOBBY_KEY_ITERATIONS,
      },
      base,
      256,
    ),
  );
  const [room, password, proof] = await Promise.all([
    hmac(seed, "room"),
    hmac(seed, "password"),
    hmac(seed, "proof"),
  ]);
  return { roomId: hex(room), password: hex(password), proofKey: new Uint8Array(proof) };
}

/**
 * A Random Arena queue room (ADR-0032): public, room and password alike.
 * Its `ra-` prefix keeps it apart from every derived room, which is hex.
 */
export function publicRoom(room: string): LobbyRoom {
  return { roomId: room, password: room, proofKey: null };
}
