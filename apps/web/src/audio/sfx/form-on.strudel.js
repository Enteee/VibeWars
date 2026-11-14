// sfx form-on: 0.5 s, peak -10 dBFS
// You took a form (#3297): a deep swell with a faint crackle of ash on top.
setcpm(60);
stack(
  s("sawtooth").freq(73.42).attack(0.25).decay(0.25).sustain(0).lpf(500),
  s("sine").freq(146.83).attack(0.2).decay(0.3).sustain(0).gain(0.5),
  s("brown").attack(0.01).decay(0.45).sustain(0).hpf(2000).gain(0.15).compress(0, 0.48),
);
