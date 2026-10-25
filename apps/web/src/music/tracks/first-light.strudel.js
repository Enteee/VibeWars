// first-light - D lydian, 76 bpm. mood: atmospheric, adventurous.
// Pastoral morning before everything went wrong: a recorder over harp and warm
// strings, the raised 4th (G#) as hope. Level 0 is the morning, level 1 the walk.
setcpm(76 / 4)

let P = "<D^9 E Bm7 A D^9 E F#m7 A>"

stack(
  // 0: strings, a soft bass, the flute
  chord(P).voicing().mode("below:a4")
    .s("supersaw").unison(3).detune(.25).attack(1.4).release(2.2).gain(.18)
    .lpf(sine.range(700, 1800).slow(16)).room(.8).roomsize(7).orbit(2),
  note("<d2 e2 b1 a1 d2 e2 f#2 a1>").s("triangle").attack(.08).release(1.2).gain(.45),
  n("0 ~ ~ 4 [3 2] ~ 1 ~ 0 ~ ~ 5 [4 3] 2 ~ ~").slow(2).scale("d5:lydian")
    .s("recorder").gain(.5).attack(.08).release(.6).room(.7).roomsize(6).orbit(2),
  // 1: the harp starts walking, a frame drum keeps time far off
  layer(1, stack(
    n("0 2 4 [5 4] 2 4 6 [4 2]").chord(P).voicing().mode("above:d3")
      .s("harp").gain(.55).room(.6).orbit(2),
    s("frame:3 ~ ~ ~ frame:3 ~ [~ frame:3] ~").gain(.35).room(.4)))
).postgain(.4)
