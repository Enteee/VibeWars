// sfx shout: 0.25 s, peak -12 dBFS
// A shout or chant reached you: a short airy swell that rises. Soft noise
// and a rising sine, no ticks.
setcpm(60);
stack(
  s("sine").freq(330).penv(5).pattack(0.2).panchor(0).attack(0.07).decay(0.18).sustain(0),
  s("pink").attack(0.08).decay(0.17).sustain(0).lpf(2500).hpf(400).gain(0.15),
);
