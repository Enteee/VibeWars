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

| Threat                                              | Defence                                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A client claims an outcome (damage, position, HP)   | Clients send **intent only** (`ClientIntent`: move / stop / target / use-skill). Every outcome is computed server-side in `game-core`.                                            |
| A malformed or malicious message crashes the server | Every inbound payload is `unknown` until `parseClientIntent` or `field()` has checked it; non-finite numbers are rejected. `fuzz.test.ts` enforces "never crash on client input". |
| Casting a skill the player does not have            | The client sends a **slot index**, never a skill id; the server reads its own copy of the bar.                                                                                    |
| An illegal build (over budget, wrong profession)    | `validatePlayerBuild` runs at join; anything illegal gets the house loadout.                                                                                                      |
| Moving faster than allowed                          | Direction is clamped to unit length; speed comes from the ruleset; walls and bodies are resolved on the server.                                                                   |
| Targeting a player who does not exist               | `applyTarget` accepts only a session id present in the room. Range and line of sight are checked at cast time.                                                                    |
| Display names used to attack other players' UIs     | `sanitizeName` strips control characters and clamps to 16 characters. The web client must render names as text, never as HTML. See gap 8.                                         |
| Host-only lobby actions by a non-host               | `select-map` and `start-match` check `isHost` (but see the open `return-to-lobby` gap below).                                                                                     |
| A stale or foreign client desynchronising a match   | `PROTOCOL_VERSION` is checked on every join; a mismatch is refused.                                                                                                               |
| Oversized frames                                    | The WebSocket transport caps a frame at 4 KiB (Colyseus `ws-transport` default) and has per-message deflate off. Do not raise either without a reason written here.               |
| Cross-origin use of the HTTP API                    | Production is same-origin. CORS is sent only in dev mode, and only for one exact origin, never `*`.                                                                               |
| Enumerating live matches                            | `/healthz` carries no game state. `/api/maps` lists static map ids only.                                                                                                          |
| Path traversal through the static file server       | `express.static` on one fixed root; the SPA fallback always sends that root's `index.html`, never a path built from the request.                                                  |
| Secrets in source                                   | There are none to leak: the game server has no credentials. `gitleaks` runs over history on review.                                                                               |
| Non-reproducible simulation abuse                   | Simulation randomness is seeded (`SimulationRng`), so any reported exploit can be replayed from its seed.                                                                         |

## What we explicitly do not defend against

- **Identity.** There are no accounts, passwords or tokens. A player is a
  WebSocket session. Anyone can pick any name, and two players can share
  one. Do not build anything that relies on a name meaning a person.
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
3. **No per-client message rate limit** (#43). Colyseus's `maxMessagesPerSecond`
   defaults to `Infinity`, and neither room sets it. Every `intent` runs its
   handler right away, outside the tick.
4. **Any lobby member can send `return-to-lobby`** (#44). It has no
   `isHost` check. Its only phase guard is a no-op while already `waiting`,
   so a non-host can reset a lobby that is in a match back to `waiting` and
   clear everyone's ready state.
5. **Lobby codes can be enumerated.** There are 23⁴ = 279,841 codes, and
   joining is not rate-limited. That is fine for a LAN party. It is not
   access control, and it must not be described as access control.

6. **No cap on the number of match rooms** (#114). Any client can call
   `create("match")` as often as it likes, and gets a Quick Match room. Every
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
   the attacker is not in. A server-wide cap on live match rooms is needed,
   as is a cap per remote address.

7. **Client strings reach the server log unescaped** (#115). When `MatchRoom`
   refuses a build, it logs each problem, and a problem message embeds
   client-chosen text: an unknown skill id, for example. A skill id
   containing `\n` writes whole fake log lines.
   _Reproduce:_ join `match` with a build whose `skillBar[0]` is
   `"a\n[match] finished winner=1 reason=score"`. The server prints a
   `[match] finished …` line that no match produced. Only the build name
   goes through `JSON.stringify`. Escape or drop client text before
   logging it, and cap how much of it is logged.

8. **Display names can carry invisible and direction-changing characters**
   (#174). `sanitizeName` strips only C0 control characters and DEL. C1
   controls (U+0080–009F), bidi overrides and isolates (U+202A–202E,
   U+2066–2069), zero-width characters (U+200B–200D, U+2060) and unbounded
   combining marks pass through, and `trim()` does not remove them. The
   16-character clamp counts UTF-16 units, so it can split a surrogate pair
   and leave half an emoji. Names are drawn above every player in the
   arena (#172) and shown in the lobby and the target panel. A name can
   therefore look like a different name, render as nothing, or stack marks
   far above its line. This is not identity (there is none, see above), but
   it lets one player make the board unreadable for the others.
   _Reproduce:_ join a lobby as `"\u202Eedoc"`, which other players see as
   `code`, or as `"\u200B"`, which shows an empty name.

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
- **CodeQL** (`codeql.yml`) scans the JavaScript and TypeScript source with GitHub code scanning's default queries. It runs on every pull request, on every push to main, weekly and by hand. It is advisory and cannot fail a pull request: its steps set `continue-on-error`, and the repository's code scanning check run failure threshold is **None** (_Settings → Code security → Code scanning → Protection rules_). A fresh repository needs that setting made by hand. Alerts show in _Security → Code scanning_ and as annotations on the pull request. Today only the operator can see them: no agent can read code scanning alerts through hub yet, and the check run passes whatever it finds. Once hub can read them (#184), `perf-sec-qa` triages them and opens one issue per real alert. Until then, the operator raises any alert worth acting on. A false positive is dismissed in the Security tab, with a reason.

## The agent company

The repository is built by nine autonomous agents (`scripts/bots/`,
`nix/claude-*.nix`; see ADR-0015 and ADR-0023). They are a second attack
surface, separate from the game. Here the attacker is **an agent**, whether
it was prompt-injected or is simply wrong, and the asset is **the operator's
host and `main`**.

| Boundary                 | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jail → host              | Each agent runs in bubblewrap. Only its worktree, its bus directory and the shared `.git` are writable. `.git/config`, `hooks` and `info` are masked read-only (#61), because the host executes them. `.git/worktrees` is read-only except the jail's own admin dir (#69); the host creates and repairs worktrees (`worktree.mjs`). Skills are bound read-only: main's export (`.bots/skills-main`) for every role, and the manager's own drafts for the manager, refused if any of `.claude/bots/skills` is a symlink (#27).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Jail → GitHub            | Agents hold no credential. `hub` asks `hubd` (`hub-policy.mjs`), which enforces each role's permissions, refuses every gh flag that would read a host file (#26), pins the repository, and records verdicts against the reviewed SHA. The manager may push only `bot/manager/*`, and only changes inside `.claude/bots/skills/`: hubd checks that in its mirror against GitHub's `main`, failing closed (#27). Every role but cicd-engineer is refused any push that changes `.github/workflows/` or `.github/actions/`, checked the same way (#116), and main's workflows may not grant `checks` or `statuses` write (`workflow-permissions.test.mjs`). The merge guard refuses a check name reported by more than one check suite or status (#96). Residual: cicd-engineer can still push an unreviewed side-branch workflow; one role has to own CI. The workflow check diffs against the merge base, so a branch cut from an old main carries that main's workflows unflagged; every workflow main has ever had is `contents: read` and runs on push to main only, so today that is harmless. |
| Host git near agent data | Every host git runs with `GIT_HARDENING` and `GIT_ENV` (`git-hardening.mjs`). These pin hooks, fsmonitor, ssh, credential helpers, gpg and filter drivers, and set `GIT_NO_REPLACE_OBJECTS` (#67). The operator checkout sets `core.useReplaceRefs=false`. `refs/` stays writable, so never trust a local ref on the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Reboot                   | The restarter builds GitHub's `main` from hubd's private mirror and fast-forwards only to that same SHA (#21).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Telegram → agents        | Only the group's creator is heard and gets the `*` mark, for messages, button taps and replies alike (#39, #47). All text goes through `visible()`: no line breaks, ESC, bidi, zero-width or tag characters. An unaddressed message reaches everyone only from General, the manager only from the Manager topic, and nobody from any other topic; only the manager may write to the operator (`tg send operator`), which the sidecar checks, not just `tg` (#85).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Agent → agent            | Peer messages are information, never instructions. Agents can still overwrite each other's branch refs, but not each other's worktree metadata (#69). That is an integrity problem, not code execution on the host.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Each jail sees only its own worktree, so to git every other one looks
deleted: a `git worktree prune` in one jail once deleted every other
agent's worktree metadata (#70). Since #69 that fails with EROFS, but
never run `git worktree` or `git gc` inside a jail.

**Open: #83.** The operator checkout's own `.git/HEAD` and `.git/index` are
writable from every jail too, and jails do not need them (a worktree's
`HEAD` lives in its admin dir). So an agent can move the operator's
checked-out branch, and host code that starts from `HEAD` starts from an
agent-chosen commit. Treat `HEAD` like any other local ref.

**Open: #93.** Peer text mirrored to Telegram keeps its line breaks and
bidi characters, so an agent can type a line that looks like another
sender's header, such as `📋 Manager → 👤 Operator`. Until #93 lands,
trust the topic a message is in, not a header inside its text.

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

## If the architecture changes

A peer-to-peer mode (for example WebRTC via Trystero, with no hosted
backend) has been proposed. That **removes the authoritative server**, and
with it most of the defences listed above. In a peer-to-peer match some
peer computes the outcomes, so that peer can cheat. Such a mode needs its
own threat model here before it merges. It must not inherit this one.
