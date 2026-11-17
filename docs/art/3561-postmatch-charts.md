# Post-match charts: mockups (#3561)

Three mockups, made by `scripts/assets/3561-postmatch-charts.mjs` (invented
data, the UI's own palette: `--panel`, `--line`, `--ink`, `--accent`,
`--damage`). Regenerate with `node scripts/assets/3561-postmatch-charts.mjs`.

- `3561-postmatch-player.png`: desktop, the **You** tab. Four toggle chips
  (damage dealt, damage taken, healing, energy), a hover readout, event
  markers on the time axis.
- `3561-postmatch-teams.png`: desktop, the **Teams** tab. Health pool of both
  teams on top, cumulative damage below, one shared time axis and marker
  strip. On a phone the two are one chart with the "Health pool / Cumulative
  damage" control choosing which (the control is drawn in the mockup).
- `3561-postmatch-phone.png`: 390 × 844. Banner, collapsed scores, chart
  card, and a **sticky footer** with Rematch / Back to lobby, so the buttons
  never overlap the banner or a chart.

## Rules the mockups hold

- **Layout.** Banner and its buttons are one row and never overlap. Scores on
  the left, charts right; under 80 rem the scores collapse to "you + two" with
  "Show all". Buttons stay clear of the charts (header on desktop, footer on
  phone).
- **Names.** The BOT tag is a separate chip; the name gets the rest and wraps
  to a second line (ellipsis with a tooltip when it still does not fit).
- **Series are told apart by dash, not only hue**: dealt solid + faint area,
  taken dashed, healing dotted, energy dash-dot. Teams: your team `#59c2ff`,
  opponents `#ff7b72`, as everywhere else.
- **Toggles.** A chip is filled with its colour's outline when on, hollow and
  dim when off; off series leave the plot. Energy is off by default (its axis
  is 0–100 %, scaled to the same height).
- **Event markers sit on a strip under the plot**, with a faint line up to the
  data. Shape differs per kind: kill = diamond (ink), death = cross (red),
  interrupt = bolt (gold), objective capture = flag (blue), resurrection =
  triangle (green). Legend under the chart. 8 px half-size, 3 px strokes, so
  readable on a phone.
- **Readout.** Hover or tap draws a vertical rule and a small panel with the
  values at that second and any event there.
