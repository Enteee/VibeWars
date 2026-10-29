---
name: docs-current
description: Before merging a change, qa-tester checks that the documentation is still true and relevant after it. Use when you are about to merge a PR, and when you write one that changes behaviour.
---

# QA checks the docs after the change

Operator rule: a change is not done if the documentation now lies.

## qa-tester, before every merge

Read the diff and ask what a reader of the docs would now get wrong. Check, at least:

- `README.md`, `CONTRIBUTING.md` (commands, setup, workflow) and `ARCHITECTURE.md` (package boundaries);
- `docs/` and the ADRs the change touches (an ADR that the change contradicts needs a new ADR, not a silent edit);
- `SECURITY.md` when intents, limits or trust boundaries move;
- in-game text, help and skill descriptions the change makes untrue;
- `docs/player/`, the in-game Help: a PR that changes what a player sees or does updates the matching page, or says in its description why none applies. Send it back when it does neither;
- `CLAUDE.md` and the briefings when agent behaviour changes.

If something is stale or now irrelevant, ask the author to fix it in the same PR. Do not merge until it is. You cannot push to the author's branch: ask them, or open a follow-up docs PR from `bot/qa-tester/*`.

Say in your merge note that you checked, and what you looked at.

## Authors

Update the docs your change makes untrue in the same PR. Do not leave it to QA to find.

A change a player can see or do updates its `docs/player/` page in plain player words (see `CONTRIBUTING.md`, Documentation). If no page applies, say why in the PR description.
