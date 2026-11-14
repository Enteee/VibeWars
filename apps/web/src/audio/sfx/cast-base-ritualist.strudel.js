// sfx cast-base-ritualist: 0.4 s, peak -12 dBFS
// A Ritualist casts (#3298): a hollow log drum, knocked twice in one.
setcpm(60);
stack(
  s("sine").freq(165).penv(-3).pattack(0.08).panchor(0).attack(0.003).decay(0.3).sustain(0),
  s("triangle").freq(247).attack(0.003).decay(0.12).sustain(0).bpf(500).bandq(2).gain(0.6),
);
