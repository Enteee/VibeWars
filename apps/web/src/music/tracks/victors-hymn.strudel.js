// victors-hymn - Bb major, 108 bpm. mood: triumphant, epic.
// Banners up. A brass chorale over choir and bells: noble, not cheesy. Level 0
// is the hymn, level 1 adds the timpani roll and the cymbal.
setcpm(108 / 4)

let P = "<Bb F Gm7 Eb^7 Bb F Eb F>"

stack(
  // 0: choir and strings hold the chord, the brass sings the tune
  chord(P).voicing().mode("below:f4")
    .s("sawtooth").vowel("a").attack(.5).release(1.4).gain(.2)
    .lpf(2200).room(.85).roomsize(8).orbit(2),
  chord(P).voicing().mode("below:d4")
    .s("supersaw").unison(3).detune(.2).attack(.5).release(1.2).gain(.22).lpf(1600).room(.6).orbit(2),
  note("<bb2 f2 g2 eb2 bb2 f2 eb2 f2>").s("triangle").attack(.04).release(1).gain(.5),
  n("<[2@2 4 3@2 2 1] [0@2 1 2@4] [4@2 5 4@2 2 1] [0@6 ~ ~]>").scale("bb4:major")
    .s("sawtooth").attack(.1).release(.6).gain(.5)
    .lpf(1100).lpenv(3).lpa(.1).lpd(.6).room(.7).roomsize(6).orbit(2),
  s("bells:1 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.3).room(.9).orbit(2),
  // 1: banners snap in the wind
  layer(1, stack(
    s("timp:2*8").gain(.35).room(.3).lpf(700),
    s("crash:0 ~ ~ ~ ~ ~ ~ ~").slow(4).gain(.3),
    n("0 2 4 2 0 2 4 7").chord(P).voicing().mode("above:bb3").s("harp").gain(.4).room(.6).orbit(2)))
).postgain(.335)
