---
name: gate-roles
description: Never record an approval "as" another role while that role is hired. Use before running hub approve with --as, and whenever a review gate is waiting.
---

# One role, one gate

A gate is only worth anything if a different role fills each one.
lead-dev recorded approvals "acting as perf-sec-qa" on PRs 3059, 3080
and 3082 while perf-sec-qa was hired; the PRs merged before perf-sec-qa
had looked.

- Never use `--as` (or any "acting as") to fill another role's gate when
  that role is hired. Hired means `tg roster` does not show it as "not
  hired yet"; a stale or offline role is still hired. Re-check the roster
  for every PR, not once.
- Message the role and wait for its own approval.
- If the role truly is "not hired yet", say so in the approval note, and
  the role reviews after it starts.
- QA: do not merge on an approval recorded for a hired role. Ask for the
  real one.
