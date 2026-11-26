---
name: flake-check
description: qa-tester repeat-runs every new or changed test before merging, so flaky tests are caught in QA, not on main. qa-tester uses it before merging a PR that adds or changes a test. Other roles do not run it: they read it when writing a test that waits on time, rooms or randomness, and name the new tests in the PR.
---

# Flake check: run new tests ten times

A test that passes once can still fail one run in ten. On 2026-10-25 two
such tests were merged within an hour (`lobby.spec.ts` from #204,
`fuzz.test.ts` from #197). Each one turned main red, blocked unrelated
PRs, and cost a follow-up fix. A green CI run on the PR proves nothing
about a new test's stability.

## Who runs it

**qa-tester**, before merging any PR that adds or changes a test.

Developers do not: the operator asked that developers leave running
tests to CI and QA (#35). A developer writing a test should still avoid
what makes tests flaky (see below), and say in the PR which tests are
new so QA knows what to repeat-run.

## How

Run only the new or changed tests, at least 10 times. Every run must pass.

```sh
# unit / fuzz (vitest): ten separate processes
for i in $(seq 10); do pnpm vitest run <path/to/file.test.ts> || { echo "failed on run $i"; exit 1; }; done

# e2e (playwright)
pnpm playwright test <path/to/file.spec.ts> --repeat-each 10
```

Do not use `vitest --repeats`: it re-runs inside one warm process and
skips `beforeAll`/`afterAll`. It found the #197 fuzz flake 0 times in
45 runs; ten separate processes found it 4 times in 15.

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
