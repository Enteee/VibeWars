# ADR-0049: A lobby host shares its TURN relay through the invite link

## Status

Accepted (2026-11-02). Issue #2091, operator request. Builds on ADR-0048 (256-bit lobby keys, invite links only) and #972 (a player's own relay in Options).

## Context

Some pairs of networks never connect without TURN (ADR-0022). #972 lets a player bring a relay, but only for themselves: a friend behind a hard NAT has to be sent the relay's link and paste it in before they can join. The player who most often has a relay is the one hosting. If the host could hand theirs to the lobby, a joiner would need nothing but the invite link.

The catch is that a joiner who needs TURN cannot reach the host, so the host cannot hand it over on the data channel.

## Decision

**The offer travels over the Nostr relays, as signalling does.** In Options, a host may save a _shared relay_: TURN URLs and the server's REST secret (coturn `use-auth-secret`), and tick **Share my relay with my lobbies** (off by default). While a coded lobby's host is in its room, it publishes an offer every `TICKET_HEARTBEAT_MS` on the relay sockets the queue board uses (`nostr-relays.ts`). The offer is an ephemeral event (kind 23855, which relays do not store), tagged with the lobby's relay topic and signed by a throwaway key, one per lobby. It goes on while the lobby is in a match, so a reconnecting guest (#1764) can still get through.

**Topic and key come from the lobby key.** `deriveLobbyRoom` adds `HMAC(seed, "relay-topic")` and `HMAC(seed, "relay-key")` to the room, password and proof (ADR-0048). The offer is `{ urls, username, credential }`, sealed with AES-GCM under the relay key with a fresh 12-byte IV each time. A Random Arena room has no relay: strangers meet there, and nothing is shared.

**Only REST credentials are shared.** The host mints `username = "<expiry unix>:<8 random bytes, hex, per lobby>"` and `credential = base64(HMAC-SHA1(secret, username))`, valid for 2 h, and mints again when 30 min are left. The secret never leaves the host's device. The per-lobby tag lets the TURN server's operator tell lobbies apart in its logs and block one. A static user/password relay is never shared, since its credential cannot be made to expire: its #972 invite link is how that kind is passed on.

**A joiner joins at once without a relay**, so a direct path is never slowed down. It subscribes to the topic as soon as it opens the link, and holds offers in memory only. When an offer has opened, 5 s have passed since the join and the host has not answered, it leaves the room (awaited, so Trystero's room cache is clear) and joins again through the offer, once. An offer arriving at 12 s still counts. A joiner with its own relay in Options never takes an offer. A relayed joiner whose host drops joins again with the newest offer it holds, since coturn ends an allocation whose credential has expired.

**An offer is checked as hostile input.** Content over 2 KB is dropped before decrypting. One that does not open, is not a valid `TurnConfig`, has expired or lasts longer than a fresh one could is ignored. A joiner opens at most one offer per 5 s per author, ignores an author whose offer failed to open, and opens at most 200 a second from authors not yet heard from. The topic is public, so a slot shared by the whole topic would let anyone watching a relay spend the host's with garbage, and let a member's own offers crowd out the host's. A flood of over 200 fresh keys a second before the host is first heard still delays it: that is the residual. `validateTurnConfig` takes 1 to 4 `turn:`/`turns:` URLs and refuses loopback, RFC 1918, link-local, CGNAT, `0/8`, `::1`, ULA, IPv6 link-local, v4-mapped and NAT64 forms of those, and `localhost`, `*.localhost` and `*.local`. The same rule applies to Options and to #972 invite links, so a LAN-party coturn is refused everywhere. A _name_ that resolves to a private address cannot be checked from a browser.

## Why Nostr and not the data channel

The data channel is what a joiner who needs TURN cannot open. The Nostr relays are already how two peers find each other, and every joiner reaches them. The ciphertext is public, but its key comes from a 256-bit lobby key, so only someone with the invite link can open it.

## Consequences

- **Anyone with the invite link can relay through the host's server** for up to 2 h after the last offer they saw. A minted credential cannot be revoked early: closing the lobby only stops new ones. Options says so, and tells the host to set coturn's `denied-peer-ip` for private ranges, `no-loopback-peers`, `no-multicast-peers` and user and total quotas.
- **Offers are not bound to the host.** Every invite holder can derive the relay key, so a hostile member could publish an offer for its own relay and learn each joiner's IP address from it. When offers naming different relays are live on one topic, the joiner uses none and joins without a relay. That turns the leak into a denied relay, which is the residual.
- Nothing is stored on a joiner's device and nothing is logged: no `console.*` formats a secret, a credential or an offer (`lobby-key-logs.test.ts`).
- There is no e2e test: CI has no TURN server. The unit tests pin the derivations, a coturn credential vector, the seal, the rejoin rules and the two-relay refusal.

## Alternatives Considered

- **Hand the relay over on the data channel.** Only reaches joiners who did not need it.
- **Share static credentials too.** They would be valid forever for anyone who ever had the link.
- **Put the relay in the invite link** (as #972's `turn=` does). Every link pasted anywhere would carry a credential, which is then as long-lived as the chat it sits in, and the host could not stop handing it out.
- **Bind offers to the host's key.** Nothing a joiner has can tell the host's key from a member's: every member derives the same secrets from the invite link. A per-host signature would need the host's identity in the link, which is a second secret to share.
