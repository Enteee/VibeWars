# Security

VibeWars is a browser PvP game with **no server**. The client is a static
site (GitHub Pages). One player's browser, the **host**, runs a lobby and
its match; the others are **peers** that join it by its key over WebRTC
(ADR-0022). This file says what we defend against, what we deliberately do
not, how to report a problem, and which weaknesses are known and still
open.

It is kept by the `perf-sec-qa` role. A change that moves a trust boundary
— a new peer message, a new thing written to disk, a new third party the
page talks to — updates this file in the same pull request.

## Reporting a vulnerability

Do **not** open a public issue for something exploitable. Use GitHub's
private reporting instead: _Security → Report a vulnerability_ on
<https://github.com/Enteee/VibeWars>. Include:

- the commit you tested against;
- the exact messages that trigger it (a script is ideal);
- what happened, and what should have happened.

There is no released version yet, so there are no supported versions to
backport to: fixes land on `main` only. We aim to acknowledge a report
within a week. There is no bounty.

## Who computes what

The host runs the simulation in a `MatchHost` (game-session) and sends
snapshots. Every peer sends intents and draws what the host says. Peers
find each other through Trystero over public Nostr relays, then talk over
WebRTC data channels, with public STUN and no TURN. The lobby key is a
secret that never reaches Trystero: the room and its password are derived
from it by a slow function, and peers prove the key to each other before
the lobby says anything (ADR-0043). There are **no accounts**: players' own
data (characters, builds) lives in their browser's IndexedDB and reaches
the host only as the build in a join.

The attacker we design against is a **hostile peer**: someone in the lobby
who skips our client and sends whatever bytes they like on the room's
channels, as often as they like.

## What we defend against

| Threat                                                  | Defence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A peer claims an outcome (damage, position, HP)         | Peers send **intent only** (`ClientIntent`: move / stop / target / use-skill / attack / cancel / walk-to). Every outcome is computed by the host in `game-core`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| A malformed or malicious message crashes the host       | Every inbound payload is `unknown` until a `parse*` in `game-protocol` has checked it; non-finite numbers are rejected. `protocol-fuzz.test.ts`, `match-hostile.test.ts` and `lobby-hostile.test.ts` enforce "never crash on a peer's input".                                                                                                                                                                                                                                                                                                                                                            |
| Casting a skill the player does not have                | A peer sends a **slot index**, never a skill id; the host reads its own copy of the bar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| An illegal build (over budget, wrong profession)        | `validatePlayerBuild` runs at join; anything illegal gets a starter build.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Moving faster than allowed                              | Direction is clamped to unit length; speed comes from the ruleset; walls and bodies are resolved by the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Targeting a player who does not exist                   | `applyTarget` accepts only a player in the match. Range and line of sight are checked at cast time. A weapon attack is accepted only against a living enemy, and a ranged shot checks line of sight as it is released.                                                                                                                                                                                                                                                                                                                                                                                   |
| Display names used to attack other players' UIs         | `sanitizeName` strips controls, format characters (bidi overrides, zero-width) and blank fillers, except a ZWJ or ZWNJ between two visible characters and the tags of a complete subdivision flag. It keeps at most 2 combining marks per letter, and clamps to 16 whole graphemes and 48 code points; a grapheme over 12 code points or 4 joiners collapses to its first. The web client must render names as text, never as HTML.                                                                                                                                                                      |
| One peer flooding messages                              | The host handles 60 messages a second per peer, with bursts of up to 300, and ignores the rest (gap 3).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Chat used to attack other players' UIs, or flood (#479) | The lobby host routes every line; peers never chat to each other directly. `sanitizeChatText` cleans a line as `sanitizeName` does, then clamps to 200 graphemes (`MAX_CHAT_GRAPHEMES`). A peer gets 5 lines in 5 s, its own budget; past it the line is dropped and the sender told once. Team chat is sent to that team's members one by one, never broadcast. The web client must render chat as text, never as HTML.                                                                                                                                                                                 |
| Guild tags or capes against UIs (#1406, #1422)          | The host passes every `guildTag` through `sanitizeGuildTag`: trimmed, then 2 to 4 ASCII letters or digits (`^[A-Za-z0-9]{2,4}$`) or none. Anything else, a non-string included, means the player plays untagged; it is never a refusal. A tag cannot carry markup, controls or look-alike letters. The web client still renders it as text. A cape (#1422) is three names, each from a fixed list (`CAPE_COLOURS`, `CAPE_EMBLEMS`), checked by `parseWireCape`: anything else is no cape, and a cape without a valid tag is dropped. The client draws only its own palette, never a colour a peer sends. |
| Attacking faster than the weapon allows                 | The swing timer is the host's. A new `attack` starts it at 0 and a swing lands only after a full interval, so toggling `attack` and `cancel` only slows the attacker.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Host-only lobby actions by a peer                       | Only the host's own player picks the mode (#1526), the map and starts; a lobby command changes its sender and names no other player.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| A stale or foreign client desynchronising a match       | `PROTOCOL_VERSION` is checked on every hello and lobby join; a mismatch is refused.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Oversized messages                                      | Trystero drops a message over `MAX_RECEIVE_BYTES` before decoding it, and no game message is bigger than `MAX_MESSAGE_BYTES` (see below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Secrets in source                                       | There are none to leak: the game has no credentials. `gitleaks` runs over history on review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Non-reproducible simulation abuse                       | Simulation randomness is seeded (`SimulationRng`), so any reported exploit can be replayed from its seed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## What we explicitly do not defend against

- **A cheating host.** The host decides every outcome: damage, hits,
  deaths, energy, cooldowns, the score and who won (ADR-0022, "The host can
  cheat"). It sees every intent before it acts on it, can drop, delay or
  forge any message it relays, can kick anyone, and controls the match
  clock. Nothing a peer runs can tell a fair host from a cheating one. P2P
  is for playing with people you would let host; there is no ranked play,
  and none is planned without a server. Random Arena (ADR-0032) puts
  strangers together, so it stays unranked and keeps nothing past a visit.
- **Choosing to host a Random Arena.** The host of a queued match is the
  ticket whose `sha256(groupId ‖ ticketId)` is lowest, and tickets are
  public, so a player can grind fresh ticket keys (about 2 × team size
  tries) to host their own match. Accepted, like any cheating host;
  commit-reveal is the lever if a mode with stakes ever uses the queue.
  Tickets that say `hardNat` (#2090) are left out of that draw, so a
  grinder who claims `false` needs fewer tries in a mixed group: with
  half the tickets hard, half the work. `hardNat` is one more public bit
  about each queued player, a recon hint, accepted. The NAT check's two
  STUN servers see the player's IP, as Trystero's already do.
- **A flood of fake queue tickets.** A ticket costs nothing to publish,
  so a sybil flood can stall the queue, every group falling through. A
  ticket id is its signing key, so nobody can rewrite an honest ticket.
  NIP-13 proof-of-work is the lever if it happens.
- **A Random Arena peer id is self-asserted.** Admission and the host's
  welcome are Schnorr signatures by ticket keys that name the group, the
  host's ticket and the joiner's transport peer id, so an outsider in the
  public room can neither pose as the host nor replay a joiner's proof
  from its own peer id. The peer id itself is whatever the transport
  reports, which a peer chooses; a peer that also claims a joiner's id
  could at most race that joiner for its one seat.
- **Knowing the key means being invited, while the lobby is open.**
  Anyone with the lobby key can join an open lobby and see it, and share
  the key on. Closing the lobby is the host's defence against a key that
  went further than meant: it keeps the guests already in and takes
  nobody new. A key is shared like a party
  invite: an invitation, not an identity. The relays see a topic, the
  WebRTC offers and answers, encrypted with a password derived from the
  key, and every peer's IP address; neither the topic nor the password
  gives the key back (ADR-0043, gap 5). A lobby is closed until its host
  opens it (#1682): a closed lobby takes nobody new, key or not, and is
  told so only after the key proof. A closed, empty lobby has no relay
  footprint at all; an open one, or a closed one with guests, shows only
  its derived topic.
- **A host leading its guests elsewhere (#1553).** A host that joins
  another lobby tells its guests that lobby's key (`lobby-move`), and
  they follow. Guests act only on a `lobby-move` from the host that
  passed the key proof, and the host sends it only to admitted guests,
  who are already trusted with a key (ADR-0043). A hostile host can
  send its guests to any open lobby whose key it holds. That is
  accepted: the follow is an ordinary keyed join, and the guest sees
  the lobby it lands in.
- **A flooded lobby topic.** The topic a lobby announces on is public, so
  anyone watching the relays can announce on it too and make the host
  start handshakes that fail. That is denial of service, not access: such
  a peer cannot decrypt the offers, and gets nothing from the host but a
  key challenge.
- **Identity.** There are no accounts, passwords or tokens. A player is a
  peer in one room. Anyone can pick any name, and two players can share
  one. Do not build anything that relies on a name meaning a person.
  The same holds for guild tags (#1406): any peer may wear any tag, and
  nobody claims or owns one, or its cape. A tag is not a guild membership.
- **The character a lobby lists** (#580). Each peer says what character it
  brings, by name and professions, and the lobby shows that. Nothing ties it
  to the build the peer then sends in its match `hello`, so a peer can be
  listed as a Monk and play a Warrior. The build is checked, and an illegal
  one gets a starter build. Its label is not checked. Do not use the
  lobby's character for anything but display. A Team Lobby's seat is the
  exception: there, the host assigns the build (#1458).
- **What is said in chat** (#479). The host reads every line, its own
  team's and the other team's, and could drop or forge one. There is no
  moderation and no report button, only a mute each player sets for the
  session. Do not say anything in chat you would not say to the host.
- **Look-alike names.** A name may use letters from any script, so a
  Cyrillic "а" can pass for a Latin "a". There is no confusable detection.
  A ZWJ or ZWNJ between two letters is kept, because Persian and Indic
  scripts need it, so an invisible joiner can make two names look the same.
- **A dropped match.** Without TURN, some pairs of networks never connect
  (ADR-0022). A peer that cannot reach the host cannot play.
- **Volumetric DoS.** A host is one browser tab. A peer that floods it with
  traffic can make its tick late; filtering that is the network's job.
  _Cheap application-level_ abuse (one peer making the tick slow) is in
  scope and must be defended in the host.
- **Cheating that needs only what a peer is shown.** Every peer gets the
  full match state, including enemy positions, health and casts. An
  aimbot-style helper that reads that state is not prevented. There is no
  fog of war. Hidden information must be left out of each peer's snapshot
  by the host, never hidden in the renderer. Traps are the first (#1105):
  they are never in a snapshot, and the host sends each team its own on
  the `"traps"` channel, so a peer never receives a foe's trap.
- **Players' browser storage.** IndexedDB is the player's own data on the
  player's own machine. A record in the wrong shape is discarded (ADR-0016).
  We do not try to protect it from the player.

## What a peer learns about the others

- **IP addresses.** WebRTC exchanges ICE candidates, so every peer in a
  room learns the public IP address of every peer it connects to, and on
  some browsers a LAN address too. Browsers hide LAN addresses behind mDNS
  names by default, but the public address is always visible. The Help
  screen says so (Getting started).
- **The relays see who meets whom.** Each public Nostr relay sees the IP
  address of every browser in a room, the room's name, which is derived
  from the lobby key by ADR-0043's slow function, and the WebRTC offers and answers (SDP) that pass
  through it. Every open tab hosts its own lobby (#1526, ADR-0041), so a
  relay sees each player online, not only those in a match. The relays
  are third parties we do not run; the list lives in
  `apps/web/src/net/transport/relays.ts` (#392).
- **Everything in a snapshot.** A peer receives every snapshot field the
  host sends, for every player. Anything that must stay hidden from a
  player must not be in the snapshot at all.

## How the host and its peers check each other

- Every message is `unknown` until a `parse*` in
  `game-protocol/src/p2p.ts` accepts it. Each parser caps string lengths
  and array sizes, never throws, and returns a fresh object. Peers parse
  the host's messages too: a host is trusted for outcomes, not for
  well-formed bytes.
- A sender is the `from` the `Transport` reports, which comes from the
  connection, never from a field in the payload. A message names no other
  player whose state it changes. `MatchClient` drops every message that
  does not come from `hostId`, which the app takes from the lobby it
  joined, never from a message a peer can send.
- A returning player proves who they were with their rejoin token, never
  with their peer id: `selfId` lasts one page load. The token crosses the
  wire once, in the host's `welcome`, and never back (#593). A rejoin is a
  challenge: the guest names its seat, the host sends a fresh 128-bit
  nonce, and the guest answers with an HMAC-SHA-256 keyed by the token over
  the nonce, the seat and the guest's own peer id
  (`game-session/src/rejoin-proof.ts`). The host checks it against the
  `from` the proof arrives on. A nonce is good for one proof, and a new
  hello from the same peer kills the old one.
- A peer id is not a credential either way. Trystero's peer id is a string
  the peer itself puts in its signalling, so a modified client can announce
  any id. When the host's peer drops mid-match (#515), a guest answers a
  challenge from whichever peer comes back as the host's id. An invited
  peer that announces itself under that id in the window can feed the
  guest its own snapshots, but learns only a nonce and a proof bound to the
  guest's peer id, which the real host refuses from anyone else, so it
  cannot take the guest's seat. What remains is a live relay: a peer that
  poses as the host's id to the guest and as the guest's id to the real
  host, both at once, while both are up. That needs two spoofed ids, the
  lobby key and a real drop, and we accept it. Authenticating the host to
  its guests is out of scope.
- `MatchHost` (#375) parses every intent with `parseClientIntent` and
  counts a message budget (gap 3) per peer. The budget covers every
  channel, `hello` and `bye` included, and only a peer leaving the room
  resets it, so a peer cannot refill it by quitting and saying hello
  again. A peer that said `bye` is not seated again until it leaves the
  room.
- The key gate (#1681, ADR-0043, `keyGated`) runs under `LobbyHost` and
  `joinLobby` on every transport. The host sends a new peer a
  `key-challenge` nonce and nothing else, and ignores everything but its
  `key-proof`: an HMAC keyed by a derivation of the key over both nonces
  and both peer ids, checked in constant time. A wrong or malformed proof,
  or none in 5 s, drops the peer; each nonce is answered once; at most
  `MAX_LOBBY_PLAYERS` peers wait unproven, the oldest dropped first. The
  host's `key-proven`, the same with its side named, is checked before the
  guest hears anything from it. Until both hold, neither sees the other in
  the room. A queued lobby has no key: its tickets are its gate.
- `LobbyHost` (#379) acts on nothing a peer sends before its `lobby-join`,
  charges `lobby-join` and `lobby-cmd` to the same per-peer budget, and
  lets only its own player pick the map and start. A command names no
  player: it changes its sender. A lobby's match seats only the peers the
  lobby put on a team, with the lobby's team and name; any other `hello`
  is refused `match-full`.
- A Team Lobby (#1458, ADR-0040) hides each side's proposals, votes,
  chosen build and claims from the other: while it runs, `lobby-state`
  goes to each member alone, with the other side `null`, and a spectator
  sees neither. Nobody changes team once it has begun, and a peer who
  joins then is a spectator, so no one can hop sides to scout. A proposal
  holds exactly the side's size in builds, each checked against the
  ruleset; one per member, with votes only for a proposal on the voter's
  side and one claimed slot per member. The match then plays the build
  the lobby assigned to a seat, whatever the peer's `hello` brings. The
  host's own player is the exception: its browser holds both sides.
- A match host (#480) sends each tick's snapshot, combat and `ended` to
  each seated peer, never to the room, so a spectator in the lobby's room
  does not see the match live. A member the lobby has on no team may
  `observe` it and is sent the same, `OBSERVER_DELAY_SECONDS` (10 s)
  late, but never a seat's or a team's own channels (skill bar, recharges,
  calls, traps). The delay keeps a spectator on voice with one team from
  calling the other's moves in time to matter. Anyone else's `observe` is
  refused `not-a-spectator`, and a viewer's intents and calls are dropped:
  it has no seat.
- `joinLobby` takes as host the peer that sends the first `lobby-state`
  for its code that names that peer as host and lists the player, then
  drops every lobby and match message from anyone else. Before that first
  state, a peer in the room can answer faster than the host and pose as
  it. That peer had to know the key, so it is someone invited (see
  above), and the lobby it fakes holds nothing but names. In the same
  window it can also fail the join with a `lobby-note` refusal.
- A queued lobby (#871) closes that window: the room's name is public, so
  `joinLobby` says only an empty `lobby-hello` to the room, sends its
  signed `lobby-join` only to a peer whose `lobby-welcome` verifies
  against the planned host ticket, and takes a `lobby-state` or
  `lobby-note` before the host is known only from such a peer. The host
  welcomes each peer once, on its hello or its join, before checking its
  proof, so even a refusal comes from the planned host, and seats a
  ticket once. A signature check costs milliseconds, so each side checks
  at most one from each peer while it is in the room: the host one join,
  the joiner one welcome; the host checks a seated ticket not at all.
- `hello.build` is capped in values and depth by `parsePeerHello`, then
  goes through `resolveJoinLoadout` and `validatePlayerBuild`: an illegal
  build gets a starter build, picked by the host's own random.
- The Trystero transport (#392) passes `maxReceiveBytes`
  (`MAX_RECEIVE_BYTES` in `relays.ts`), so Trystero drops an oversized
  message before decoding it, and a peer cannot make another allocate an
  unbounded buffer. The same number is also one budget for the whole room's
  messages that do not fit one 16 KiB frame with their 36-byte header,
  which Trystero sends in chunks. A peer that sends one chunk every two
  minutes holds that budget, which stalls every other large message.
  Review rule: keep every game message within `MAX_MESSAGE_BYTES` (16 KiB
  less that header). The host splits a tick's snapshot into parts
  (`packSnapshot`, #662) and its combat into batches (#601), each of at
  most `MAX_MESSAGE_BYTES`.
- **The Random Arena queue's relays are public and untrusted** (#872,
  ADR-0032). Anyone can publish to them, so `nostr-queue.ts` takes a
  ticket or withdrawal for id X only from an event signed by X, whose
  NIP-01 id it recomputes. Anything over 4 KiB or of a mode nobody here
  queues for is dropped before any signature check. A Schnorr verify
  costs about 3 ms, so verifies are budgeted per board
  (`VERIFY_PER_SECOND`, `VERIFY_BURST`). A flood of fake events slows
  matchmaking but never freezes the tab.
- **Host bandwidth.** The host uploads every peer's snapshot every tick:
  about 85 KiB/s per peer at 4v4 and 170 KiB/s at 8v8
  ([benchmarks](docs/development/benchmarks.md)), so around 20 Mbit/s for
  a full 8v8. That is a limit on who can host, not an exploit.

## Known open gaps

Gaps 1–5 were found by reviewing `main` at `47a403f`, 6–7 at `1cfd5b5` (both
2026-10-24), and 8 at `76388c3` (2026-10-25). Each one is in scope by the
rules above and needs a fix. When one is fixed, cut it down to one line
saying so in the same PR. Keep the numbers: issues cite them.

1. **Fixed by #156:** a lobby's match was open to strangers (#41).
2. **Fixed by #156:** there was no cap on players per match (#42).
3. **Fixed by #43:** there was no per-peer message rate limit. Each peer
   now has 60 messages a second handled, with bursts of up to 300, and the
   rest are ignored.
4. **Fixed by #44:** any lobby member could send `return-to-lobby`.
5. **Fixed by #1681:** a live lobby's code could be read off the relays.
   Trystero announces a room on the topic
   `sha1("Trystero@" + APP_ID + "@" + room)` in clear, and the room was
   the code: hashing all 23⁶ ≈ 148 million codes took minutes on one core,
   and the password was the code too. The key is now 23¹² ≈ 2⁵⁴, and room
   and password come from 600 000 rounds of PBKDF2 over it (ADR-0043).
6. **Gone with the server (#404):** there was no cap on rooms or players on
   the shared server (#114, #265).
7. **Gone with the server (#404):** client strings reached the server log
   unescaped (#115).
8. **Fixed by #178:** display names could carry invisible and
   direction-changing characters (#174).

## Music patterns are code

The music (#366) is written in Strudel. Strudel turns a pattern into
JavaScript and runs it in the page, with the page's full rights. A track
is therefore code, not data. Shipped tracks are fine, because they come
from this repository and get reviewed like any other source.

So no pattern runs in the game page. All of them run in the music host
(ADR-0028, #371): `music-host.html` in an `<iframe sandbox="allow-scripts">`
with an opaque origin, which holds no game state, saves or connection, and
talks to the game only by `postMessage`. What holds:

- **The host runs only sandboxed and framed.** `host/guard.ts` checks
  `self.origin === "null"` and `parent !== window` before the engine is
  even fetched. Opened top-level or framed without a sandbox, it loads
  nothing and answers nothing (e2e covers both).
- **The sandbox is exactly `allow-scripts`.** `allow-same-origin` would
  give a pasted beat the game's storage; e2e asserts the attribute.
- **Both sides check `event.source`, never the origin**, since every
  sandboxed frame's origin is `"null"`. Every message is parsed field by
  field, with length caps, in `host-protocol.ts`; anything else is dropped.
- **The host's CSP is `default-src 'none'`**, with `connect-src 'self'`, so
  a pattern cannot fetch from or beacon to another host.
- **A hung host is torn down.** The game pings every second and removes a
  frame that has not answered for five.
- **A flooding host is torn down** (#878). The game counts every message
  from the host's window, parsed or not, and removes it at the 101st in a
  second (`HOST_MESSAGES_PER_SECOND`; a real host sends about two). A flood
  can answer pings, so the watchdog alone would not catch it. Only one error
  per evaluation, and one per track sent, reaches the page.
- **A saved edit that stops the music is not replayed.** When the host is
  torn down, for hanging or flooding, while it plays an edited track, the
  edit is removed and the next menu says so once.

What does not hold, and why it is acceptable:

- **A pattern can navigate its own frame.** The new page keeps the same
  `contentWindow`, so it passes the game's source check and can speak the
  protocol. It is still sandboxed and opaque, and everything it says is
  parsed. Review rule: render text the host sends, such as a track id or
  an error, with `textContent`, never as HTML.
- **Any site can frame the host** in its own sandbox and drive it, because
  static files carry `Access-Control-Allow-Origin: *`. There it is just a
  copy of Strudel with an opaque origin that reaches nothing of ours.
- **A same-thread hang in Firefox and Android is not caught.** There the
  sandboxed frame can share the game's thread, so a pattern that spins
  forever (delayed by a `setTimeout`) hangs the watchdog with it, and a
  saved edit that does this hangs every load. The way out is clearing the
  site's data. Unverified, since the jails have no Firefox; if it is
  confirmed, a crash sentinel follows (an edit playing when the page last
  died without `pagehide` is not replayed).
- **The vite dev server answers `Origin: null`**, which any site's
  sandboxed frame sends, so `server.fs.allow` limits it to `apps/web`,
  `packages` and `node_modules`. Never widen it to the repo root: `.bots/`
  holds the company's logs.

Review rule: a pattern from anywhere, including a beat editor, a shared
link or a lobby message, reaches Strudel only through the music host, never
the game page.

## The static deploy

`.github/workflows/pages.yml` publishes the client alone to GitHub Pages:
`/next/` follows `main`, the root follows the latest release (#103). It is
the whole game: online play is peer to peer from the page itself.

- **The write token never meets repository code.** `build` runs the repo
  and its dependencies with a read-only token it does not persist.
  `deploy` holds `contents: write` and runs only the workflow's own shell
  over the built artifact. `upload-artifact` drops hidden files, so a build
  cannot slip a `.git` into `gh-pages`. Keep it that way: never add a
  checkout, `devenv` or `pnpm` step to `deploy`.
- **Saves on Pages are not isolated.** Every Pages site under
  `enteee.github.io` is one origin. `storage/namespace.ts` keeps the
  release and `next` from reading each other's saves _by accident_. It does
  nothing against another site on that origin, which can read and write
  them. Saves are builds, a display name and a TURN relay (#972, #1269),
  and we accept this: every site on that origin is published by the
  operator alone, so only code the operator deploys can read them. A relay
  credential is low value, a per-friend password its owner rotates with
  `turn-link` or revokes with `turn-user remove`. Nothing more secret than
  that may ever be stored in the browser on Pages.
- **A manual run cannot publish a side branch.** `workflow_dispatch`
  builds whatever `--ref` it is given, so `deploy` is held back by the
  environments' deployment-branch rules instead: `test` accepts `main`,
  `prod` accepts `main` and tags. Those rules live in the repository
  settings, not in this repo, so a review cannot see them change. Re-check
  them when anything touches `pages.yml`.

## Dependencies

`osv-scanner` and `trivy` run over `pnpm-lock.yaml` on review, and
`semgrep` (`p/javascript`, `p/typescript`, `p/nodejsscan`, `p/secrets`)
runs over the source. The last full run was at `1cfd5b5` (2026-10-24).
semgrep found nothing real there. Currently reported:

None.

Three checks in CI (#133, #175):

- **`dependency review`** runs on every pull request, and the merge guard requires it. It fails the pull request if the change adds or bumps a dependency that has a high or critical advisory. It looks only at what the pull request changes.
- **`pnpm audit`** (`audit.yml`) covers advisories against code already on main: new ones published later, and ones in dependencies no pull request touches. It runs on every push to main, daily, and by hand, at `--audit-level high`, with dev dependencies included. It is not a pull request check, because one new advisory would otherwise block every pull request. When it goes red, `perf-sec-qa` opens one issue per advisory. The issue resolves it in one of three ways: a bump, an override, or an accept recorded in the table above and in `pnpm.auditConfig.ignoreCves`, linking that issue. Blanket ignores are not allowed.
- **CodeQL** (`codeql.yml`) scans the JavaScript and TypeScript source with GitHub code scanning's default queries. It runs on every pull request, on every push to main, weekly and by hand. It is advisory and cannot fail a pull request: its steps set `continue-on-error`, and the repository's code scanning check run failure threshold is **None** (_Settings → Code security → Code scanning → Protection rules_). A fresh repository needs that setting made by hand. Alerts show in _Security → Code scanning_ and as annotations on the pull request. The check run passes whatever it finds. The company's roles can read the alerts with `hub alerts [--pr N]` (#184; a role added later gets no access until `ALERT_READERS` in `hub-policy.mjs` names it, and the business-analyst, #893, has none). `perf-sec-qa` triages them, and the manager opens one issue per real alert. A false positive is dismissed in the Security tab, with a reason.

## The agent company

The repository is built by nine autonomous agents (`scripts/bots/`,
`nix/claude-*.nix`; see ADR-0015 and ADR-0023). They are a second attack
surface, separate from the game. Here the attacker is **an agent**, whether
it was prompt-injected or is simply wrong, and the asset is **the operator's
host and `main`**.

| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jail → host | Each agent runs in bubblewrap, with no MCP server or claude.ai connector (a connector would be an egress channel outside hub's checks) and a fixed tool list; `agent-turn.mjs` stops a turn whose init lists an MCP server (#753). Only its worktree, its bus directory and the shared `.git` are writable. `.git` is a private tmpfs with `HEAD`, `config`, `hooks`, `info`, `packed-refs` and other worktrees read-only, and `objects`, `refs`, `logs/refs` and the jail's own admin dir writable (#61, #69, #83); the host creates and repairs worktrees (`worktree.mjs`). Skills are bound read-only: main's export (`.bots/skills-main`) for every role, and the manager's own drafts for the manager, refused if any of `.claude/bots/skills` is a symlink (#27). Host processes that write below a jail's bus or hub directory (hubd, the Telegram sidecar, the agent loop) go through `scripts/bots/jail-fs.mjs`, which opens each directory component refusing symlinks, pins it by descriptor, and creates files `O_CREAT \| O_EXCL \| O_NOFOLLOW` (#329). No reboot without the operator (ADR-0034, #960): `company reboot` only writes a proposal with a 128-bit random id to the host bot root; the sidecar accepts only the operator's tap on that proposal's own message, carrying that id, and hubd reads the decision only from `.bots/link/reboot-decision.json`, never from an inbox, outbox or `tg ask` answer, which a jail can write. The restarter boots the approved commit, not `main`'s tip. |
| Jail → GitHub | Agents hold no credential. `hub` asks `hubd` (`hub-policy.mjs`), which enforces each role's permissions. hubd holds the company's GitHub machine account, never the operator's: every `gh` call with the company's `GH_CONFIG_DIR`, every push and fetch with its key and none of the operator's ssh config or agent (#866, ADR-0031); only `claude-llc-init` runs as the operator, for the board and the ruleset. Who asks is the spool directory, never the request: each employee (`qa-tester`, `qa-tester@2`) has only its own `hub/<employee>` bound writable, and hubd maps that name to a role through `staff.json` alone, whose parser refuses an entry whose role is not the id's. A spool nobody is employed under is refused (#381). A push goes under the employee's own `bot/<employee>/`, whatever hat allows it. hubd also refuses every gh flag that would read a host file (#26), pins the repository, and records verdicts against the reviewed SHA. The manager may push only `bot/manager/*`, and only changes inside `.claude/bots/skills/`: hubd checks that in its mirror against GitHub's `main`, failing closed (#27). Every role but cicd-engineer is refused any push that changes `.github/workflows/` or `.github/actions/`, checked the same way (#116). The company's token holds the `workflow` scope, so qa-tester can merge a pull request that changes them, but only behind both approvals and green checks, and only when it was pushed from this repository on a cicd-engineer `bot/<employee>/` branch; the guard re-diffs the approved head in the mirror and fails closed, and anything else is the operator's to merge (#1897, ADR-0046). And main's workflows may not grant `checks` or `statuses` write (`workflow-permissions.test.mjs`). The merge guard refuses a check name reported by more than one check suite or status (#96). The business-analyst (#893) is read-only on GitHub: it reads issues, pull requests, runs and the board, and `company load`, but may not comment, push, move a card or file an issue; in its jail it reads `hub/kpis.json`, hubd's logs and every inbox, as every role can. Residual: cicd-engineer can still push an unreviewed side-branch workflow; one role has to own CI. The workflow check diffs against the merge base, so a branch cut from an old main carries that main's workflows unflagged; every workflow main has ever had is `contents: read` and runs on push to main only, so today that is harmless. |
| Jail → Anthropic | The agents authenticate with the company's own Claude account, bound from `<credentials>/claude/.credentials.json`, never the operator's `~/.claude`. `claude-llc-init` and the `claude-llc` boot refuse to start unless that account is signed in; whether it is a separate account from the operator's is the operator's setup, and the doctor only shows it (#865, ADR-0031). A compromised jail can use that one account, not the operator's. |
| Support jail (#148) | Support reads strangers' text, so it is assumed prompt-injected, and anything it can read could end up in a public reply (ADR-0025). Its jail holds no secret and can write nothing shared: main exported as files from hubd's mirror, read-only, with no `.git`; only its own bus and hub directories and the heartbeats; no `~/.config/git`, skills or `.credentials.json`; no network (`--unshare-all`, no `--share-net`). Claude reaches the API through `support-proxy.mjs` on the host, over a bound socket: only `POST /v1/messages` and `/v1/messages/count_tokens`, exact, to `api.anthropic.com`, any credential header the jail sends dropped, the company's OAuth token added per request. Its `tg send` reaches only the manager. `jail-args.test.mjs` checks the arguments, `claude-bot --smoke support` the jail. Residual: an injected support agent can still spend the company's usage, capped only by the proxy's hourly budget (`supportRequestsPerHour`, 200), which is per support seat, since each seat runs its own proxy; and it can still file issues, as its hub policy allows. |
| CI runner jail (#1889) | A job on the company's runners runs whatever its branch's workflow says, so it is treated as hostile (ADR-0045). `runner-jail.mjs` runs one ephemeral runner per job in bubblewrap: no network (`--unshare-all`, no `--share-net`), uid 1001, `--die-with-parent`, `--clearenv`, `--cap-drop ALL`, `--disable-userns`, under a `systemd-run` scope capped at 2 CPUs, 6 GiB and 2048 tasks by default. `/nix`, `HOME` and the work dir are a fresh scratch directory deleted on exit; the runner's closure and a base userland are overlays, so the host's store cannot change. Never bound: the operator's home, the hub, the credentials, the SSH key, `/run/user`, any socket but its proxy's. Its only egress is `runner-proxy.mjs`: CONNECT to port 443 of a host in `runner-proxy-allow.json`, exact or dotted suffix, no IP literal, no name resolving into the host's network, no userinfo or raw IDN, no credential added, every refusal logged. A job-started hook the jail ships fails, closed, any event not on `runner-events.json` (push, schedule, dispatch, same-repository pull request). `runner-jail.test.mjs` and `runner-proxy.test.mjs` check it. Residual: egress filtering is not exfiltration-proof, so the jail holds nothing secret; a job can send what it reads, its checkout and its token, to an allowlisted host it controls content on, as on GitHub's runners; a kernel user-namespace or overlayfs bug is a host escape; the scratch directory has no disk cap, so a job can fill the host's disk until #1888 gives it its own filesystem or quota. |
| Runner supervisor (#1890) | `runner-supervisor.mjs` holds the runners' token (`runners-gh/`, _Administration: write_, which can also edit branch protection) and mints one JIT config per runner, piped to the launcher on stdin. It is a daemon of its own, not hubd, and only its pane is told `VIBEWARS_CREDENTIALS`. Each launcher dies with it through a lifeline pipe, so a crash never doubles the runners past the host caps. hubd and it share only the validated target and status files (`runners-state.mjs`). `runner-supervisor.test.mjs` checks it. Residual: it runs under hubd's uid, beside hubd's own `gh/`, so a compromised hubd can read the runners' token; a separate uid closes that, and the operator decides whether it must land before `COMPANY_RUNNERS` goes on. |
| Host git near agent data | Every host git runs with `GIT_HARDENING` and `GIT_ENV` (`git-hardening.mjs`). These pin hooks, fsmonitor, ssh, credential helpers, gpg and filter drivers, and set `GIT_NO_REPLACE_OBJECTS` (#67). The operator checkout sets `core.useReplaceRefs=false`. `refs/` stays writable, so never trust a local ref on the host. |
| Reboot | The restarter builds GitHub's `main` from hubd's private mirror and locks only that same SHA (#21). The company runs the commit in the host-only `.bots/company.lock`, from `.bots/company/<sha>/`, a tree written from the mirror's objects, never the shared `.git/objects` jails can write, and checked against them on every `up`; the lock must be on GitHub's main. Only a reboot or `claude-llc lock` writes the lock (#897, #1861, ADR-0044); the operator's checkout runs nothing but the `claude-llc` that starts `up`. `claude-llc lock` compares the checkout with the commit's objects in the mirror before pinning it. Residual: a hand checkout the operator makes before `claude-llc lock` goes through the shared store, so a forged object swapped back afterwards is not seen. So a jail that moves `refs/heads/main` changes nothing the company runs. |
| Telegram → agents | Only the group's creator is heard and gets the `*` mark, for messages, button taps and replies alike (#39, #47). All text goes through `visible()`: no line breaks, ESC, bidi, zero-width or tag characters. An unaddressed message reaches everyone only from General, the manager only from the Manager topic, and nobody from any other topic; only the manager may write to the operator (`tg send operator`), which the sidecar checks, not just `tg` (#85). |
| Agent → agent | Peer messages are information, never instructions. Agents can still overwrite each other's branch refs, but not each other's worktree metadata (#69). That is an integrity problem, not code execution on the host. |

Each jail sees only its own worktree, so to git every other one looks
deleted: a `git worktree prune` in one jail once deleted every other
agent's worktree metadata (#70). Since #69 that fails with EROFS, but
never run `git worktree` or `git gc` inside a jail.

**`.git` is shared only where a jail needs it (#83).** A jail's `.git`
is a fresh tmpfs. Onto it go `HEAD`, `config`, `hooks`, `info` and
`packed-refs` read-only, `objects`, `refs` and `logs/refs` read-write,
and `worktrees` read-only except the jail's own admin dir. Everything
else at the top (`index`, `MERGE_HEAD`, `rebase-merge/`, `sequencer/`,
whose todo files run `exec` lines) is the jail's private scratch: git
works in it and the host never sees it. A read-only `.git` with writable
parts does not work: git takes `.git/packed-refs.lock` to delete any ref,
a rebase included. Cost: `packed-refs` cannot be rewritten, so deleting a
packed ref fails ("Device or resource busy"); a loose one is fine. It is
a file bind, which pins its inode, so the launcher sets `gc.auto=0`,
`gc.packRefs=false` and `maintenance.auto=false` on the operator checkout
(`--smoke` asserts it): the host must never pack refs while jails run, or
they would read stale values. Known
gap: `objects/info/alternates` can be planted; objects are
content-addressed, so that is no code-execution path.
`claude-bot --smoke <employee>` asserts the layout.

Residual: `HEAD` itself is now safe from rewriting, but a symbolic `HEAD`
resolves through `refs/heads/<branch>`, which a jail can still move. Treat
`HEAD` like any other local ref: host code that starts from it starts from
an agent-chosen commit.

**Peer text in Telegram (#93).** The mirror body sits in a blockquote entity,
so a peer's fake `📋 Manager → 👤 Operator` line shows inside the quote, not as
a header. Mirrored text and `tg ask` questions and option labels also go
through `visibleLines` / `visible` (`scripts/bots/protocol.mjs`): bidi
overrides, zero-width and tag characters become `�`; line breaks stay as
`\n` inside the quote.

**Strangers' text (#394).** The repository is public, so anyone can
write text that agents read. Agents never see a comment by someone with
no role in the project: hubd replaces its body with a fixed placeholder
(`hub-strangers.mjs`), whether gh or REST answered, and refuses gh output
it cannot parse or a `--json` field it does not know. Only `OWNER`,
`MEMBER` and `COLLABORATOR` count, so it fails closed. Agents can still
read stranger text in these places, and each one is a prompt-injection
channel to treat as data: the body and title of a stranger's item once the
operator has put it on the board (`hub-visibility.mjs`), fork commit
messages and diffs, check and run names from fork workflows, run logs,
and project item bodies.

**Fixed: #329.** Host processes used to follow symlinks a jail planted in
its own writable directories: hubd's `hub/<employee>/res/.<id>.json.part`,
the sidecar's `bus/<employee>/inbox.jsonl` and `receipts/*.tmp`. An agent
could get the host to write, as the operator, to any file the operator
can write. Since #333 every such write goes through `jail-fs.mjs`. Review
rule: a new host write, read or delete below `.bots/bus/<employee>` or
`.bots/hub/<employee>` that does not use `jail-fs.mjs` is a finding.
Directories jails cannot write, like `bus/_system`, are exempt.

**Review rule: jail-written text on the host terminal.** Anything a jail
can write can carry ESC sequences, which a host terminal or tmux pane
obeys: it can retitle the pane, clear it, or draw fake lines. That covers
bus files, hub results, worktree files and each agent's own Claude logs.
Host code that prints any string from it goes through `visible()`. #357 printed the model name
from the logs raw, and was fixed before merge.

**Accepted risk: the company's usage numbers are jail-written.** The
dashboard's CLAUDE pane and the manager's `company load` (#747), its
staffing input, both count tokens from each agent's own Claude logs.
The pane's usage-left bars also come from `bus/<employee>/limit.json`
(#452), where the newest file wins, and `kpis.json`'s idle numbers
from `bus/<employee>/waits.jsonl` (#1615). All of it is read through
`jail-fs.mjs`, size-capped and shape-checked, so a jail cannot reach
the host through it. The idle sleeps agent-loop logs on the host go to
`agents/<employee>/waits.jsonl`, never the bus, so its write cannot
follow a planted symlink. A jail can still make its own role look busier or
idler than it is, which skews staffing, and can make the pane show any
percentage. These numbers inform, they do not gate. Before acting on
usage left, read `/usage`.

**Forged CI checks (fixed for hubd merges, #123).** A workflow pushed on a
side branch runs with `GITHUB_TOKEN` and can post a check run, or a commit
status, for any commit in the repository, under any name. The merge guard
therefore reads neither. It reads the **jobs** of the `pull_request` run of
`ci.yml` and of `dependency-review.yml` for the pinned head commit, and
requires each expected name to be carried by exactly one job in a run, and every
job that carries one to have succeeded. Jobs exist only because a workflow
executed, so no API can create one. Every such run counts, not the newest: a
second pull request with the same head and a base of its own choosing gets
its own green run for that commit, which cannot stand in for a red real one. A close and reopen makes a
second green run, which passes; a run that ended cancelled or failed, even with no jobs, blocks until it is
re-run or the branch gets a new commit. A run tests the merge of the head
into its PR's base, using the head's own workflow files, so reviewing gate
files stays load-bearing. Since #116 only cicd-engineer may push them. The jobs of `e2e-repeat.yml` and `codeql.yml` are not named, but every one of
them must succeed, as they did when the guard blocked on any failing check.
Code scanning's own `CodeQL` check run is not a workflow job and no longer
counts. A test pins `EXPECTED_CHECKS` to the
job names the two files define.

GitHub's own ruleset `required_status_checks` still matches by name, so the
operator merging in the GitHub UI is not protected by this.

**By design.** The manager may close and reopen any pull request or
issue (#84), gate PRs included, but never with `--delete-branch`. A
misbehaving manager can stall the pipeline this way; it cannot destroy
work or merge anything.

**Self-reminders (#678).** The manager, the architect and lead-dev may
each keep up to five recurring reminders to themselves (`hub schedule`,
every 15 minutes to 7 days, 500 characters). They go to their owner only,
prefixed `(your schedule <name>)`, and the dashboard lists them. Accepted
risk: an agent that has read injected text can store it as a reminder,
and it comes back every session. The prefix marks it as the agent's own
note, never the operator's word or the company's.

**CI watches (#736).** Any employee may ask hubd to tell it when CI on a
visible pull request ends (`hub watch ci <pr>`). A watch is of a fixed
kind with fixed reads. hubd never runs a command an agent supplied, and
a note is only said back to its owner. Watches are capped at 90 minutes,
and an employee lists and removes only its own. The answer reaches only
the asker's inbox, addressed to that one employee, and is never mirrored
to Telegram: it carries the note and test titles from a pull request,
which are not the System's to say on the operator's phone. It may quote
up to 40 lines of a failing e2e job's log, which is our own CI output.
`watches.json` sits in hubd's directory, which every jail reads, as the
schedules do. Each poll spends about one pull read and up to four run
lists per watched pull request a minute, from the shared REST budget. Moving a card to In Review is refused
until every open PR that closes it is green, by the merge gate's own
reading of the jobs.

**Wiki reads (#1380).** Any employee may ask hubd for a GW1 wiki page,
its Wayback snapshots, or a diff of two (`hub wiki`). hubd fetches from
two fixed origins only, `wiki.guildwars.com` and `web.archive.org`, with
the page name percent-encoded into a fixed path (no `.` or `..` segment),
no credential and a 15 s timeout per read. A redirect is followed only
onto those two origins, three at most, so a page cannot point hubd at
the host. A body over 4 MiB is refused unread, and a diff whose differing
part exceeds 4 million line pairs is refused. A page's text and a diff
are worked out in a worker thread, killed after 2 s, so a hostile page
cannot stall hubd's thread. At most two run at once, beside the gh lane, so a
slow Wayback cannot stall a merge. Accepted risk: the wiki is editable by
anyone, so a page is untrusted text, read as information like an issue
body; the answer goes only to the asker. What hubd reads is cached in
`.bots/web-cache/` (#1381), host-only and outside `hub/`, which every jail
binds: at most 10 GiB, least recently used evicted first, nothing stored
below the disk guard's free space. A cached page is served to any later
asker, which is no wider than the wiki itself.

**Peek (#19).** `agent-turn.mjs` on the host records each employee's
recent output under `$VIBEWARS_BOT_ROOT/peek` (mode 700, files 600),
bound read-only into the manager's jail and no other. No jail holds a
tmux socket, which would let it type into another agent's pane. Each
line is `visible()`d and shown behind a `name │` gutter, so a colleague's
output cannot pass for a message. Secret redaction (tokens, `Bearer`,
private-key blocks) is best-effort, not a boundary. A key body that is
indented or line-numbered, as a file read prints it, is not recognised
as one.

**Supervisor (#383).** `supervisor.mjs` on the host starts and stops
employees as panes in the company's own tmux session, to match
`staff.json`. It touches only panes of that session in a role's window,
and stops one by killing the pane and its pid's descendants, never pid 1
or itself. Only host processes write `staff.json`: hubd, for the
manager's `company hire` and `company fire`, and for the operator's
`claude-llc hire` and `fire` (#385), which arrive through the spool
`hub/_operator`: no cooldowns, and `--over-cap` may pass `maxAgents`. That
spool is safe because `hub/` is mounted read-only in every jail, so only a
host shell can write it. The supervisor also writes `staff.json`, to
forget a fired employee. So an agent reaches the supervisor only through
what hubd lets its role ask for. The reboot records and the lock sit in
the host bot root, which no jail sees.

**Files every jail can read in `hub/` (#891).** Besides the board copy and
`ratelimit.json`, hubd writes `board-history.jsonl` (one line per column
change: issue, from, to, who, when) and `kpis.json` (flow, usage, budget,
host and staff numbers, every five minutes). Nothing secret is in either:
employee names and numbers. `kpis.json` carries a `schemaVersion`; a reader
that finds another value treats the file as absent. `kpi-edges.json` (#1313)
holds the 7-day utilization's 1% steps of the last 24 h, times and
fractions only; hubd discards one of another `schemaVersion` on start.
`ci-history.jsonl` (#1612) keeps a line per completed Actions run, eight
days of them: run id, event, conclusion, sha, times, whether it ran on
main, the `#N` its title starts with, and the workflow's file name only if
it is a merge gate (else `"other"`). A fork's pull request names its own
title, branch and workflow files, so **no GitHub free text goes into a
file in `hub/`**: hubd keeps numbers, hashes and values checked against a
closed set, and the reader drops a line that fails that check.

**A manager is always running (#384).** The supervisor starts a missing
manager pane within one sample, backing off to once every five minutes
after three restarts in ten, and says so in General. A manager that
crashes on every turn, say from injected text it keeps re-reading, costs
at most that restart rate, not a stopped company. Only two things hold
it down: `claude-llc stop` on the host, through the `stopping` file, and
a pending reboot (`reboot.json`, then `rebooting.json`), which hubd
writes once the operator approves a `company reboot` and which ends in the whole company,
manager included, restarting by its deadline. Those files and
`manager-restarts.json` sit in the host bot root too, so an agent can
hold the manager down only for the length of a reboot it asked for, and
cannot reset the backoff.

Every finding here so far came from **reading a gate with a hostile
agent in mind**: #26, #39, #47, #57, #61, #67, #73. A change to any file in
`GATE_PATHS` gets that review, from `perf-sec-qa` and `lead-dev` both.
