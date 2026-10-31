# ADR-0046: qa-tester merges workflow pull requests that cicd-engineer pushed

## Status

Accepted (2026-10-31). Issue #1897, decided by the operator.

## Context

hub let qa-tester run `pr merge` on any pull request, behind green checks
and lead-dev's and perf-sec-qa's approvals of the current head. GitHub
refused the merge whenever the pull request changed `.github/workflows/`
or `.github/actions/`, though:

```text
refusing to allow an OAuth App to create or update workflow … without workflow scope
```

The company's token was signed in with `--scopes project,read:project`, and
gh's defaults (`repo`, `read:org`, `gist`) do not include `workflow`.
Merging a pull request that changes a workflow counts as updating it. PR
1613 failed that way and was closed, and every CI change since waited for
the operator to merge it by hand. CI work stalled on that one person.

## Decision

- **The token holds `workflow`.** `claude-llc auth github` signs the
  company's account in with `project,read:project,workflow`
  (`COMPANY_GITHUB_SCOPES`, `creds.mjs`). `claude-llc-init` refuses to
  start without it (`github workflow scope MISSING`), so the operator signs
  in again once.
- **A workflow change merges only from its owner's branch.** The `pr merge`
  rule gains the guard `workflow-author:cicd-engineer`. hubd fetches the
  pull request's head into its mirror, pinned at the commit the other
  guards validated, and diffs it against GitHub's `main` with
  `--no-renames`. When a path falls under a `RESTRICTED_PATHS` prefix, the
  merge goes through only if the pull request is from this repository and
  its branch is `bot/<employee>/…`, where `staff.json` gives that employee
  a role that owns every prefix touched and is named by the guard
  (`workflowAuthorAllowed`, `hub-guards.mjs`). Anything else is refused,
  and the operator merges it. A fetch or a diff that does not work is a
  refusal too.
- The order is unchanged: approvals of the current head and green checks,
  then the merge pinned with `--match-head-commit`. A push after an approval
  still voids it.

## What was rejected, and what failed

- **The scope without the author guard.** Pushes to the workflow paths are
  already restricted to cicd-engineer. But a developer's branch cut from a
  stale merge base, or a branch some other path put a workflow change on,
  would then land with two approvals and no CI owner behind it. The guard
  costs one fetch per merge.
- **Operator-only merges.** That was the bottleneck this decision removes.

## Consequences

- The company's token can now write workflows. `gh api` stays refused
  (`API_ALLOWLIST` is unchanged), so the only way a jail reaches that power
  is a merge, through every guard above.
- Every merge pays one extra fetch of the pull request's head. If GitHub
  cannot be reached, the merge is refused and qa-tester retries.
- Residual: cicd-engineer and both reviewers together can land any workflow.
  One role has to own CI, and two reviewers read every change to it.
