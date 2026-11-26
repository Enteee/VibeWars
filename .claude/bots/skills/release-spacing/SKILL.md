---
name: release-spacing
description: A release is cut at most once per 48 hours, never because features are Done. Use before freezing, branching, handing to QA or publishing a release, and before creating a Release tracking issue.
---

# Release spacing

The operator wants a release every 2 to 3 days. Six shipped in 31 hours
because "every feature is Done" and "start the next one" were read as
triggers. They are not; the clock is.

- Before `hub push release/0.N.0`, `hub release create` or telling QA a
  branch is ready, read the newest tag's date (`hub release list`). If
  it is under 48 hours old, stop: do nothing and wait for the next
  `release-cadence` tick.
- A tracking issue may be opened early to collect scope. Freezing waits
  for the clock, however complete the list is.
- A reboot, a restart or a schedule firing on a fresh session is not a
  cadence tick. Check the newest tag's date, not your memory.
- Anyone who sees a release cut inside 48 hours of the last: tell the
  manager.
