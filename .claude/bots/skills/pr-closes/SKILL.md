---
name: pr-closes
description: Put one 'Closes #N' line per issue a pull request finishes in its body, so merging it closes every issue. Use when you open a pull request, and when a PR you review or merge fixes more than its title says.
---

# Every PR names every issue it closes

GitHub only closes an issue on merge if the PR body says `Closes #N` for it. On 2026-10-25 issues #211 and #239 stayed open after their fixes merged: PR #205 only said `Closes #160`, and PR #235 said nothing. Someone had to notice and close them by hand, and the board said Done while GitHub said open.

## Author

Write one line per issue, each with its own keyword:

```text
Closes #160
Closes #211
```

`Closes #160, #211` closes only #160. A follow-up you did _not_ finish
gets `Refs #N`, never `Closes`.

If the work grows to cover another issue while it is in review, add its
`Closes` line with `hub pr edit <pr> --body-file <file>`.

## Reviewer and qa-tester

Before approving or merging, check the body names every issue the
change finishes. If one is missing, ask the author to add it. Do not
merge without it.
