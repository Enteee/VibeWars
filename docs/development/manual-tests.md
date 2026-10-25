# Manual tests

What CI cannot check, and how to check it by hand. Run an item when you
change the code it names.

## The host clock keeps ticking in a hidden tab

Code: `apps/web/src/net/transport/host-clock.ts` and
`host-clock.worker.ts` (#392).

A browser throttles a hidden tab's own timers, so the host's match clock
runs in a Worker, whose timers are spared (ADR-0028, measurement 3).
Playwright keeps every page `visible`, so no e2e test can hide one.

1. Start headful Chromium on a virtual display, with a debugging port:
   `xvfb-run chromium --remote-debugging-port=9222 --user-data-dir=$(mktemp -d)`.
2. Open the client in one tab and host a match. Note the tick in the
   host's snapshots, for example from the console.
3. Open a second tab with any page. Read both target ids from
   `http://localhost:9222/json`, and switch to the second tab over raw
   CDP: `Target.activateTarget` with its id.
4. On the host's tab, confirm `document.visibilityState` is `"hidden"`
   (`Runtime.evaluate` over the same socket).
5. Wait 60 s, then switch back.

Pass: the tick advanced about 20 a second throughout, about 1 200 over
the 60 s, and there was no burst of ticks on return. A Worker clock
should keep its rate; a page-timer clock drops to about 1 a second.
