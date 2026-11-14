// sfx area-warn: 0.35 s, peak -9 dBFS
// Ground that can hurt you landed on or near you (#3297): a low violet
// pulse, a pitched drone falling and throbbing. Move.
setcpm(60);
stack(
  s("triangle")
    .freq(196)
    .penv(-5)
    .pattack(0.35)
    .panchor(0)
    .attack(0.02)
    .decay(0.33)
    .sustain(0)
    .tremolo(9)
    .tremolodepth(0.6),
  s("sine").freq(98).penv(-5).pattack(0.35).panchor(0).attack(0.02).decay(0.33).sustain(0).gain(0.6),
);
