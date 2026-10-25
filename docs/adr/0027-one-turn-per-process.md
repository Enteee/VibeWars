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
(print mode cannot ask) and `--disallowedTools AskUserQuestion` (nobody can
answer; questions go through `tg ask`). It exits when the agent ends its
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

Five failed runs in a row stop the loop, as before; a turn that ended resets
the count. Between turns the loop pauses 10 s, so an agent that ends turns
instead of running `tg wait` cannot spin, and the next turn's prompt sends
it back to `tg inbox` and `board ls`.

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

## Consequences

- Nobody can type into an agent's pane. That is intended: Telegram is the
  only input. Ctrl-C still works; it ends the current turn, and the next
  starts after the pause. A second Ctrl-C during the pause stops the agent.
- **Background work dies with the turn.** A `run_in_background` command or a
  pending task notification does not re-invoke an agent whose process has
  exited. The shared briefing and the resume prompt say so: block on the
  work, or on `tg wait`, rather than end the turn.
- Each turn costs a process start and a resume. A turn that waits in
  `tg wait` stays one process, so an idle company is not a busy one.
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
