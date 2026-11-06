// sfx hit-dealt: 0.12 s, peak -6 dBFS
// You damaged someone. Short and dry: a filtered crack over a quick mid-pitch
// drop. It fires often, so there is little pitch to tire of.
setcpm(60);
stack(
  s("white").attack(0.001).decay(0.049).sustain(0).hpf(900).lpf(4000).gain(0.5).compress(0, 0.05),
  s("sine")
    .freq(260)
    .penv(-13)
    .pattack(0.12)
    .panchor(0)
    .attack(0.002)
    .decay(0.118)
    .sustain(0)
    .gain(0.8),
);
