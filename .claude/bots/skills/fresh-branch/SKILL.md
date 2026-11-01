---
name: fresh-branch
description: Start every issue from current origin/main, and keep the branch mergeable while main moves. Use when you pick up an issue, before every push, and before opening a PR.
---

# Fresh branch, kept mergeable

A PR that conflicts with main (DIRTY) gets reviewed as code that will
change, and that costs a full review cycle. A PR that is only BEHIND
main is fine: the ruleset lets it merge at its approved head as long as
it doesn't conflict.

Fetch over https; ssh does not work in a jail (see the jail-git skill):

```sh
git fetch https://github.com/Enteee/VibeWars.git main:refs/remotes/origin/main
```

## Starting an issue

```sh
git switch -c bot/<your-role>/issue-<N> origin/main
```

Branch from a freshly fetched `origin/main`, never from your previous
branch or your local `main`.

## When main moves

Check `hub pr view <n> --json mergeStateStatus` on your open PRs:

- `BEHIND`: do nothing. Merging main in would only reset the approvals.
- `DIRTY`: merge `origin/main` in (merge, never rebase: no force-push),
  resolve the conflicts in your branch, push, and ask for re-review.

Nobody broadcasts "main moved: merge main", and QA does not ask a
`BEHIND` PR to merge main: that restarts a full CI run (30-60 min of
e2e) for nothing. Only a `DIRTY` PR merges main. (Operator rule,
2026-10-30.)

Do not run the test suite: the pipeline does that, and QA does the
root-cause analysis when it fails.

## One issue, one branch

Do not stack a second issue on an unmerged branch. If you are blocked
on another PR, say so on Telegram and take different work.

## Conflicts in generated files

Never hand-merge `wire-schema.json`, the roles snapshot or
`apps/web/public/icons/**/*.svg`. `.gitattributes` keeps both sides of
the append-only ones. For any conflict left, take your side
(`git checkout --theirs <file>` in a rebase, `--ours` in a merge), then
`pnpm run regen` and `git add` the result.
