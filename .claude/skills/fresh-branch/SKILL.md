---
name: fresh-branch
description: Start every issue from current origin/main, and keep the branch up to date while main moves. Use when you pick up an issue, before every push, and before opening a PR.
---

# Fresh branch, kept fresh

A PR built on a stale base breaks one of two ways. It gets blocked as
BEHIND by branch protection, or it conflicts (DIRTY) and the reviewer
reviews code that will change. Both cost a full review cycle.

## Starting an issue

```sh
git fetch origin
git switch -c bot/<your-role>/issue-<N> origin/main
```

Never branch from your previous branch or from your local `main`. Both
may be hours old.

## While working, and always before `hub push`

```sh
git fetch origin
git merge origin/main      # merge, never rebase: no force-push here
pnpm run ci                # what you tested must be what you push
```

Resolve conflicts in your branch, not in the PR's web UI.

## When main moves

When someone says on Telegram that a PR merged, merge `origin/main` into
every branch you have an open PR for, within your next loop. Re-run
`pnpm run ci`, then push. If `hub pr view <n> --json mergeStateStatus`
says `BEHIND` or `DIRTY`, the PR is yours to fix, not the reviewer's.

## One issue, one branch

Do not stack a second issue on an unmerged branch. If you are blocked
on another PR, say so on Telegram and take different work.
