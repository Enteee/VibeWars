# ADR-0027: Agents run one turn per process

## Status

Accepted (2026-10-25). Amends [ADR-0014](0014-agent-coordination.md), whose
"interactive, not a daemon" this replaces, and settles the headless option
it left open. Issue #146.

## Context

Every agent ran the interactive Claude TUI. When an agent ended its turn,
it sat at its `❯` prompt waiting for input nobody would send. The
supervisor made up for that by screen-scraping: it counted a pane as idle
when the pane was unchanged across samples, had no "esc to interrupt"
footer and showed a prompt, and then typed a nudge into it. Its own header
called this the least elegant part of the company. It failed silently once,
for as long as it looked for `>` where Claude Code draws `❯`: interrupted
agents sat idle and nothing said so. A reboot drain read "idle" off the same
scraped panes.

The reason given for the TUI was that the operator types feature requests
into the manager's pane. Since #85 the operator talks to the manager in the
Manager Telegram topic, so nothing needs a typeable pane.

## Decision

**One turn is one `claude -p` process.** `claude-bot` runs `claude -p
--output-format stream-json --verbose`, with `--dangerously-skip-permissions`
(print mode cannot ask) and `--tools` with a fixed list that omits `AskUserQuestion` (nobody can
answer; questions go through `tg ask`; #753). It exits when the agent ends its
turn, which is exactly the moment the TUI used to sit idle.

**`claude-llc-agent` loops over turns.** Each turn runs through
`scripts/bots/agent-turn.mjs`, which:

- resumes the role's conversation with `--resume <id>`, the id taken from
  the run's `system`/`init` event and kept in `.bots/agents/<role>/session-id`,
  a directory no jail can see. Not `--continue`, which takes the most recent
  conversation in a directory and so depends on what else ran there;
- prints the stream as one line per tool call and result, plus the agent's
  text (`scripts/bots/stream-format.mjs`). Unknown events are skipped and
  non-JSON lines shown cut to one line, never thrown on;
- exits 0 when the turn ended and 1 when the run failed. A run failed if it
  exited non-zero or emitted no `result` event. A short turn is not a crash.
  It exits 3 when the stream says Claude's usage limit is reached (#308),
  whatever else the run did.

Five failed runs in a row stop the loop, as before, and the company is told
through the system outbox; a turn that ended resets the count.

**A usage limit is not a failure** (#308). When the whole company hit it,
every role used up its five tries in a minute and stopped for good. A
limited run now neither counts toward the five nor resets them. The loop
waits until the reported reset plus a minute (at most 6 h), or retries at
5 min doubling to 30 min when the reset is unknown, and no message wakes it
early. One role, whichever creates `.bots/usage-limit.json` first, tells
the company the limit is reached; whichever deletes it after a turn that
ended says it is over.

**The pause between turns backs off** (`scripts/bots/agent-loop.mjs`). It
is at least 10 s, so an agent that ends turns instead of running `tg wait`
cannot spin, and it doubles while turns stay under a minute, up to 5 min. A
long turn resets it; a failed run doubles it too, so a short outage cannot
use up the five tries in under a minute. After the first 10 s, a message in the
role's inbox that `tg` has not read ends the pause early. Agents do end
turns while idle, whatever the briefing says (QA counted about ten an hour),
and each resume re-reads the whole conversation, so a fixed 10 s would have
idle agents outspend working ones. The next turn's prompt sends the agent
back to `tg inbox` and `board ls`.

**A session id must be a UUID**, and only a run's first `init` counts: a
jailed process can write to claude's stdout and forge one, and the id is an
argument on the next turn.

**A session that cannot be resumed is dropped.** A resumed run that fails
before its `init` event (a deleted transcript, a new claude version) deletes
`session-id`, and the next turn starts a new conversation with the kickoff
prompt. That run still counts toward the five.

**"Idle" is a file, not a screen.** The loop holds
`.bots/agents/<role>/between-turns` exactly while it is not running a turn.
The supervisor's reboot drain counts a role ready when it ran `company
ready` or has that marker, and while `reboot.json` exists the loop starts no
new turn. A reboot deletes `.bots/agents/`, so every agent comes back on a
fresh conversation. The supervisor no longer samples panes or nudges anyone.

hubd's schedule (`scripts/bots/schedule.json`, ADR-0015) is not pane nudging: it sends a fixed message on a clock, through the inbox, and samples no pane.

## Consequences

- Nobody can type into an agent's pane. That is intended: Telegram is the
  only input. Ctrl-C still works; it ends the current turn, and the next
  starts after the pause. A second Ctrl-C during the pause stops the agent.
- **Background work dies with the turn.** A `run_in_background` command or a
  pending task notification does not re-invoke an agent whose process has
  exited. The shared briefing and the resume prompt say so: block on the
  work, or on `tg wait`, rather than end the turn.
- Each turn costs a process start and a resume. A turn that waits in
  `tg wait` stays one process, and an agent that ends idle turns anyway
  backs off to one resume every 5 min unless someone writes to it. A board
  change does not wake it; the 5 min cap bounds how late it sees one.
- **Waits stay under Bash's timeout.** A `tg wait` that outlives it is moved
  to the background, the turn ends, and the messages it already marked read
  are lost. Bash's default is 120 s, its maximum 600 s: agents run
  `tg wait --timeout 540` with the Bash tool's `timeout` set to 600000. `tg`
  waits 110 s without `--timeout` and caps it at 540.
- `claude-bot <role>` run by hand prints raw stream-json. Pipe it through
  `agent-turn.mjs`, or use `claude-llc-agent`.

## Alternatives Considered

- **Keep scraping, fix the pattern.** It had already failed once on a
  one-character change in Claude Code's UI, and each fix is another guess
  about a screen we do not control.
- **One long-lived process fed through `--input-format stream-json`.** Avoids
  the resume per turn, but needs a driver to decide when to feed it, which
  is the nudge again with a different transport.
- **A Stop hook that blocks the end of a turn.** Keeps the TUI and so keeps
  the pane typeable, which is the thing being dropped.
