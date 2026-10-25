# P2P spike (#16): throwaway, not for merge

`npm install` here (outside the pnpm workspace), then `../../node_modules/.bin/vite build`,
`node serve.mjs dist 26431 /`, and with `VIBEWARS_CHROMIUM` set:

- `node q3.mjs 10`: time-to-connect, two pages, public Nostr relays
- `node q4.mjs 120000`: host + 3 peers, 20 Hz x 2 KB for 2 min, ping RTT, host-leave detection
- `node q5.mjs 420000`: worker clock in a hidden tab (needs `Xvfb :97`; raw CDP, since Playwright keeps every page visible)
- `node q6.mjs`: BroadcastChannel transport, same vs separate browser contexts
- `node q7.mjs` / `node q7b.mjs`: the live GitHub Pages site, and Trystero run from the github.io origin

The report is on #15.
