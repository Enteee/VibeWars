// jungle-veil - D dorian, 76 bpm. mood: mysterious, atmospheric.
// Deep under the canopy, something is watching. A low harp keeps a slow,
// steady walk; a recorder calls four notes (up a third, back a step, up to the
// fifth) and the jungle answers. Level 1 adds a pizzicato ripple and a ticking
// frame drum, level 2 the taiko and a harp that doubles the call below.
// Eight sections of eight cycles (3m22s before it repeats): the call climbs,
// sinks into the undergrowth, turns back on itself and comes home, and the
// last chord, A minor, leads back into the first.
setcpm(76 / 4)

let A = "<Dm9 Dm9 G7 G7 Dm9 Dm9 Am7 Am7>"
let B = "<Fadd9 Fadd9 C^7 C^7 Dm9 Dm9 G7 G7>"
let C = "<Am7 Am7 Em7 Em7 Fadd9 Fadd9 G7 G7>"
let D = "<Dm9 Dm9 Fadd9 Fadd9 G7 G7 Am7 Am7>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, B], [8, A], [8, C], [8, D])

// the call: stated, sighed down, stated again and taken further, then a bar of silence
let call = "<[0 ~ 2 1 ~ ~ 4 ~] [~ ~ 3 ~ 2@4] ~ ~ [0 ~ 2 1 ~ ~ 4 ~] [5 ~ 4 ~ 2 ~ 1 ~] [0@6 ~ ~] ~>"
let voice = arrange([8, call], [8, call.add(2)], [8, call.rev()], [8, call.add(-3)],
  [8, call.add(2).rev()], [8, call], [8, call.add(-3).rev()], [8, call])

stack(
  // 0: the walk - a low harp on every beat - a dim chord, and the call
  note(P.rootNotes(2)).s("harp").struct("x x x x").gain(.42).lpf(900).room(.7).roomsize(6).orbit(2),
  chord(P).voicing().mode("below:a4")
    .s("triangle").attack(1.2).clip(1).release(1.5).gain(.1).lpf(900).room(.7).roomsize(6).orbit(2),
  n(voice).scale("d4:dorian")
    .s("recorder").gain(.55).attack(.1).release(.8).lpf(2400).room(.7).roomsize(6).orbit(2),
  // 1: the canopy stirs - a pizzicato ripple, a frame drum ticking off the beat
  layer(1, stack(
    n("0 ~ 2 1 ~ 2 3 ~").chord(P).voicing().mode("above:d3")
      .s("pizz").gain(.38).room(.7).roomsize(6).orbit(2),
    s("~ frame:2 ~ frame:2 ~ frame:2 ~ frame:2").gain(.22).pan(.35))),
  // 2: the taiko, and the harp doubling the call an octave below
  layer(2, stack(
    s("taiko:1 ~ ~ ~ ~ taiko:0 ~ ~").gain(.4).lpf(600).room(.4),
    n(voice).scale("d3:dorian").s("harp").gain(.25).room(.7).roomsize(6).orbit(2)))
).postgain(.45)
