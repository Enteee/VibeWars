---
name: flake-check
description: Repeat-run every new or changed test before it reaches main, so flaky tests are caught in review, not on main. Use when you write or change a test, when you review a PR that adds one, and before you merge.
---

# Flake check: run new tests ten times

A test that passes once can still fail one run in ten. On 2026-10-25 two
such tests were merged within an hour (`lobby.spec.ts` from #204,
`fuzz.test.ts` from #197). Each one turned main red, blocked unrelated
PRs, and cost a follow-up fix. A green CI run on the PR proves nothing
about a new test's stability.

## Who runs it

- **The author**, before pushing a PR that adds or changes a test.
- **qa-tester**, before merging any PR that adds or changes a test.

## How

Run only the new or changed tests, at least 10 times. Every run must pass.

```sh
# unit / fuzz (vitest)
pnpm vitest run <path/to/file.test.ts> --repeats 9      # 1 run + 9 repeats

# e2e (playwright)
pnpm playwright test <path/to/file.spec.ts> --repeat-each 10
```

`--repeats` re-runs the test body but not `beforeAll`/`afterAll`. If the
test leans on file-level setup (a server, a room, a port), run the whole
file ten times instead:

```sh
for i in $(seq 10); do pnpm vitest run <path/to/file.test.ts> || break; done
```

Add `-t '<name>'` (vitest) or `-g '<name>'` (playwright) to narrow it to
the tests the PR touches.

Say the result in the PR or on Telegram: `flake-check: lobby.spec.ts:179
10/10`.

## When one fails

It is a bug in the test or in the code, not bad luck. Do not merge, and
do not "fix" it with a retry or a longer timeout. Find what it waits on:
time, ordering, a shared room or port, randomness without a seed. Fix
that, then run it ten times again.

A red e2e on main or on someone else's PR: rerun it once. If it passes,
tell the author of the test that it flakes, with the run link.
