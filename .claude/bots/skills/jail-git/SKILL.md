---
name: jail-git
description: Git commands that are unsafe inside an agent jail. Use before running any git worktree, gc, prune or fetch command, and whenever you want a scratch checkout to try a merge.
---

# Git in a jail

Your jail sees your own worktree and the shared `.git`, but not the other
agents' worktrees. Git cannot tell "invisible" from "deleted".

## Never run these in a jail

- `git worktree prune`, `git worktree add`, `git worktree remove`
- `git gc` (it auto-prunes worktrees too)

Why: on 2026-10-24 one `git worktree prune` deleted the admin dir of every
other agent's worktree, and the whole company lost git until the operator
repaired it on the host (#69).

## Instead

- To try a merge without touching your tree: `git merge-tree --write-tree
<a> <b>`. It prints conflicts and changes nothing.
- To work on a second branch: commit your current work (WIP commit is
  fine), then `git switch`. One worktree per agent.

## Fetching

ssh does not work in a jail (no key). Fetch over https:

```sh
git fetch https://github.com/Enteee/VibeWars.git main:refs/remotes/origin/main
```

## If git says "not a git repository"

Stop. Do not delete, re-clone or re-add anything. Say so on Telegram:
the repair is host-side.
