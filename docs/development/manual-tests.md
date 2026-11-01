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

## Two browsers play a match over Trystero

Code: `apps/web/src/net/session.ts`, `net/transport/trystero.ts` and
`net/transport/index.ts` (#403).

e2e plays over BroadcastChannel, inside one browser. Only real relays
show that two browsers that share nothing find each other.

1. Open `https://enteee.github.io/VibeWars/next/` in two browsers, or in
   one browser and a private window (separate storage, so separate peers).
2. In the first, press the lock in the title bar to open the lobby, then
   **Copy invite link**.
3. In the second, open that link. Both lobby screens list both players
   within a few seconds.
4. Each picks a team and readies; the host starts. Play for a minute:
   walk, target the other, cast, attack.
5. The guest leaves the match, then the host does. Both are back in the
   lobby, and the lobby opens again.
6. The host closes its tab. The guest is on the menu with "The host
   closed the lobby."

Pass: every step as written.

## A real join, pair by pair: `scripts/p2p-smoke.mjs`

Code: `scripts/p2p-smoke.mjs` (#707). Needs the internet; not in CI.

`node scripts/p2p-smoke.mjs` builds the client with the Trystero
transport, serves it on `127.0.0.1`, and for each pair opens its lobby in one
browser context, reads the key in the title bar, and joins that key from
another, as a second window does:
Firefox↔Firefox, Firefox↔Firefox with a private window's strict tracking
protection, Chromium↔Chromium and Firefox↔Chromium. For each side it prints
the relay sockets open, every peer connection's last state and the local
candidate types it gathered (`host(mdns)`, `srflx`), what Trystero logged,
and the notice the joiner was shown. It exits 0 only if every pair joined.

`--url <client>` measures a client already served, such as `pnpm run dev`
at the address it prints; `--pairs` picks pairs. Browsers come from
`VIBEWARS_CHROMIUM` and `VIBEWARS_FIREFOX`, as for the music stress run.

`--turn <invite-link-or-json>` gives both sides a TURN relay (#972): each
page opens it as an invite link and presses _Use_.
`--relay-only` also forces `iceTransportPolicy: "relay"` on every peer
connection, a seam in the script only: a join then succeeds only through
the relay, and `peers` shows `relay` candidates alone.

When a join fails, the joiner is told how far it got (#707): "Couldn't
reach the lobby servers" when no relay socket opened, "Found the lobby, but
couldn't connect to its host" when Trystero exchanged SDP and nothing
connected, and "Couldn't reach that lobby. Check the key, and ask the host
to open it." otherwise, which a closed, empty lobby gives too (#1682).

## Phase 5 of P2P: across networks and browsers (Q46)

Code: everything under `apps/web/src/net/` and `packages/game-session`
(#404, which deleted the server).

Run on the Pages `/next/` build after #404 merges, and record each run in
the table below: date, browsers and networks, and result.

1. **Two networks.** Host on a home network; join from a phone on its
   mobile hotspot, a different NAT. Play one match to its end, with no
   relay saved. A failure here is filed as a bug against #15 with both
   network types; it does not reopen #404. The next section is the fix.
2. **A hidden Firefox host.** Host in Firefox. During a match, hide its tab
   behind another for 5 minutes or more. Pass: the joiner sees normal
   speed throughout, never one tick a second.
3. **Chromium hosts, Firefox joins.** Play one match to its end.

A failure in 2 or 3 is a bug.

| Date | Check | Host (browser, network) | Joiner (browser, network) | Result |
| ---- | ----- | ----------------------- | ------------------------- | ------ |

## Two networks through a TURN relay

Code: `apps/web/src/net/transport/turn-config.ts` and `trystero.ts`
(#972). Needs a TURN server reachable from both networks, such as the
devenv coturn (#974).

1. `node scripts/p2p-smoke.mjs --pairs chromium-chromium --relay-only --turn '<invite link>'`.
   Pass: it joins, and every `peers` line shows `relay` candidates only.
2. Two networks that fail check 1 of the section above, such as a
   home network and a phone on mobile data. The host opens the invite
   link and presses _Use_: the address bar keeps no `#turn=`, and Options
   shows the relay's host. Its lobby screen says "Relay: _host_".
3. The joiner, with no relay, joins the code. Pass: it reaches the
   lobby, and the match plays to its end. One side having the relay is
   enough.
4. Options, _Forget relay_. Relay: None, and the lobby says nothing of
   a relay.

## Random Arena tickets on the relays: `scripts/net/nostr-kind-probe.mjs`

Code: `apps/web/src/net/transport/nostr-queue.ts` (#872, ADR-0032 §3).
Needs the internet; not in CI.

Queue tickets are ephemeral Nostr events, which a relay forwards and does
not store, and some relays refuse them. `node
scripts/net/nostr-kind-probe.mjs` puts two real queue boards on each relay
in `relays.ts` alone, publishes a ticket from one and prints, per relay,
whether its socket opened, what it answered the event and whether the
other board heard it. It exits 0 only if most relays delivered. Run it
when the relay list or the event kind changes. If most relays stop
delivering, the queue goes back to the architect (ADR-0032 §3); a single
relay that refuses can be dropped from `relays.ts`.

2026-10-27: 6 of 8. `relay.kaleidoswap.com` refuses kind 23854;
`relay.degmods.com` accepts it and delivers nothing.

## Random Arena over real relays, from two networks

Code: `apps/web/src/net/transport/nostr-queue.ts` and the queue under
`packages/game-session` (#854). Run once the Random Arena button exists
(#880), on the Pages `/next/` build.

1. Two players, on different networks (a home network and a phone on its
   mobile hotspot), each open the client and press _Random Arena_ in 1 v 1.
2. Each queue screen counts 2 of 2 searching within a heartbeat (5 s).
3. Within a few seconds more, both see the versus splash and land in the
   same match, one of them hosting. Play it to its end.
4. Four seconds after the result, both see it again on the queue
   screen, the winner with "1 win in a row this visit (not a rating)".
   Both press _Queue again_; one leaves the queue. The other player's count drops
   back at once, from the withdrawal, and no later than the ticket TTL (15 s).

Pass: every step as written. A pair that queues but never meets, with
`scripts/net/nostr-kind-probe.mjs` passing, is a bug against #854.

## Stay together over real relays

Code: `packages/game-session/src/stay-together.ts`, `lobby-host.ts` and
`queue-client.ts`, and `apps/web/src/main.ts` (#882). On the Pages
`/next/` build, with six players in 2 v 2, at least two of them on
another network.

1. Four press _Random Arena_ in 2 v 2 and play the match to its end.
2. Four seconds after the result, the two winners see _Stay together
   (15)_ counting down beside _Queue again_; the losers do not.
3. Both winners press it. Both land on the searching screen at once,
   counting 2 searching; one more stranger brings it to 3, a fourth
   to a match, the two winners on one side.
4. Win again and repeat, but one winner presses _Queue again_ instead:
   the other sees "The team split up" under the searching screen, queued
   alone.

Pass: every step as written.

## Music under load, on a phone

Code: `apps/web/src/music/host/` and `scripts/music-stress.mjs` (#420).

In the dev shell (Playwright's Firefox as `VIBEWARS_FIREFOX`, PulseAudio),
`node scripts/music-stress.mjs --pulse --json out.json` measures both
browsers, including the `audiostress` loads that show whether a browser's
underrun reading can be trusted (#519).

The stress script measures Chromium with CPU throttling. A phone's real
audio thread, Firefox for Android's included, can only be heard on a
phone. `?musicstats` makes the music host count what it costs, and the
page keeps the last second's counts in `window.__musicStats`.

1. Serve the client where the phone can reach it, for example
   `pnpm run dev` on the LAN.
2. Firefox for Android: enable USB debugging, connect the phone, and open
   `about:debugging` on the desktop Firefox. Chrome for Android: the same,
   with `chrome://inspect` in desktop Chromium.
3. On the phone, open `<client>/?musicstats`, make a character and play
   the Training Ground for a minute, fighting the dummies, then a match
   (#448): the music should not drop out while the game is busy.
4. In the remote console, read `__musicStats` a few times.

Pass: the music sounds clean, with no crackle and no gaps.
`droppedEvents` and `skippedMs` stay 0 in nearly every second. `underrunMs`
(the audio clock falling behind the wall clock: the audio thread running
dry, in Firefox as well) is 0 in nearly every second, and
`maxReductionDb` stays above −3 (below that the limiter is pumping). In
Chrome, `glitches` (playout fallback events) does not grow.

## Music after the tab was hidden

Code: `apps/web/src/music/host/visibility.ts` (#420).

The music's audio context is suspended while the page is hidden and
resumed when it is shown again, so it comes back with nothing to catch
up. Playwright keeps every page `visible`.

1. Desktop: as in "The host clock keeps ticking in a hidden tab", open the
   client with `?musicstats` in headful Chromium, start the Training
   Ground, and hide the tab for 60 s with `Target.activateTarget`.
2. Phone: play the Training Ground, switch to another app for a minute,
   and come back.

Pass: the music is silent while hidden. On return it carries on at its
own tempo, with no crackle, no rush of notes and no "music stopped
responding" notice. On the desktop, `__musicStats` shows `skippedMs` 0
in the seconds after the return.
