---
name: ci-is-truth
description: CI is the source of truth for green; developers do not run the test suite, QA does root-cause analysis on failures. Use before you run any test command, when you think a change is done, and when CI goes red on your PR.
---

# CI decides what is green

Operator policy (#35): running the suite locally duplicates CI, burns
context, and gives "it passed on my machine" comfort. A change is done
when the PR's required checks are green, never because a local run was.

## Developers and asset-designer

- Do not run `pnpm run ci`, `ci:full` or `test:e2e`. Push, open the PR, let CI run.
- The jail enforces it (#737): a PreToolUse hook refuses these, an unfiltered vitest and any Playwright run, for every role but qa-tester (selected specs only) and cicd-engineer.
- Still write the tests your change needs. Writing them is your job; executing them is the pipeline's.
- Do run the thing (`pnpm dev`) and the cheap static checks: `pnpm run typecheck`, `lint`, `format`.
- Allowed, not required: the one vitest file you are editing (`pnpm vitest run <file>`).
- Push, then `hub watch ci <pr>` and carry on: the result arrives in your inbox (#736), failing e2e specs named. Never poll.
- `board move <n> "In Review"` is refused until CI on the PR that `Closes #<n>` is green.

## When CI goes red

- Clearly your own change (a lint error on a line you touched, your new test failing): fix it, push.
- Anything else (flaky, environment, unrelated test, e2e, unclear): hand it to qa-tester. Do not guess-fix and re-push.

## qa-tester

Own the root cause of CI failures, and of a red `main` first. Reproduce with selected tests only (the failing file or spec). Post an RCA comment on the PR: what failed, why, which commit, flaky or real. Then hand back to the author, or file a bug if the PR is not at fault.

## Reviewers

Review once CI is green and read its results. Do not re-run the suite.
