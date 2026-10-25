// jungle-veil - E dorian, 84 bpm. mood: mysterious, atmospheric.
// Overgrown, alive, watched. Pizzicato that never lands on the same beat twice
// (7 and 5 steps against a 4-beat bar), hand percussion, a breathy wooden flute.
// Nine sections of eight cycles (3m25s before it repeats): the flute turns its
// call over, up and backwards while the chords wander four different paths.
setcpm(84 / 4)

let A = "<Em9 A7 D^7 Bm7 Em9 A7 Gadd9 Bm7>"
let B = "<Gadd9 D^7 Em9 Bm7 F#m7 Em9 A7 D^7>"
let C = "<Em9 Bm7 Gadd9 A7 Em9 D^7 F#m7 Bm7>"
let D = "<Bm7 Gadd9 D^7 A7 Em9 F#m7 Bm7 Em9>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, A], [8, C], [8, D])

// the flute call: four lines of two cycles
let call = cat(
  "0 ~ ~ 2 [4 3] ~ 1 ~ ~ ~ 0 ~ ~ ~ ~ ~",
  "~ ~ 4 ~ ~ 5 ~ 4 ~ ~ 2 ~ [3 2] ~ ~ ~",
  "2 ~ ~ ~ 4 ~ [6 5] ~ 4 ~ ~ ~ 2 ~ ~ ~",
  "~ ~ 0 ~ 1 ~ 2 ~ ~ ~ ~ ~ 0 ~ ~ ~").slow(2)
let flute = arrange([8, call], [8, call.add(2)], [8, call.rev()], [8, call.add(-2)], [8, call.add(4)],
  [8, call.rev().add(2)], [8, call], [8, call.add(-2).rev()], [8, call.add(2)])

stack(
  // 0: the humid bed - a low drone, a held chord, the flute calling
  note("e2").s("triangle").attack(1).release(2).gain(.5).lpf(400),
  chord(P).voicing().mode("below:g4")
    .s("supersaw").unison(2).detune(.3).attack(1.6).release(2.5).gain(.15)
    .lpf(sine.range(500, 1400).slow(12)).room(.85).roomsize(6).orbit(2),
  n(flute).scale("e4:dorian")
    .s("recorder").gain(.6).attack(.12).release(.7).room(.8).roomsize(6).orbit(2),
  // 1: pizzicato in seven, hand drum in five - the jungle moves
  layer(1, stack(
    n("0 2 4 1 3 5 2").chord(P).voicing().mode("above:e3").fast(4/7*4/4)
      .s("pizz").gain(.7).room(.5).roomsize(6).orbit(2),
    s("frame:3 ~ frame:2 ~ frame:3").fast(4/5*1).gain(.4).room(.4).pan(.3))),
  // 2: a slow war drum and a lute under the flute
  layer(2, stack(
    s("taiko:1 ~ ~ ~ ~ ~ taiko:0 ~").gain(.7).lpf(500).room(.5),
    n("<0 ~ ~ 4 ~ 2 ~ ~>*2".add("<0 0 -1 0 2 0 0 -2>")).scale("e3:dorian").s("strum").gain(.5).room(.5)))
).postgain(.35)
