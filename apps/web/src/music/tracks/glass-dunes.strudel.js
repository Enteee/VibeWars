// glass-dunes - D phrygian dominant ("spanish" in Strudel scale names), 66 bpm. mood: epic, mysterious.
// A warm, wide desert at dusk: a low drone, a soft string pad and a plucked
// harp that tells four slow tales over it. Nothing blows and nothing is higher
// than B4 except a few far bells. Later layers add a strummed figure, a low
// triangle answer and a muffled drum.
// Eight sections of eight cycles (about 3m52s per pass): the pad walks
// four roads and the harp sings a different tale on each.
setcpm(66 / 4)

let A = "<D Eb D Gm D Eb Gm D>"
let B = "<Gm D Eb D Gm Eb D D>"
let C = "<D Gm Eb D Gm Eb Gm D>"
let E = "<Eb D Gm Gm D Eb D D>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, E], [8, B], [8, C], [8, A])

// four tales, one bar of eight steps each, over two cycles
let tale1 = "0 ~ 2 ~ 1 ~ 0 ~ | ~ 2 ~ 3 ~ 4 ~ 2 ~"
let tale2 = "4 ~ 3 ~ 2 ~ ~ 1 | 0 ~ ~ 2 ~ 1 ~ ~"
let tale3 = "~ 0 ~ 1 ~ 3 ~ 2 | 4 ~ 4 ~ 3 ~ 2 ~"
let tale4 = "2 ~ ~ 4 ~ 3 ~ ~ | 1 ~ 2 ~ 0 ~ ~ ~"
let walk = cat(tale1, tale2, tale3, tale4).slow(2)
let lead = arrange([8, walk], [8, walk.add(-2)], [8, walk.rev()], [8, walk.add(1)],
  [8, walk.add(-2)], [8, walk.rev().add(1)], [8, walk.add(1).rev()], [8, walk])

stack(
  // 0: drone, pad and the harp
  note("d1").s("sine").attack(2).release(3).gain(.5),
  note("d2").s("triangle").attack(2).release(3).gain(.3),
  chord(P).voicing().mode("below:a4")
    .s("sawtooth").attack(1.2).release(2.5).gain(.14)
    .lpf(1100).room(.9).roomsize(6).orbit(2),
  n(lead).scale("d4:spanish")
    .s("harp").gain(.6).release(1.2).room(.8).roomsize(6).orbit(2),
  // 1: a strummed figure and sparse far bells
  layer(1, stack(
    chord(P).voicing().mode("below:a4").segment(4).s("strum").gain(.22).room(.5).roomsize(6).orbit(2),
    note("<d5 ~ a5 ~ f#5 ~ c6 ~>").s("bells").gain(.2).room(.9).roomsize(6).orbit(2))),
  // 2: a low triangle answers the harp, a muffled drum under it
  layer(2, stack(
    s("taiko:0 ~ ~ ~ ~ ~ taiko:1 ~").gain(.5).lpf(900).room(.5),
    n(lead.add(-7)).scale("d4:spanish").s("triangle")
      .attack(.05).release(.8).gain(.35).room(.6).roomsize(6).orbit(2)))
).postgain(.33)
