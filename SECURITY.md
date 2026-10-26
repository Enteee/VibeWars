# Security

VibeWars is a browser PvP game with one **authoritative server**
(`apps/server`, Colyseus over a single HTTP/WebSocket port) that serves the
web client and runs every match. This file says what we defend against,
what we deliberately do not, how to report a problem, and which weaknesses
are known and still open.

It is kept by the `perf-sec-qa` role. A change that moves a trust boundary
— a new client message, a new HTTP route, a new thing written to disk,
anything peer-to-peer — updates this file in the same pull request.

## Reporting a vulnerability

Do **not** open a public issue for something exploitable. Use GitHub's
private reporting instead: _Security → Report a vulnerability_ on
<https://github.com/Enteee/VibeWars>. Include:

- the commit you tested against;
- the exact messages or requests that trigger it (a script is ideal);
- what happened, and what should have happened.

There is no released version yet, so there are no supported versions to
backport to: fixes land on `main` only. We aim to acknowledge a report
within a week. There is no bounty.

## Who and what we defend

The deployment we design for is a host running the container on a LAN, or
on an internet-facing machine for friends, with **no accounts**. Anyone who
can reach the port can play. Players' own data (characters, builds) lives
in their browser's IndexedDB and never reaches the server except as a join
option.

The attacker we design against is a **hostile client**: someone who skips
our web client and speaks the Colyseus protocol directly, sending whatever
bytes they like, as often as they like, from as many connections as they
like.

## What we defend against

| Threat                                              | Defence                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A client claims an outcome (damage, position, HP)   | Clients send **intent only** (`ClientIntent`: move / stop / target / use-skill / attack / cancel-attack). Every outcome is computed server-side in `game-core`.                                                                                                                                                                                                                                                                     |
| A malformed or malicious message crashes the server | Every inbound payload is `unknown` until `parseClientIntent` or `field()` has checked it; non-finite numbers are rejected. `fuzz.test.ts` enforces "never crash on client input".                                                                                                                                                                                                                                                   |
| Casting a skill the player does not have            | The client sends a **slot index**, never a skill id; the server reads its own copy of the bar.                                                                                                                                                                                                                                                                                                                                      |
| An illegal build (over budget, wrong profession)    | `validatePlayerBuild` runs at join; anything illegal gets the house loadout.                                                                                                                                                                                                                                                                                                                                                        |
| Moving faster than allowed                          | Direction is clamped to unit length; speed comes from the ruleset; walls and bodies are resolved on the server.                                                                                                                                                                                                                                                                                                                     |
| Targeting a player who does not exist               | `applyTarget` accepts only a session id present in the room. Range and line of sight are checked at cast time. A weapon attack is accepted only against a living enemy, and a ranged shot checks line of sight as it is released.                                                                                                                                                                                                   |
| Display names used to attack other players' UIs     | `sanitizeName` strips controls, format characters (bidi overrides, zero-width) and blank fillers, except a ZWJ or ZWNJ between two visible characters and the tags of a complete subdivision flag. It keeps at most 2 combining marks per letter, and clamps to 16 whole graphemes and 48 code points; a grapheme over 12 code points or 4 joiners collapses to its first. The web client must render names as text, never as HTML. |
| One client flooding messages                        | Each room handles 60 messages a second per client, with bursts of up to 300, and ignores the rest (gap 3). Colyseus drops a client past 1000 in a second.                                                                                                                                                                                                                                                                           |
| Attacking faster than the weapon allows             | The swing timer is the server's. A new `attack` starts it at 0 and a swing lands only after a full interval, so toggling `attack` and `cancel-attack` only slows the attacker.                                                                                                                                                                                                                                                      |
| Host-only lobby actions by a non-host               | `select-map` and `start-match` check `isHost`; the lobby leaves its match only when the match room says it is over.                                                                                                                                                                                                                                                                                                                 |
| A stale or foreign client desynchronising a match   | `PROTOCOL_VERSION` is checked on every join; a mismatch is refused.                                                                                                                                                                                                                                                                                                                                                                 |
| Oversized frames                                    | The WebSocket transport caps a frame at 4 KiB (Colyseus `ws-transport` default) and has per-message deflate off. Do not raise either without a reason written here.                                                                                                                                                                                                                                                                 |
| Cross-origin use of the HTTP API                    | Production is same-origin. CORS is sent only in dev mode, and only for one exact origin, never `*`.                                                                                                                                                                                                                                                                                                                                 |
| Enumerating live matches                            | `/healthz` carries no game state. `/api/maps` lists static map ids only.                                                                                                                                                                                                                                                                                                                                                            |
| Path traversal through the static file server       | `express.static` on one fixed root; the SPA fallback always sends that root's `index.html`, never a path built from the request.                                                                                                                                                                                                                                                                                                    |
| Secrets in source                                   | There are none to leak: the game server has no credentials. `gitleaks` runs over history on review.                                                                                                                                                                                                                                                                                                                                 |
| Non-reproducible simulation abuse                   | Simulation randomness is seeded (`SimulationRng`), so any reported exploit can be replayed from its seed.                                                                                                                                                                                                                                                                                                                           |

## What we explicitly do not defend against

- **Identity.** There are no accounts, passwords or tokens. A player is a
  WebSocket session. Anyone can pick any name, and two players can share
  one. Do not build anything that relies on a name meaning a person.
- **Look-alike names.** A name may use letters from any script, so a
  Cyrillic "а" can pass for a Latin "a". There is no confusable detection.
  A ZWJ or ZWNJ between two letters is kept, because Persian and Indic
  scripts need it, so an invisible joiner can make two names look the same.
- **Network-level attackers.** The server speaks plain HTTP/WS. Anyone on
  the path can read and alter traffic. If you expose a server to the
  internet, put it behind a TLS-terminating reverse proxy. `HOST` defaults
  to `0.0.0.0` on purpose (LAN party); override it on an untrusted network.
- **Volumetric DoS.** One process, no clustering, no IP-level throttling.
  Filtering floods is the job of whatever sits in front of the container.
  _Cheap application-level_ abuse (one client making the tick slow) is in
  scope and must be defended in the server. See the open gaps below.
- **Cheating that needs only what the client is shown.** Every client gets
  the full match state, including enemy positions, health and casts. An
  aimbot-style helper that reads that state is not prevented. There is no
  fog of war, so there is nothing hidden to leak. If hidden information is
  ever added, it must be filtered on the server per client
  (`@view`/`StateView`), never hidden in the renderer.
- **A hostile server operator.** Whoever runs the server sees and controls
  everything. Players trust the host they connect to.
- **Players' browser storage.** IndexedDB is the player's own data on the
  player's own machine. A record in the wrong shape is discarded (ADR-0016).
  We do not try to protect it from the player.

## Known open gaps

Gaps 1–5 were found by reviewing `main` at `47a403f`, 6–7 at `1cfd5b5` (both
2026-10-24), and 8 at `76388c3` (2026-10-25). Each one is in scope by the
rules above and needs a fix. When one is fixed, cut it down to one line
saying so in the same PR. Keep the numbers: issues cite them.

1. **Fixed by #156:** a lobby's match was open to strangers (#41).
2. **Fixed by #156:** there was no cap on players per match (#42).
3. **Fixed by #43:** there was no per-client message rate limit. Each client
   now has 60 messages a second handled, with bursts of up to 300, and the
   rest are ignored. Colyseus drops a client that sends over 1000 in a second.
4. **Fixed by #44:** any lobby member could send `return-to-lobby`.
5. **Lobby codes can be enumerated.** There are 23⁴ = 279,841 codes, and
   joining is not rate-limited. That is fine for a LAN party. It is not
   access control, and it must not be described as access control.

6. **Mitigated by #114 and #265: there was no cap on rooms or players.** Any client could call
   `create("match")` as often as it liked, and got a Quick Match room. Every
   room runs its own 20 Hz fixed-timestep simulation, even with a single
   player in it. So the cap of 8 players per Quick Match room does not bound
   the work: the attacker just opens more rooms. Each lobby match is a room
   of its own too (#156), but only `LobbyRoom` can open one, so lobbies are
   the same problem one step removed. Measured at `1cfd5b5`: the server
   ran as its own process, and one client process opened rooms and sent a
   move every 100 ms per socket, all on one host:

   | rooms × players | server CPU | event-loop p99 | event-loop max |
   | --------------- | ---------- | -------------- | -------------- |
   | 1 × 500         | ~50 %      | 33 ms          | 61 ms          |
   | 1000 × 1        | ~82 %      | 35–58 ms       | 68 ms          |
   | 1500 × 1        | ~90 %      | 87–124 ms      | 161 ms         |

   Event-loop delay is how late every room's tick fires. Above about 50 ms
   the tick budget is gone for everyone on the server, including matches
   the attacker is not in. Since #43 each of those sockets may also send up
   to 1000 messages a second before it is dropped. Measured at `71bff02`, one
   such client costs about 1.5 % of a core with small messages and 6–8 % with
   ones near the 4 KiB frame cap, so about 13 of them fill a core.
   Four caps now hold, and matches already running never notice any of
   them. A player coming back after a drop is never refused: their seat
   was already counted.
   - **Rooms (#114):** at most `VIBEWARS_MAX_ROOMS` rooms, match and lobby
     together (default 200). Past that, a create is refused with 503 and
     "The server is full".
   - **Players (#265):** at most `VIBEWARS_MAX_CLIENTS` seats, match and
     lobby together (default 800; a lobby player in their match holds
     two). #259 measured 1 600 players at p99 30–43 ms against the 50 ms
     tick budget, and 16-player lobby matches cost about twice that.
     Refused with `CLIENT_LIMIT` and "The server is full".
   - **Seats per address (#265):** at most `VIBEWARS_MAX_CLIENTS_PER_ADDRESS`
     (default 32: one address can fill a whole lobby and its match, as a
     LAN party behind an address-rewriting port forwarder must). Refused on
     the socket with `ADDRESS_LIMIT` (4429) and "Too many connections
     from your network".
   - **Matchmaking requests per address (#265):** a bucket of
     `VIBEWARS_MATCHMAKING_BURST` (default 10), refilling one a second,
     checked before Colyseus reads the request. A request creates a room
     and reserves a seat whether or not a socket ever connects, so without
     it one address could keep the room budget full of empty rooms for
     the seat reservation timeout. Refused with HTTP `RATE_LIMIT` (429)
     and "Too many requests from your network. Try again in a moment."

   **The address is the socket's, never a header.** Colyseus 0.18 takes
   `context.ip` from `X-Real-IP`, `X-Forwarded-For` or `X-Client-IP`
   before the socket's peer address, unchecked. We run behind no proxy
   (ADR-0009), so the client writes those: believed, they would let it
   dodge the per-address caps with a new address each time, or fill a
   victim's share by naming the victim. `createGameServer` runs its own
   `http.Server` (`apps/server/src/http-gate.ts`), which deletes the three
   headers from every request and upgrade before any listener sees them.
   Running behind a reverse proxy would need its own trusted-proxy setting.

   **An IPv6 peer off the server's links counts per /64 (#271).** A host
   on the internet usually holds a whole /64, so rotating through it gets
   no fresh share: every off-link address in one /64 shares one share of
   both caps. A peer on a link the server is on (inside the prefix of one
   of the server's own IPv6 addresses, link-local `fe80::/10`, or `::1`)
   still counts per address, because an IPv6 LAN party all sits in the
   server's /64. IPv4, also as `::ffff:a.b.c.d`, counts per address. The
   server reads its links once, at start: a LAN renumbered while it runs
   looks off-link, and its guests share one /64 share until it restarts.

   **Still open:** an attacker with many /64s, or many IPv4 addresses,
   still gets a share for each, and only the server-wide caps hold. They
   keep the server's tick budget, but not its seats for everyone else.

7. **Fixed by #115:** client strings reached the server log unescaped. A
   skill id of `"a\n[match] finished winner=1 reason=score"` printed a
   `[match] finished …` line that no match produced. Every client value in
   a room's log line now goes through `quote()` (`apps/server/src/log-safe.ts`),
   which escapes newlines, control characters and the Unicode line
   separators. `log-safe.test.ts` checks that every interpolation in those
   lines is either quoted or a value the server made. How much client text
   a line carries is still not capped.

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

What does not hold, and why it is acceptable:

- **A pattern can navigate its own frame.** The new page keeps the same
  `contentWindow`, so it passes the game's source check and can speak the
  protocol. It is still sandboxed and opaque, and everything it says is
  parsed. Review rule: render text the host sends, such as a track id or
  an error, with `textContent`, never as HTML.
- **Any site can frame the host** in its own sandbox and drive it, because
  static files carry `Access-Control-Allow-Origin: *`. There it is just a
  copy of Strudel with an opaque origin that reaches nothing of ours.
- **The vite dev server answers `Origin: null`**, which any site's
  sandboxed frame sends, so `server.fs.allow` limits it to `apps/web`,
  `packages` and `node_modules`. Never widen it to the repo root: `.bots/`
  holds the company's logs.

Review rule: a pattern from anywhere, including a beat editor, a shared
link or a lobby message, reaches Strudel only through the music host, never
the game page.

## The static deploy

`.github/workflows/pages.yml` publishes the client alone to GitHub Pages:
`/next/` follows `main`, the root follows the latest release (#103). There
is no server behind it, so online play is off there.

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
  them. Saves are builds and a display name, so we accept this. Nothing
  secret may ever be stored in the browser on Pages.
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

| Package          | Advisory                             | Reached via                                       | Status                                                                          |
| ---------------- | ------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `uuid` 8.3.2     | GHSA-w5hq-g745-h8pq / CVE-2026-41907 | `colyseus` → `@colyseus/auth` → `grant` → request | Not reachable: we never mount `@colyseus/auth`. Remove it once Colyseus allows. |
| `elliptic` 6.6.1 | GHSA-848j-6mx2-7j84 / CVE-2025-14505 | `colyseus` → `@colyseus/auth` → `jwk-to-pem`      | Not reachable, same reason. No fixed version exists upstream.                   |

"Not reachable" is a claim about our code today. If anyone ever wires up
`@colyseus/auth`, both of these become live and must be fixed first.

Three checks in CI (#133, #175):

- **`dependency review`** runs on every pull request, and the merge guard requires it. It fails the pull request if the change adds or bumps a dependency that has a high or critical advisory. It looks only at what the pull request changes.
- **`pnpm audit`** (`audit.yml`) covers advisories against code already on main: new ones published later, and ones in dependencies no pull request touches. It runs on every push to main, daily, and by hand, at `--audit-level high`, with dev dependencies included. It is not a pull request check, because one new advisory would otherwise block every pull request. When it goes red, `perf-sec-qa` opens one issue per advisory. The issue resolves it in one of three ways: a bump, an override, or an accept recorded in the table above and in `pnpm.auditConfig.ignoreCves`, linking that issue. Blanket ignores are not allowed.
- **CodeQL** (`codeql.yml`) scans the JavaScript and TypeScript source with GitHub code scanning's default queries. It runs on every pull request, on every push to main, weekly and by hand. It is advisory and cannot fail a pull request: its steps set `continue-on-error`, and the repository's code scanning check run failure threshold is **None** (_Settings → Code security → Code scanning → Protection rules_). A fresh repository needs that setting made by hand. Alerts show in _Security → Code scanning_ and as annotations on the pull request. The check run passes whatever it finds. The company's nine roles can read the alerts with `hub alerts [--pr N]` (#184; a role added later gets no access until `ALERT_READERS` in `hub-policy.mjs` names it). `perf-sec-qa` triages them, and the manager opens one issue per real alert. A false positive is dismissed in the Security tab, with a reason.

## The agent company

The repository is built by nine autonomous agents (`scripts/bots/`,
`nix/claude-*.nix`; see ADR-0015 and ADR-0023). They are a second attack
surface, separate from the game. Here the attacker is **an agent**, whether
it was prompt-injected or is simply wrong, and the asset is **the operator's
host and `main`**.

| Boundary                 | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Jail → host              | Each agent runs in bubblewrap. Only its worktree, its bus directory and the shared `.git` are writable. `.git` is read-only except `objects`, `refs`, `logs/refs` and the jail's own admin dir under `worktrees` (#61, #69, #83); the host creates and repairs worktrees (`worktree.mjs`). Skills are bound read-only: main's export (`.bots/skills-main`) for every role, and the manager's own drafts for the manager, refused if any of `.claude/bots/skills` is a symlink (#27). Host processes that write below a jail's bus or hub directory (hubd, the Telegram sidecar, the agent loop) go through `scripts/bots/jail-fs.mjs`, which opens each directory component refusing symlinks, pins it by descriptor, and creates files `O_CREAT \| O_EXCL \| O_NOFOLLOW` (#329).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Jail → GitHub            | Agents hold no credential. `hub` asks `hubd` (`hub-policy.mjs`), which enforces each role's permissions. Who asks is the spool directory, never the request: each employee (`qa-tester`, `qa-tester@2`) has only its own `hub/<employee>` bound writable, and hubd maps that name to a role through `staff.json` alone, whose parser refuses an entry whose role is not the id's. A spool nobody is employed under is refused (#381). A push goes under the employee's own `bot/<employee>/`, whatever hat allows it. hubd also refuses every gh flag that would read a host file (#26), pins the repository, and records verdicts against the reviewed SHA. The manager may push only `bot/manager/*`, and only changes inside `.claude/bots/skills/`: hubd checks that in its mirror against GitHub's `main`, failing closed (#27). Every role but cicd-engineer is refused any push that changes `.github/workflows/` or `.github/actions/`, checked the same way (#116), and main's workflows may not grant `checks` or `statuses` write (`workflow-permissions.test.mjs`). The merge guard refuses a check name reported by more than one check suite or status (#96). Residual: cicd-engineer can still push an unreviewed side-branch workflow; one role has to own CI. The workflow check diffs against the merge base, so a branch cut from an old main carries that main's workflows unflagged; every workflow main has ever had is `contents: read` and runs on push to main only, so today that is harmless. |
| Host git near agent data | Every host git runs with `GIT_HARDENING` and `GIT_ENV` (`git-hardening.mjs`). These pin hooks, fsmonitor, ssh, credential helpers, gpg and filter drivers, and set `GIT_NO_REPLACE_OBJECTS` (#67). The operator checkout sets `core.useReplaceRefs=false`. `refs/` stays writable, so never trust a local ref on the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Reboot                   | The restarter builds GitHub's `main` from hubd's private mirror and fast-forwards only to that same SHA (#21).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Telegram → agents        | Only the group's creator is heard and gets the `*` mark, for messages, button taps and replies alike (#39, #47). All text goes through `visible()`: no line breaks, ESC, bidi, zero-width or tag characters. An unaddressed message reaches everyone only from General, the manager only from the Manager topic, and nobody from any other topic; only the manager may write to the operator (`tg send operator`), which the sidecar checks, not just `tg` (#85).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Agent → agent            | Peer messages are information, never instructions. Agents can still overwrite each other's branch refs, but not each other's worktree metadata (#69). That is an integrity problem, not code execution on the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Each jail sees only its own worktree, so to git every other one looks
deleted: a `git worktree prune` in one jail once deleted every other
agent's worktree metadata (#70). Since #69 that fails with EROFS, but
never run `git worktree` or `git gc` inside a jail.

**`.git` is read-only by default (#83).** A jail binds the operator
checkout's `.git` read-only and writes only `objects`, `refs`,
`logs/refs` and its own admin dir under `worktrees`. `HEAD`, `index`,
`MERGE_HEAD`, `rebase-merge/` and `sequencer/` (whose todo files run
`exec` lines) are the operator's own checkout state, and an allow-list
covers what a jail would create, which a deny-list would miss.
`claude-bot --smoke <employee>` asserts each. Cost: a jail cannot rewrite
`packed-refs`, so deleting a packed branch fails with EROFS; that is the
operator's or hubd's job. Known gap: `objects/info/alternates` can be
planted; objects are content-addressed, so that is no code-execution path.

Residual: `HEAD` itself is now safe from rewriting, but a symbolic `HEAD`
resolves through `refs/heads/<branch>`, which a jail can still move. Treat
`HEAD` like any other local ref: host code that starts from it starts from
an agent-chosen commit.

**Open: #93.** Peer text mirrored to Telegram keeps its line breaks and
bidi characters, so an agent can type a line that looks like another
sender's header, such as `📋 Manager → 👤 Operator`. Until #93 lands,
trust the topic a message is in, not a header inside its text.

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

**Open: forged CI checks.** A workflow pushed on a side branch runs with
`GITHUB_TOKEN` and can post a check run, or a commit status, for any
commit in the repository, under any name. Since #116, hubd refuses a
workflow or action change from every role but cicd-engineer, so this is
now one role's power, not every implementer's. The merge guard reads checks by name. Since #108, it keeps every check
suite and every status as a separate source and refuses a name that more
than one source reports. Two cases still pass:

- a forged check is the only one with its name, because CI has not created
  its own run yet;
- a forged run lands in the real run's own check suite and is newer. This
  depends on GitHub behaviour we have not verified.

The fix is to read the conclusions from the jobs of the `ci.yml`
`pull_request` workflow run for that commit, never from check runs or
statuses. Jobs exist only because a workflow executed, so the API cannot
create them. That run still uses the PR head's own `ci.yml`, so reviewing
gate files stays load-bearing either way.

**By design.** The manager may close and reopen any pull request or
issue (#84), gate PRs included, but never with `--delete-branch`. A
misbehaving manager can stall the pipeline this way; it cannot destroy
work or merge anything.

Every finding here so far came from **reading a gate with a hostile
agent in mind**: #26, #39, #47, #57, #61, #67, #73. A change to any file in
`GATE_PATHS` gets that review, from `perf-sec-qa` and `lead-dev` both.

## Peer-to-peer play (#15)

Peer-to-peer play is being built to replace the server (#15, ADR-0022).
It **removes the authoritative server**, and with it most of the defences
above. It does not inherit this file's threat model; this section is its
own. Until step 5 (#404) deletes `apps/server`, both modes exist and both
sections hold.

### Who computes what

One player's browser, the **host**, runs the simulation in a `MatchHost`
and sends snapshots. Every other browser is a **peer**: it sends intents
and draws what the host says. Peers find each other through Trystero over
public Nostr relays, then talk over WebRTC data channels, with public STUN
and no TURN. The lobby code is both the Trystero room and its password.

### What we explicitly do not defend against

- **A cheating host.** The host decides every outcome: damage, hits,
  deaths, energy, cooldowns, the score and who won. It sees every intent
  before it acts on it, can drop, delay or forge any message it relays,
  can kick anyone, and controls the match clock. Nothing a peer runs can
  tell a fair host from a cheating one. P2P is for playing with people you
  would let host; there is no ranked play, and none is planned without a
  server.
- **Knowing the code means being invited.** Anyone with the lobby code
  can join and see the lobby. A code is shared like a party invite; it is
  not a credential.
- **A dropped match.** Without TURN, some pairs of networks never connect
  (ADR-0022). A peer that cannot reach the host cannot play.

### What a peer learns about the others

- **IP addresses.** WebRTC exchanges ICE candidates, so every peer in a
  room learns the public IP address of every peer it connects to, and on
  some browsers a LAN address too. Browsers hide LAN addresses behind
  mDNS names by default, but the public address is always visible.
- **The relays see who meets whom.** Each Nostr relay sees the IP address
  of every browser in a room and a hash of the room, though not the
  encrypted offers. The relays are third parties we do not run; the list
  lives in `apps/web/src/net/transport/relays.ts` (#392).
- **Everything in a snapshot.** A peer receives every snapshot field the
  host sends, for every player. Anything that must stay hidden from a
  player must not be in the snapshot at all, as it already must not be on
  the server.

### What we still defend against

A hostile **peer** gets the same treatment as a hostile client of the
server, now enforced by the host:

- Every message is `unknown` until a `parse*` in
  `game-protocol/src/p2p.ts` accepts it. Each parser caps string lengths
  and array sizes, never throws, and returns a fresh object. Peers parse
  the host's messages too: a host is trusted for outcomes, not for
  well-formed bytes.
- A sender is the `from` the `Transport` reports, which comes from the
  connection, never from a field in the payload. A message names no other
  player whose state it changes.
- A returning player proves who they were with their rejoin token, never
  with their peer id: `selfId` lasts one page load. The token crosses
  the wire once, in the host's `welcome`, and never back (#593). A
  rejoin is a challenge: the guest names its seat, the host sends a fresh
  128-bit nonce, and the guest answers with an HMAC-SHA-256 keyed by the
  token over the nonce, the seat and the guest's own peer id
  (`game-session/src/rejoin-proof.ts`). The host checks it against the
  `from` the proof arrives on. A nonce is good for one proof, and a new
  hello from the same peer kills the old one.
- A peer id is not a credential either way. Trystero's peer id is a
  string the peer itself puts in its signalling, so a modified client can
  announce any id. When the host's peer drops mid-match (#515), a guest
  answers a challenge from whichever peer comes back as the host's id.
  An invited peer that announces itself under that id in the window can
  feed the guest its own snapshots, but learns only a nonce and a proof
  bound to the guest's peer id, which the real host refuses from anyone
  else, so it cannot take the guest's seat. What remains is a live relay:
  a peer that poses as the host's id to the guest and as the guest's id
  to the real host, both at once, while both are up. That needs two
  spoofed ids, the lobby code and a real drop, and we accept it.
  Authenticating the host to its guests is out of scope.
- `MatchHost` (#375) parses every intent with `parseClientIntent`, the
  server's own parser, and counts the server's per-client message budget
  (gap 3) per peer. The budget covers every channel, `hello` and `bye`
  included, and only a peer leaving the room resets it, so a peer cannot
  refill it by quitting and saying hello again. A peer that said `bye` is
  not seated again until it leaves the room.
- `LobbyHost` (#379) acts on nothing a peer sends before its `lobby-join`,
  charges `lobby-join` and `lobby-cmd` to the same per-peer budget, and
  lets only its own player pick the map and start. A command names no
  player: it changes its sender. A lobby's match seats only the peers the
  lobby put on a team, with the lobby's team and name; any other `hello`
  is refused `match-full`.
- `joinLobby` takes as host the peer that sends the first `lobby-state`
  for its code that names that peer as host and lists the player, then
  drops every lobby and match message from anyone else. Before that
  first state, a peer in the room can answer faster than the host and
  pose as it. That peer had to know the code, so it is someone invited
  (see above), and the lobby it fakes holds nothing but names. In the
  same window it can also fail the join with a `lobby-note` refusal.
- `hello.build` is capped in values and depth by `parsePeerHello`, then
  goes through the same `resolveJoinLoadout` and `validatePlayerBuild`
  join check as the server: an illegal build gets the house loadout.
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

What a later step must add before P2P play can merge:

- **In the web client (#403):** `MatchClient` drops every
  message that does not come from `hostId`, since any peer can send to any
  other directly. The app must take `hostId` from the lobby it joined,
  never from a message a peer can send. The main menu says, under the
  host and join buttons, that the others will see your IP address.
- **Host bandwidth.** An 8-player snapshot measured 4.6 KB in #375, about
  5 Mbit/s of host upload at the tick rate, against the 1–2 KB that
  ADR-0022 assumed. This is a limit on who can host, not an exploit, but
  it belongs in the host's "can I host?" check.
