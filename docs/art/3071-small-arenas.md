# Small arenas study (#3071)

Studies: `3071-crossroads.png` (800x860), `3071-long-hall.png` (800x420), `3071-ember-pits.png`
(800x580). Regenerate with `node scripts/assets/small-arenas-study.mjs docs/art` (needs
inkscape; the SVG is not committed). Layouts are new and asymmetric; the PNGs are guides, not
coordinates. Palette and light follow `visual-style.md` and the Canyon study (`3070-canyon.md`):
low sun from the NW (hard SE shadows), danger orange only for lava and torch light.

## Crossroads (annihilation 1-8, 2600x2600)

- **Place:** market town, two bent roads cross off-centre at an irregular fountain square
  (water, L0). Ragged field edge outside, not a rectangle.
- **Heights:** rooftops (L1) in loose clusters joined by plank bridges; gatehouse on the east
  road with a walkable roof (L2) reached by a short stair from a roof; drop-off from a roof
  edge into the SW alley.
- **Under:** cellar passage (tunnel) from a hatch in the NW house to an exit SE of the square.
- **Elements:** lever on the gatehouse works its portcullis; lanterns (r 36) and a torch at
  the cellar exit; market stalls as low cover.
- **Teams:** A west on the rooftop side (bridges, stairs); B south-east near the cellar exit
  and gatehouse. Balance by the bench and the high-ground numbers, not by mirroring.

## Long Hall (annihilation 1-8, 3200x1100)

- **Place:** ruined great hall, broken wall line, roof holes throwing dust shafts (SE-slanting,
  low-opacity warm white).
- **Heights:** a long north wall-walk (L1) and a shorter south one; balcony at the east end;
  broken stair at the west end with a gap at its top (L0 to L1, one jump).
- **Under:** the floor has collapsed in the middle into a crypt (pit, L-1) with a gated side
  door; a lever at the east end of the north walk opens it.
- **Elements:** braziers (r 44, warm), columns and fallen blocks as cover.
- **Teams:** A west by the walk and lever, B east by the balcony; the walk is long cover for A,
  B has the near high ground.

## Ember Pits (kill-count 1-8, 2800x1800)

- **Place:** volcanic ground; three lava channels (deadly pit) braid round a basalt island.
  Lava `#e0561f` with a `#ffb347` core and an orange glow from below; rock stays
  desaturated brown-grey so only the lava reads as danger.
- **Heights:** west ledge (L1), stone bridges over each channel (L1), basalt column in the
  middle with a lever-timed lift to its top (L2); drop-off into the pits at the north-east.
- **Zones:** cooling crust is scorched ground (dashed ember rim), steam vents puff pale grey.
- **Teams:** A west on the crust side (one bridge, near the lift); B north-east (two bridges,
  steam). Sides differ on purpose.

PNG sizes: 76 KB, 45 KB, 66 KB (96-colour palette).
