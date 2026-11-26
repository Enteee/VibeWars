// match-start - a horn swell. Root and fifth rise out of nothing, the
// octave answers, and a timpani roll lands the downbeat of the fight.
stack(
  n("[0,4]@3 [0,4,7]").scale(KEY)
    .s("sawtooth").attack(1.2).release(.6).gain(.35)
    .lpf(500).lpenv(3).lpa(1.4).lpd(.6).room(.5),
  n("-7@3 -7").scale(KEY).s("triangle").attack(.8).release(.6).gain(.4),
  s("~ ~ ~ timp:2*4").gain(.3),
  s("swell:0 ~ ~ ~").gain(.25)
).slow(2).postgain(.4)
