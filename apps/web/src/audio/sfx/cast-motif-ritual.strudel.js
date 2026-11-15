// sfx cast-motif-ritual: 0.22 s, peak -14 dBFS
// A ritual is cast (#3298): a hollow ping, a wooden bar's.
setcpm(60);
stack(
  s("sine").freq(495).attack(0.003).decay(0.21).sustain(0),
  s("triangle").freq(330).attack(0.003).decay(0.1).sustain(0).bpf(400).bandq(3).gain(0.5),
);
