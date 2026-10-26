// hall-of-champions - D aeolian with a harmonic-minor V (C# in the A chord), 128 bpm.
// mood: epic, action. The PvP hall: heroic, ceremonial, then all-out. Timpani
// ostinato and full strings from level 0, a brass melody at level 2, the choir
// and war drums at level 3. C# is the raised 7th, the only note outside the key.
// Thirteen sections of eight cycles (3m15s before it repeats): four chord
// journeys, and the brass sings a new verse over each.
setcpm(128 / 4)

let A = "<Dm Bb^7 C Dm Gm7 Bb^7 A Dm>"
let B = "<Gm7 Dm Bb^7 C Dm F A Dm>"
let C = "<Bb^7 C Dm A Bb^7 F Gm7 A>"
let D = "<Dm F C Gm7 Bb^7 C A Dm>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, C], [8, A], [8, D], [8, B], [8, C], [8, D], [8, A])

// the brass verse: eight cycles
let verse = "<[4@2 3 2@2 0 1 2] [4@2 5 4@2 2 1 0] [4@2 3 2@2 0 2 4] [5@3 4 3 2 ~ 0] [2@2 3 4@2 5 4 2] [5@2 6 5@2 4 3 2] [4@2 2 0@2 1 2 3] [0@6 ~ ~]>"
let brass = arrange([8, verse], [8, verse.add(2)], [8, verse.rev()], [8, verse.add(-2)], [8, verse.add(4)],
  [8, verse.rev().add(2)], [8, verse], [8, verse.add(-2).rev()], [8, verse.add(2).rev()], [8, verse.add(4)],
  [8, verse.rev()], [8, verse.add(-2)], [8, verse])

stack(
  // 0: the full strings and the timpani ostinato
  chord(P).voicing().mode("below:f4")
    .s("supersaw").unison(2).detune(.2).attack(.3).release(.8).gain(.25)
    .lpf(ref(() => 900 + INTENSITY * 700)).room(.6).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("sawtooth").attack(.02).release(.5).gain(.25).lpf(300),
  s("timp:0 ~ [~ timp:0] timp:0 ~ ~ [timp:1 timp:0] ~").gain(.7).room(.35),
  // 1: strings in eighths, a ceremonial bell
  layer(1, stack(
    n("0 1 2 1 0 1 2 3").chord(P).voicing().mode("above:d3")
      .s("sawtooth").attack(.01).decay(.15).sustain(.3).release(.1).gain(.35).lpf(1800).room(.4).roomsize(6).orbit(2),
    s("bells:0 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.35).room(.8).roomsize(6).orbit(2))),
  // 2: the brass melody, snare and cymbal
  layer(2, stack(
    n(brass).scale("d4:aeolian")
      .s("sawtooth").attack(.04).release(.4).gain(.5).lpf(500).lpenv(3).lpa(.05).lpd(.5).room(.5).roomsize(6).orbit(2),
    s("~ snare:1 ~ snare:1").gain(.35).room(.3),
    s("crash:0 ~ ~ ~ ~ ~ ~ ~").slow(4).gain(.3))),
  // 3: the choir, doubled war drums
  layer(3, stack(
    chord(P).voicing().mode("below:d5").s("sawtooth").lpq(4).attack(.2).release(.8).gain(.2)
      .lpf(2400).room(.8).roomsize(6).orbit(2),
    s("taiko:0 ~ taiko:1 taiko:0 ~ taiko:1 ~ taiko:0").gain(.5).room(.4)))
).postgain(.28)
