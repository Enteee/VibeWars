// sfx death-ally: 0.5 s, peak -9 dBFS
// A teammate dies (#3366): a short muted bell, inharmonic partials damped low.
setcpm(60);
stack(
  s("sine").freq(392).attack(0.004).decay(0.48).sustain(0),
  s("sine").freq(587).attack(0.004).decay(0.22).sustain(0).gain(0.35),
  s("sine").freq(784).attack(0.004).decay(0.12).sustain(0).gain(0.18),
).lpf(1800);
