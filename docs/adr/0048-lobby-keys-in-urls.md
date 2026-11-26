# ADR-0048: Lobby keys are 256-bit and travel only in invite links

## Status

Accepted (2026-11-01). Issue #2100, operator request, prerequisite of #2091. Supersedes in part ADR-0043: its short typed key, "not in URLs", and PBKDF2. ADR-0043's room, password and proof derivations, its key proof, and "Open and closed" stand.

## Context

ADR-0043 made the lobby key a secret of 12 symbols, ≈ 2⁵⁴, short enough to read aloud and type, and made up for the small space with 600 000 rounds of PBKDF2: every open and every join paid ~0.3 s for it. Players do not read keys aloud; they paste them into a chat. A link they can click is easier still, and #2091 needs one to carry the TURN relay along with the key.

## Decision

**The key is 32 random bytes** from `crypto.getRandomValues`, written as base64url without padding: 43 characters, `[A-Za-z0-9_-]`, case-sensitive (`LOBBY_CODE_LENGTH`, `isLobbyCode`). The last character carries only the 256th bit's four leftovers, so a key has one spelling. Nobody types or reads it, so there is no alphabet of unambiguous symbols, no grouping and no case folding.

**It travels only inside an invite link,** `<origin><pathname>#lobby=<key>`. The base is the page's own, so a fork or a dev server invites to itself. The title bar has **Copy invite link** and nothing else: no key shown anywhere, no field to type one into. Opening the link, at boot or by pasting it into an open tab, joins as the typed join did, and `lobby=` is then taken out of the address bar with `history.replaceState`, as `turn=` is (#972). `#lobby=…&turn=…` works: each part has its own reader.

**The seed is HKDF-SHA-256 of the key's bytes** with the fixed salt `LOBBY_KEY_SALT`. With 256 bits there is nothing to stretch: guessing a key is out of reach however cheap one guess is, and every open and join gets ~0.3 s faster. Room, password and proof stay `HMAC(seed, "room" | "password" | "proof")`.

## Why the fragment is safe

A URL's fragment is never sent to a server: not in the request for the page, not in a `Referer`. The page reads it and removes it from the address bar and the history entry at once, so a reload, a bookmark made later, or a screenshot of the address bar does not carry the key. The key still lives in whatever chat the link was pasted into, as it did when it was typed there. Keys and invite links never reach a log (`lobby-key-logs.test.ts`).

## Consequences

- Every 12-character key stops working, and nothing reads one any more.
- **Given up: reading a key aloud** across a LAN party. Send the link instead.
- A browser history entry made before the page reads the fragment (the navigation itself) is replaced, not removed; a browser that syncs history mid-load could see it. Accepted: the same holds for `turn=`.
- The derivation constants are part of the protocol, as before: changing one moves every room, and `PROTOCOL_VERSION` changes with the wire schema.

## Alternatives Considered

- **Keep 12 typed characters and add a link beside them**: two ways in, and PBKDF2 kept for the typed one. Rejected: nobody types a key a link can carry.
- **The key in the query (`?lobby=`)**: sent to the server and in `Referer`s. Rejected.
- **Keep PBKDF2**: it slows every join and buys nothing against 2²⁵⁶. Rejected.
- **QR codes, shortened links**: out of scope (#2100).
