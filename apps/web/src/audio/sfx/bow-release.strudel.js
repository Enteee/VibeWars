// sfx bow-release: 0.18 s, peak -13 dBFS
// You fire a ranged weapon (#161): a soft low pluck with a tiny snap. A
// string, not a hit, so it never sounds like hit-dealt.
setcpm(60);
stack(
  s("sawtooth").freq(147).attack(0.001).decay(0.179).sustain(0).lpf(3500).gain(0.5),
  s("triangle").freq(294).attack(0.001).decay(0.1).sustain(0).gain(0.5),
  s("white").attack(0.0005).decay(0.0115).sustain(0).hpf(2500).gain(0.4).compress(0, 0.012),
);
