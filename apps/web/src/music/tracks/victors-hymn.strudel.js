// victors-hymn - Bb major, 108 bpm. mood: triumphant, epic.
// Banners up. A brass chorale over choir and bells: noble, not cheesy. Level 0
// is the hymn, level 1 adds the timpani roll and the cymbal.
// Eleven sections of eight cycles (3m16s before it repeats): four chord
// journeys, and the brass sings a new verse of the hymn over each.
setcpm(108 / 4)

let A = "<Bb F Gm7 Eb^7 Bb F Eb F>"
let B = "<Gm7 Eb^7 Bb F Cm7 Gm7 F Bb>"
let C = "<Eb^7 Bb F Gm7 Eb^7 Cm7 F Bb>"
let D = "<Bb Dm7 Eb^7 F Gm7 Cm7 F Bb>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, C], [8, A], [8, D], [8, B], [8, A])

// the hymn: eight cycles
let hymn = "<[2@2 4 3@2 2 1] [0@2 1 2@4] [4@2 5 4@2 2 1] [0@6 ~ ~] [4@2 5 6@2 4 3 2] [7@3 6 5 4 ~ 2] [5@2 4 2@2 3 4 5] [0@6 ~ ~]>"
let tune = arrange([8, hymn], [8, hymn.add(2)], [8, hymn.rev()], [8, hymn.add(-2)], [8, hymn.add(3)],
  [8, hymn.rev().add(2)], [8, hymn.add(-2).rev()], [8, hymn], [8, hymn.add(4)], [8, hymn.rev()], [8, hymn])

stack(
  // 0: choir and strings hold the chord, the brass sings the tune
  chord(P).voicing().mode("below:f4")
    .s("sawtooth").vowel("a").attack(.5).release(1.4).gain(.2)
    .lpf(2200).room(.85).roomsize(7).orbit(2),
  chord(P).voicing().mode("below:d4")
    .s("supersaw").unison(3).detune(.2).attack(.5).release(1.2).gain(.22).lpf(1600).room(.6).roomsize(7).orbit(2),
  note(P.rootNotes(2)).s("triangle").attack(.04).release(1).gain(.5),
  n(tune).scale("bb4:major")
    .s("sawtooth").attack(.1).release(.6).gain(.5)
    .lpf(1100).lpenv(3).lpa(.1).lpd(.6).room(.7).roomsize(7).orbit(2),
  s("bells:1 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.3).room(.9).roomsize(7).orbit(2),
  // 1: banners snap in the wind
  layer(1, stack(
    s("timp:2*8").gain(.35).room(.3).lpf(700),
    s("crash:0 ~ ~ ~ ~ ~ ~ ~").slow(4).gain(.3),
    n("0 2 4 2 0 2 4 7").chord(P).voicing().mode("above:bb3").s("harp").gain(.4).room(.6).roomsize(7).orbit(2)))
).postgain(.335)
