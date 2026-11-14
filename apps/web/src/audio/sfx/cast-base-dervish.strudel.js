// sfx cast-base-dervish: 0.45 s, peak -12 dBFS
// A Dervish casts (#3298): a low swirl of sand-hiss over a soft hum.
setcpm(60);
stack(
  s("white").attack(0.12).decay(0.33).sustain(0).bpf(1400).bandq(2).tremolo(9).tremolodepth(0.7).gain(0.5),
  s("sine").freq(110).attack(0.1).decay(0.35).sustain(0),
);
