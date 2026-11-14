// sfx cast-base-elementalist: 0.45 s, peak -12 dBFS
// An Elementalist casts (#3298): a deep rumble with air rushing over it.
setcpm(60);
stack(
  s("sine").freq(80).attack(0.06).decay(0.39).sustain(0),
  s("brown").attack(0.05).decay(0.4).sustain(0).lpf(260).gain(0.7),
  s("white").attack(0.15).decay(0.3).sustain(0).hpf(3000).gain(0.08),
);
