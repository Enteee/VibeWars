# Post-match charts: three options (#3561)

Three alternative designs for the post-match charts, same invented data and
the UI's own palette (`--panel`, `--line`, `--ink`, `--accent`, `--damage`).
Each shows the player view and the team view. Made by
`scripts/assets/3561-postmatch-charts.mjs`; regenerate with
`node scripts/assets/3561-postmatch-charts.mjs`.

| Option | Picture                        | Idea                                                                                                                                                                                 |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A      | `3561-postmatch-a-stacked.png` | One page: the player chart over the team chart, one shared time axis, **one event lane** under both. Chips toggle series.                                                            |
| B      | `3561-postmatch-b-grid.png`    | **Small multiples:** a card per measure (damage dealt, taken, healing, energy; team health pool, cumulative damage), each with its own scale and total. Nothing to toggle.           |
| C      | `3561-postmatch-c-list.png`    | **One big chart** with a You / Teams / Overlay switch and series chips, plus an **event list** beside it. The hovered moment highlights its row. A small Teams preview opens on tap. |

## Common to all

- Banner and its buttons are one row and never overlap; scores left, charts
  right. Names: the BOT tag is a separate chip and never takes the name's room.
- Series differ by dash as well as hue (dealt solid, taken dashed, healing
  dotted, energy dash-dot). Teams keep `#59c2ff` (yours) and `#ff7b72`.
- Event shapes differ: kill = diamond, death = cross, interrupt = bolt,
  capture = flag, resurrection = triangle. Legend under the chart.
- Phone: the footer carries Rematch / Back to lobby and stays clear of the
  charts. A stacks as is, B goes two columns then one, C puts the event list
  under the chart.

## Trade-offs

- **A** shows the whole match at once and lines events up across both views;
  the plots are shorter, and energy and cumulative damage are one click away.
- **B** is the easiest to read cold, and every number is on screen. Each plot
  is small, and overlaying two measures is not possible.
- **C** gives the biggest plot and the only readable event text; it shows one
  view at a time.
