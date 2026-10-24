---
name: fresh-branch
description: Start every issue from current origin/main, and keep the branch free of conflicts with main. Use when you pick up an issue, before every push, and before opening a PR.
---

# Fresh branch, kept fresh

A PR does not have to be up to date with `main` to merge; branch
protection only requires green CI and no conflicts. Being `BEHIND` is
fine. Being `DIRTY` (conflicted) is not: it cannot merge, and the
reviewer reviews code that will change. That costs a full review cycle.

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

Do not merge `origin/main` just because it moved. When someone says on
Telegram that a PR merged, check `hub pr view <n> --json mergeStateStatus`
for each of your open PRs. If it says `DIRTY`, merge `origin/main`,
resolve the conflicts, re-run `pnpm run ci` and push; that PR is yours to
fix, not the reviewer's. `BEHIND` needs nothing.

## One issue, one branch

Do not stack a second issue on an unmerged branch. If you are blocked
on another PR, say so on Telegram and take different work.
