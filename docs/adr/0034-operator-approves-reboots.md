# ADR-0034: The operator approves every reboot

## Status

Accepted (2026-10-30). Issue #960, requested by the operator.

## Context

A reboot (`company reboot`) is how new company code reaches the company:
hubd records it, the supervisor drains every agent, and the restarter
builds GitHub's `main`, checks it out, locks it (ADR-0033) and starts the
company on it. The manager could start one alone, for a reason it chose,
and the restarter booted whatever `main` was at restart time, minutes
later. The operator wants every increment to need their approval, with
the why and what changed in front of them, enforced in code, not in a
briefing. And what they approve must be what boots.

The manager is an agent in a jail. Anything it can write, a
prompt-injected manager can forge: its inbox and outbox (below
`.bots/bus/<employee>`), its hub spool, and the answers `tg ask` delivers
there. So the approval cannot pass through any of them.

## Decision

`company reboot "<reason>"` and `company reboot --workday` only
**propose**. hubd runs the same checks as before (`rebootAllowed`), then
writes `.bots/reboot-proposal.json`: a fresh 128-bit random id, the boot
commit, the target commit (GitHub's `main` as hubd's mirror fetched it),
the company commits between them and their diffstat. It asks the sidecar
to post it in the Operator topic with two buttons, Approve and Reject.
Nothing drains.

The approval is valid only when all of these hold, and they are checked
host-side, by the sidecar:

- it is a `callback_query` from the operator's Telegram id (the group's
  creator, as for every operator message), in the company chat, on the
  proposal's own `message_id`;
- its `callback_data` is `r:<id>:approve`, with the open proposal's full
  id, which no jail can read, so no button can be forged for it, and a
  stale button cannot approve a newer proposal.

The sidecar then writes `.bots/link/reboot-decision.json`. hubd reads that
file, and only that file, deletes it, and checks once more that the
company still runs the proposal's boot commit and nothing is pending
(`decideProposal`). Only then does it write `reboot.json`, now carrying
`targetSha` and `proposalId`, and the drain starts as before.

The restarter boots `targetSha`, not `main`'s tip: it must be an ancestor
of (or equal to) GitHub's `main` and build, or the company comes back on
the locked commit and `boot.json` says why. Commits merged after the
approval wait for the next proposal.

A proposal never lapses. It is open until approved, rejected, or
withdrawn by `company reboot --abort`; a second proposal is refused while
one is open.

## Where, and what was rejected

`reboot.mjs` (the pure decisions and parsers), `protocol.mjs`
(`formatProposal`, `routeAnswer`), `link.mjs` (post, edit, decision file),
`hubd.mjs` (propose, withdraw, `decideProposals`), `restart.mjs` (boots
`targetSha`).

- **Approval through `tg ask`.** The answer lands in the asker's inbox,
  which the asker's jail can write. A forged "approved" line would be
  indistinguishable from the operator's.
- **A manager-typed sha.** The manager would choose what boots; the
  operator would approve a string they cannot check on a phone.
- **Booting `main`'s tip.** The approval would not bind the code: a merge
  between the tap and the restart would boot unreviewed by the operator.
- **A proposal that lapses.** The operator asked for none (Q102): a
  proposal made while they sleep waits for them.

## Consequences

- No reboot happens without the operator, including the workday one. A
  manager that proposes at the end of a workday may wait hours; the next
  `--workday` is refused while that proposal is open.
- `reboot.json` without `targetSha` or `proposalId` is malformed (ADR-0016):
  a reboot pending when this merged is lost, and the manager proposes again.
- `claude-llc reboot --abort` on the host and `company reboot --abort`
  during the drain work as before.
