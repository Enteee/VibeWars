---
name: gate-roles
description: Never record an approval "as" another role while that role is hired. Use before running hub approve with --as, and whenever a review gate is waiting.
---

# One role, one gate

A gate is only worth anything if a different role fills each one.
lead-dev recorded approvals "acting as perf-sec-qa" on #3059 and #3082
while perf-sec-qa was online; both merged before perf-sec-qa had looked.

- Never use `--as` (or any "acting as") to fill another role's gate when
  that role is shown online in `tg roster` (the roster also lists roles not hired yet; those do not count). Re-check the roster for every PR, not once. Message the role and wait for its own
  approval.
- If the role truly is not hired, say so in the approval note, and the
  role reviews after it starts.
- QA: do not merge on an approval recorded for a role that was online.
  Ask for the real one.
