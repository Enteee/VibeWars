// sfx interrupt-missed: 0.1 s, peak -14 dBFS
// Your interrupt hit nothing: a muted low click, "wasted".
setcpm(60);
stack(
  s("brown").attack(0.0005).decay(0.0195).sustain(0).lpf(1200).gain(0.5).compress(0, 0.02),
  s("sine")
    .freq(320)
    .penv(-3.6)
    .pattack(0.1)
    .panchor(0)
    .attack(0.002)
    .decay(0.098)
    .sustain(0)
    .gain(0.63),
);
