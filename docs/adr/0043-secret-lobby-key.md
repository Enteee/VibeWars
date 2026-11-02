# ADR-0043: The lobby key is a secret; relays see only a slow derivation of it

## Status

Superseded in part by [ADR-0048](0048-lobby-keys-in-urls.md) (2026-11-01): the key is 256 bits, shared only as an invite link, and derived with HKDF, not PBKDF2. The room, password and proof derivations and "Open and closed" stand.

Accepted (2026-10-31). Issue #1681, operator ruling on PR 1591. "Open and closed" added by #1682 (operator, Q196).

## Context

Since #15 a lobby code is both the Trystero room and its password. Trystero publishes `sha1("Trystero@" + APP_ID + "@" + room)` in clear on public Nostr relays, `APP_ID` ships in the client, and there were 23⁶ ≈ 148 M codes: hashing them all takes minutes, so anyone watching the relays could recover every live code and join (SECURITY.md, gap 5). ADR-0041 makes every player always host a lobby, which would put every open page on the relays. The operator ruled that strangers must not be able to join without a secret key, that the key must have 11+ characters, and that it must not be recoverable from what relays or ledgers see.

## Decision

**The key is 12 symbols of the 23-symbol alphabet** (≈ 2⁵⁴), generated with `crypto.getRandomValues`, readable aloud, shown in groups of four.

**Relays see a slow derivation, never the key.** `seed = PBKDF2-HMAC-SHA256(key, fixed salt, 600 000 iterations)`; the Trystero room is `HMAC(seed, "room")` and its password `HMAC(seed, "password")`. Trystero's topic is a hash of the room; its SDP encryption key and handshake are keyed on the password. Recovering a key from a topic costs 2⁵⁴ × 600 000 PBKDF2 rounds, out of reach; a peer pays it once per open or join (~0.3 s).

**Our own proof gates the lobby.** Before any lobby message, guest and host prove the key to each other with an HMAC over both nonces and both peer ids, keyed on a third derivation. A peer id is no credential: a peer back from a drop proves the key again, both ways, and a guest that saw the drop alone asks the host to challenge it (`key-ask`). Trystero's password already blocks the offers; the proof does not rely on Trystero internals and is unit-tested in game-session.

**Only peers in the room learn the key**, because they already hold it. It is not put in URLs, logs, storage, queue tickets or any Nostr event of ours.

**Random Arena queue rooms stay public** (`ra-` + group id, room = password): they exist to put strangers together (ADR-0032). They have no key to prove: their signed tickets admit a peer.

## Consequences

- A relay observer still sees that rooms exist, their peers' IPs and encrypted offers; not who is in which lobby by key, and cannot join.
- **The salt is fixed on purpose.** One search hits every live lobby at once, but even at 1,000 live topics that is 2⁴⁴ × 600 000 PBKDF2 rounds ≈ 10¹⁹ operations. A per-lobby salt would have to be shared with the key; do not add one.
- **Admission also rests on Trystero's password semantics**: it encrypts offers with the password and drops what fails to decrypt. A Trystero bump or a transport swap re-checks this (perf-sec-qa does on every trystero version change).
- **Residual, accepted: a topic can be flooded.** The topic is public, so an observer can announce on it and make the host start doomed handshakes. That is denial of service, not access; SECURITY.md lists it under what we do not defend against.
- A key holder learns every member's IP address (WebRTC), as before. Accepted: the key is shared only with people you play with.
- Anyone the key is shared with can join and share it further: a key is an invitation, not an identity. A closed lobby (below) takes nobody new, key or not.
- The derivation constants are part of the protocol: changing one moves every room, as a `PROTOCOL_VERSION` bump does, so they live in `game-protocol` next to the alphabet.

## Open and closed

A lobby is **closed** unless its host opens it, and every new lobby starts closed. Closed and empty, the host is in no Trystero room, so the relays see nothing of it at all. Open, the host is in the derived room and any peer that proves the key may join. Closing keeps the guests already in (operator, Q196), so a closed lobby with guests stays in its room and refuses new joins after the key proof; when its last guest leaves, the host leaves the room.

The room is derived once per lobby and kept for its life, so opening it again costs no second derivation. Going into the room waits a 500 ms settle window and follows the last state, so a burst of toggles makes at most one join on the relays; leaving is at once. Trystero is a mesh, so a key holder who comes into a closed lobby's room reaches its guests too: a guest that knows its host answers no other peer's key challenge, hears nothing from any other peer and sends it nothing.

Alternatives: listing open lobbies publicly (rejected by the operator, Q196); closing kicks everyone (rejected, Q196); leaving the room on close even with guests (Trystero drops every peer connection on leave, so it would kick them).

## Alternatives Considered

- **Longer code, still room = password** (the #379 approach): a fast hash of 2⁵⁴ keys is weeks on one GPU and less against many live lobbies at once. Rejected: entropy alone is not enough when the hash is fast and public.
- **Room from the key, password = key**: the topic stretches, but Trystero's AES key is `sha256(password…)`, fast, and an attacker who sees offers could attack it instead. Rejected: both derived from the slow seed.
- **Trystero's password alone as the gate**: it works today, but it is a library detail we do not test and its own challenge checks one direction only. Rejected as the only gate; kept as the first one.
- **≥ 80 bits of key with fast hashes**: about 16 characters to read aloud. Rejected for the slow KDF, which keeps 12.
- **A random room id shared alongside the key**: two things to share instead of one. Rejected.
