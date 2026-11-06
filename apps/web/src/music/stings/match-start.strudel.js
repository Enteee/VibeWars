// match-start - a horn swell. Root and fifth rise out of nothing, the
// octave answers, and a timpani roll lands the downbeat of the fight.
stack(
  n("[0,4]@3 [0,4,7]")
    .scale(KEY)
    .s("sawtooth")
    .attack(1.2)
    .release(0.6)
    .gain(0.35)
    .lpf(500)
    .lpenv(3)
    .lpa(1.4)
    .lpd(0.6)
    .room(0.5),
  n("-7@3 -7").scale(KEY).s("triangle").attack(0.8).release(0.6).gain(0.4),
  s("~ ~ ~ timp:2*4").gain(0.3),
  s("swell:0 ~ ~ ~").gain(0.25),
)
  .slow(2)
  .postgain(0.4);
