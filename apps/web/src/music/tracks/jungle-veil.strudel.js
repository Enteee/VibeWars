// jungle-veil - E dorian, 84 bpm. mood: mysterious, atmospheric.
// Overgrown, alive, watched. Pizzicato that never lands on the same beat twice
// (7 and 5 steps against a 4-beat bar), hand percussion, a breathy wooden flute.
setcpm(84 / 4)

let P = "<Em9 A7 D^7 Bm7 Em9 A7 Gadd9 Bm7>"

stack(
  // 0: the humid bed - a low drone, a held chord, the flute calling
  note("e2").s("triangle").attack(1).release(2).gain(.5).lpf(400),
  chord(P).voicing().mode("below:g4")
    .s("supersaw").unison(2).detune(.3).attack(1.6).release(2.5).gain(.15)
    .lpf(sine.range(500, 1400).slow(12)).room(.85).roomsize(8).orbit(2),
  n("0 ~ ~ 2 [4 3] ~ 1 ~ ~ ~ 0 ~ ~ ~").slow(3).scale("e4:dorian")
    .s("recorder").gain(.6).attack(.12).release(.7).room(.8).roomsize(7).orbit(2),
  // 1: pizzicato in seven, hand drum in five - the jungle moves
  layer(1, stack(
    n("0 2 4 1 3 5 2").chord(P).voicing().mode("above:e3").fast(4/7*4/4)
      .s("pizz").gain(.7).room(.5).orbit(2),
    s("frame:3 ~ frame:2 ~ frame:3").fast(4/5*1).gain(.4).room(.4).pan(.3))),
  // 2: a slow war drum and a lute under the flute
  layer(2, stack(
    s("taiko:1 ~ ~ ~ ~ ~ taiko:0 ~").gain(.7).lpf(500).room(.5),
    n("<0 ~ ~ 4 ~ 2 ~ ~>*2").scale("e3:dorian").s("strum").gain(.5).room(.5)))
).postgain(.35)
