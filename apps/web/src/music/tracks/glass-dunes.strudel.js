// glass-dunes - E phrygian dominant ("spanish" in Strudel scale names), 72 bpm. mood: epic, mysterious.
// A vast crystal desert: a choir "ah", a low drone, slow taiko, and a lead that
// leans on the augmented second (F up to G#). Bells are the glass.
// Eight sections of eight cycles (3m33s before it repeats): the choir walks
// four roads across the dunes and the lead sings a different verse on each.
setcpm(72 / 4)

let A = "<E F E Am E F Dm E>"
let B = "<Am E F E Dm F E E>"
let C = "<E Dm F E Am F Dm E>"
let D = "<F E Dm Am E F E E>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, C], [8, A])

let verse = cat(
  "0 ~ ~ 1 ~ 2 ~ ~ ~ 1 ~ ~ 0 ~ ~ ~",
  "~ ~ 2 ~ 3 ~ ~ 4 ~ ~ 2 ~ 1 ~ ~ ~",
  "4 ~ ~ ~ 5 ~ 4 ~ ~ 2 ~ ~ 1 ~ 0 ~",
  "~ ~ 1 ~ ~ ~ 2 ~ ~ ~ 1 ~ 0 ~ ~ ~").slow(2)
let lead = arrange([8, verse], [8, verse.add(2)], [8, verse.rev()], [8, verse.add(-1)],
  [8, verse.add(3)], [8, verse.rev().add(2)], [8, verse.add(-1).rev()], [8, verse])

stack(
  // 0: drone and choir
  note("e1").s("sawtooth").attack(1.5).release(3).gain(.3).lpf(160),
  note("e2").s("triangle").attack(1.5).release(3).gain(.35),
  chord(P).voicing().mode("below:e5")
    .s("sawtooth").vowel("a").attack(1.2).release(2.5).gain(.16)
    .lpf(2500).room(.9).roomsize(8).orbit(2),
  n(lead).scale("e5:spanish")
    .s("whistle").gain(.55).attack(.1).release(.9).room(.8).roomsize(8).orbit(2),
  // 1: glass bells, a slow pulse
  layer(1, stack(
    n("<[0 ~ 2 ~ 4 ~ 2 ~] [1 ~ 3 ~ 5 ~ 3 ~]>".add("<0 0 2 0 -1 0 3 0>")).scale("e4:spanish")
      .s("bells").gain(.45).room(.9).roomsize(8).orbit(2),
    note("e2 ~ ~ ~ e2 ~ ~ ~").s("sine").decay(.5).sustain(0).gain(.55))),
  // 2: slow taiko, the swell, strings take the augmented second
  layer(2, stack(
    s("taiko:0 ~ ~ ~ ~ ~ taiko:1 ~").gain(.8).room(.5),
    s("swell:0 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.35).lpf(5000),
    n("<0 ~ 1 ~ 2 ~ 1 ~>".add("<0 0 0 0 2 2 -1 -1>")).scale("e3:spanish")
      .s("sawtooth").attack(.2).release(1).gain(.3).lpf(1200).room(.6).roomsize(8).orbit(2)))
).postgain(.33)
