// northern-pass - G mixolydian, 96 bpm. mood: adventurous, epic.
// Setting out over snowy mountains: a horn call, a striding bass, a frame drum
// and a tin whistle. Level 1 adds the lute, level 2 the full march.
// Ten sections of eight cycles (3m20s before it repeats): four chord journeys,
// and the horn call climbs, turns and answers itself section by section.
setcpm(96 / 4)

let A = "<G F C G G F Dm F>"
let B = "<C G F C Em F G Dm>"
let C = "<Am F C G Am Em F G>"
let D = "<Dm C F G Dm Am F G>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, A], [8, C], [8, D], [8, A])

// the horn call: eight cycles, a rest of a bar after each call
let call = "<[0@3 4@2 ~ 2 ~] ~ [2@3 1@2 ~ 0@2] ~ [4@3 5@2 ~ 7 ~] ~ [5@3 4@2 ~ 2 ~] [2@2 1@2 0@4]>"
let horn = arrange([8, call], [8, call.add(2)], [8, call.rev()], [8, call.add(-2)], [8, call.add(4)],
  [8, call.rev().add(2)], [8, call], [8, call.add(-2).rev()], [8, call.add(2)], [8, call.rev().add(-2)])

stack(
  // 0: open fifths in the strings, the striding bass, the horn call
  chord(P).voicing().mode("below:d4")
    .s("supersaw").unison(3).detune(.2).attack(.6).release(1.2).gain(.17)
    .lpf(1500).room(.6).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("triangle").attack(.02).decay(.25).sustain(.4).release(.2).gain(.5)
    .struct("x ~ x ~ x x x x"),
  n(horn).scale("g3:mixolydian")
    .s("sawtooth").attack(.08).release(.8).gain(.4)
    .lpf(800).lpenv(3).lpa(.12).lpd(.6).room(.7).roomsize(6).orbit(2),
  s("frame:1 ~ ~ ~ frame:1 ~ ~ ~").gain(.45).room(.3),
  // 1: the lute joins, the whistle answers the horn
  layer(1, stack(
    n("~ 0 ~ 2 ~ 0 ~ 2").chord(P).voicing().mode("above:g3")
      .s("strum").gain(.55).room(.4),
    n("~ ~ ~ ~ 4 [5 4] 2 ~ ~ ~ ~ ~ 2 [3 2] 0 ~".slow(2).add("<0 0 2 0 -2 0 3 0>"))
      .scale("g5:mixolydian")
      .s("whistle").gain(.4).attack(.03).release(.4).room(.5).roomsize(6).orbit(2))),
  // 2: the march
  layer(2, stack(
    s("timp:0 ~ ~ timp:0 ~ ~ timp:0 ~").gain(.55).room(.3),
    s("~ ~ frame:0 ~ ~ ~ frame:0 ~").gain(.4),
    n("<0 0 0 0 0 0 0 0>*2".add("<0 0 -1 0 0 0 -2 0>")).scale("g3:mixolydian")
      .s("sawtooth").attack(.05).release(.4).gain(.18).lpf(1100).lpenv(2).lpd(.3).roomsize(6).orbit(2)))
).postgain(.5)
