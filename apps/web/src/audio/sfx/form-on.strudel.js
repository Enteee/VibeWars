// sfx form-on: 0.5 s, peak -10 dBFS
// You took a form: a deep swell, with a faint crackle of ash over it.
setcpm(60);
stack(
  s("sawtooth").freq(65.4).attack(0.2).decay(0.3).sustain(0).lpf(400),
  s("sine").freq(130.8).attack(0.25).decay(0.25).sustain(0).gain(0.5),
  s("white").attack(0.1).decay(0.4).sustain(0).hpf(4000).gain(0.08),
);
