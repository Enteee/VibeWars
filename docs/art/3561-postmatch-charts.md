# Post-match charts: three options (#3561)

Option A is the first mockup the operator liked. B and C are variations on
it: the same banner, tabs (You / Teams / By skill), series chips, dash styles
and event shapes, with a different answer to "where do the events go, and how
big is the chart". Same invented data, the UI's own palette. Each option has
a You view and a Teams view. Made by `scripts/assets/3561-postmatch-charts.mjs`
(`node scripts/assets/3561-postmatch-charts.mjs` regenerates them).

| Option | Pictures                                   | Idea                                                                                                                                                                                                     |
| ------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | `3561-postmatch-a-you.png`, `-a-teams.png` | The original: scores left, chart right, events as markers on one strip under the time axis, a legend below. Teams stacks health pool over cumulative damage.                                             |
| B      | `3561-postmatch-b-you.png`, `-b-teams.png` | **Swim lanes.** Scores shrink to one compact row so the chart is full width; events get **one lane per kind**, so markers never overlap. Teams shows the health pool, cumulative damage behind a toggle. |
| C      | `3561-postmatch-c-you.png`, `-c-teams.png` | **Event list.** As A, but the events are also a list beside the chart (time, icon, words); the hovered moment highlights its row.                                                                        |

## Common to all

- Banner and its buttons are one row and never overlap. The BOT tag is its
  own chip and never takes the name's room.
- Series differ by dash as well as hue (dealt solid, taken dashed, healing
  dotted, energy dash-dot). Teams keep `#59c2ff` (yours) and `#ff7b72`.
- Event shapes differ: kill = diamond, death = cross, interrupt = bolt,
  capture = flag, resurrection = triangle.
- Phone: Rematch / Back to lobby sit in a footer clear of the charts; the
  scores collapse to "you + two"; B's lanes and C's list go under the chart.

## Trade-offs

- **A** is the simplest; markers crowd when events cluster.
- **B** gives the widest chart and untangles clustered events; it costs
  vertical space and drops the full scoreboard to a row.
- **C** is the only one that says what an event was in words; it narrows the
  chart.
