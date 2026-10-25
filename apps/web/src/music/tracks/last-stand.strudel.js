// last-stand - B phrygian, 150 bpm. mood: tense, dark.
// Back to the wall. A heartbeat sub pulse that never stops, strings that tremble
// faster as intensity climbs, a filter that opens with every level.
setcpm(150 / 4)

let P = "<Bm Cadd9 Bm Gadd9 Bm Cadd9 Am7 Bm>"

stack(
  // 0: the heartbeat and a dark held chord
  note("b1 ~ ~ ~ b1 ~ [b1 ~] ~").s("sine").decay(.25).sustain(0).gain(.5).lpf(150),
  chord(P).voicing().mode("below:d4")
    .s("sawtooth").attack(.8).release(1.5).gain(.22)
    .lpf(ref(() => 400 + INTENSITY * 900)).room(.7).roomsize(7).orbit(2),
  // 1: tremolo strings (sixteenth gates), taiko on the heart
  layer(1, stack(
    n("0 2 4").chord(P).voicing().mode("above:b3").struct("x*16")
      .s("supersaw").unison(2).detune(.2).decay(.1).sustain(.6).release(.05).gain(.3)
      .lpf(ref(() => 600 + INTENSITY * 800)).orbit(2),
    s("taiko:1 ~ ~ ~ taiko:1 ~ ~ ~").gain(.6).room(.3))),
  // 2: war drums and the rising line
  layer(2, stack(
    s("taiko:0 taiko:1 ~ taiko:0 taiko:1 ~ taiko:0 taiko:1").gain(.7).room(.3),
    n("<[0 ~ 1 ~ 0 ~ 2 ~] [4 ~ 3 ~ 2 ~ 1 ~]>").scale("b3:phrygian")
      .s("sawtooth").attack(.02).release(.3).gain(.45).lpf(1400).lpenv(2).lpd(.25).room(.4).orbit(2))),
  // 3: choir, cymbal swell, everything open
  layer(3, stack(
    chord(P).voicing().mode("below:f#5").s("sawtooth").vowel("a").attack(.3).release(1).gain(.2).lpf(2600).room(.7).orbit(2),
    s("swell:0 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.3),
    s("snare:1*8").gain(.18)))
).postgain(.29)
