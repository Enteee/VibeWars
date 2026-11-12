// sfx wall-crumble: 0.6 s, peak -7 dBFS
// A breakable wall near you came down (#3139): a heavy, low burst of noise
// breaking into short rattles of falling stone.
setcpm(60);
stack(
  s("brown").attack(0.003).decay(0.3).sustain(0).lpf(450),
  s("sine").freq(70).penv(-12).pattack(0.25).panchor(0).attack(0.003).decay(0.25).sustain(0).gain(0.6),
  s("pink").attack(0.001).decay(0.04).sustain(0).bpf(1200).bpq(1.5).gain(0.35).compress(0.2, 0.26),
  s("pink").attack(0.001).decay(0.035).sustain(0).bpf(1600).bpq(1.5).gain(0.3).compress(0.29, 0.34),
  s("pink").attack(0.001).decay(0.04).sustain(0).bpf(1000).bpq(1.5).gain(0.25).compress(0.36, 0.42),
  s("pink").attack(0.001).decay(0.03).sustain(0).bpf(1400).bpq(1.5).gain(0.18).compress(0.45, 0.5),
);
