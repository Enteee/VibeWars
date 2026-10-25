// northern-pass - G mixolydian, 96 bpm. mood: adventurous, epic.
// Setting out over snowy mountains: a horn call, a striding bass, a frame drum
// and a tin whistle. Level 1 adds the lute, level 2 the full march.
setcpm(96 / 4)

let P = "<G F C G G F Dm F>"

stack(
  // 0: open fifths in the strings, the striding bass, the horn call
  chord(P).voicing().mode("below:d4")
    .s("supersaw").unison(3).detune(.2).attack(.6).release(1.2).gain(.17)
    .lpf(1500).room(.6).roomsize(5).orbit(2),
  note("<[g2 ~ d3 ~ g2 d3 b2 d3] [f2 ~ c3 ~ f2 c3 a2 c3] [c2 ~ g2 ~ c3 g2 e2 g2] [g2 ~ d3 ~ g2 d3 b2 d3] [g2 ~ d3 ~ g2 d3 b2 d3] [f2 ~ c3 ~ f2 c3 a2 c3] [d2 ~ a2 ~ d3 a2 f2 a2] [f2 ~ c3 ~ f2 c3 a2 c3]>")
    .s("triangle").attack(.02).decay(.25).sustain(.4).release(.2).gain(.5),
  // the horn call: two phrases, a rest of two bars after each
  n("<[0@3 4@2 ~ 2 ~] ~ [2@3 1@2 ~ 0@2] ~>").scale("g3:mixolydian")
    .s("sawtooth").attack(.08).release(.8).gain(.4)
    .lpf(800).lpenv(3).lpa(.12).lpd(.6).room(.7).roomsize(7).orbit(2),
  s("frame:1 ~ ~ ~ frame:1 ~ ~ ~").gain(.45).room(.3),
  // 1: the lute joins, the whistle answers the horn
  layer(1, stack(
    n("~ 0 ~ 2 ~ 0 ~ 2").chord(P).voicing().mode("above:g3")
      .s("strum").gain(.55).room(.4),
    n("~ ~ ~ ~ 4 [5 4] 2 ~ ~ ~ ~ ~ 2 [3 2] 0 ~").slow(2).scale("g5:mixolydian")
      .s("whistle").gain(.4).attack(.03).release(.4).room(.5).orbit(2))),
  // 2: the march
  layer(2, stack(
    s("timp:0 ~ ~ timp:0 ~ ~ timp:0 ~").gain(.55).room(.3),
    s("~ ~ frame:0 ~ ~ ~ frame:0 ~").gain(.4),
    n("<0 0 0 0 0 0 0 0>*2").scale("g3:mixolydian")
      .s("sawtooth").attack(.05).release(.4).gain(.18).lpf(1100).lpenv(2).lpd(.3).orbit(2)))
).postgain(.5)
