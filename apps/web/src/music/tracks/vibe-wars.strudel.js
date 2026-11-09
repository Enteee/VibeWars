// vibe-wars - E aeolian, 100 bpm. mood: adventurous, epic.
// The title theme. Horns rise a fifth and an octave in the first bar, so the
// flash lands on a statement; the B7 turns it back to the top without a seam.
// One level: the splash plays no intensity ramp, so level 0 is the whole theme.
// Four sections of twenty cycles (3m12s) carry the theme up and down the scale.
setcpm(100 / 4)

let P = "<Em C^7 Am7 B7>"
let theme = "<[0@2 4@2 7@4] [7@2 6@2 5@2 4@2] [3@2 5@2 4 3 2 1] [1@2 2 3@2 4@3]>"

let tune = arrange([20, theme], [20, theme.add(2)], [20, theme.add(4)], [20, theme.add(-2)])

stack(
  chord(P).voicing().mode("below:g4")
    .s("sawtooth").lpq(4).attack(.4).clip(.9).release(.2).gain(.2)
    .lpf(1800).room(.8).roomsize(6).orbit(2),
  chord(P).voicing().mode("below:e4")
    .s("supersaw").unison(1).attack(.4).clip(.9).release(.2).gain(.2).lpf(1500).room(.6).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("triangle").attack(.04).clip(.9).release(.2).gain(.5),
  n(tune).scale("e3:minor")
    .s("sawtooth").attack(.06).release(.3).gain(.5)
    .lpf(500).lpenv(3).lpa(.08).lpd(.5).room(.6).roomsize(6).orbit(2),
  s("timp:2 ~ timp:2 ~ timp:2 ~ timp:2 timp:2").gain(.4).room(.3),
  s("taiko:1 ~ ~ ~ taiko:1 ~ ~ ~").gain(.35),
  s("crash:0 ~ ~ ~ ~ ~ ~ ~").slow(4).gain(.3),
  n("0 2 4 2 0 2 4 7").chord(P).voicing().mode("above:e3").s("harp").gain(.35).room(.6).roomsize(6).orbit(2)
).postgain(.335)
