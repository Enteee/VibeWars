# The link-preview picture

`apps/web/public/share.png` (1200×630) is what a shared link shows
(#3534). `pnpm run share:image` retakes it from the splash screen: a live
bot-vs-bot fight with the VibeWars name over it. It is a docs tool, not
part of CI; run it when the look has moved, wrapped in `company heavy`.

```sh
company heavy pnpm run share:image
```

With no options it retakes the committed picture's shot: the map is
`DEFAULT_MAP` in `scripts/share-image.mjs`, and that map's moment and crop
come from its `CROPS` table (#3879). The bots fight from a new seed on
every load, so a re-run is the same map, moment and framing, not the same
pixels: look at it before you commit it.

| Option           | What it does                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `--map <id>`     | The arena behind the title.                                                                       |
| `--wait <s>`     | Seconds the fight runs before the shot. Default: the map's in `CROPS`.                            |
| `--crop x,y,w,h` | The part of the 1200×630 page shot, in CSS px, at 1200:630. It is shot at 2×. Default: the map's. |
| `--sweep`        | Also keep the whole page every 2 s in `$TMPDIR/share-sweep`.                                      |
| `--url <url>`    | Shoot a client already served there, instead of building one.                                     |

## Picking a new picture

Sweep the maps rebuilt in 2.5D (`docs/art/visual-style.md`) with
`--sweep --wait 40 --crop 0,0,1200,630` and look at the frames at full
size: a flat map is not the game's face. Pick the moment with the most bodies of every team
mixed together, and no rendering fault in frame: nothing drawn through a
bridge or deck, no wall top cut off, no stair laid over a wall. Then add
the map's `wait` and `crop` to `CROPS` and make it `DEFAULT_MAP`, so a
re-run takes the same picture.
