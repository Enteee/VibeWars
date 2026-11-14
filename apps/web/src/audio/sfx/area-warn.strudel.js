// sfx area-warn: 0.35 s, peak -9 dBFS
// A skill area that can hurt you landed on or near you: a low violet pulse,
// a falling pitched drone with a slow throb.
setcpm(60);
stack(
  s("sine")
    .freq(180)
    .penv(-8)
    .pattack(0.3)
    .panchor(0)
    .attack(0.01)
    .decay(0.34)
    .sustain(0)
    .tremolo(14)
    .tremolodepth(0.5),
  s("triangle")
    .freq(90)
    .penv(-8)
    .pattack(0.3)
    .panchor(0)
    .attack(0.01)
    .decay(0.34)
    .sustain(0)
    .gain(0.6),
);
