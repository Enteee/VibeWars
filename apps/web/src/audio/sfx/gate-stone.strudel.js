// sfx gate-stone: 0.55 s, peak -10 dBFS
// A stone gate near you opened or closed (#3139): a low, slow grinding
// rumble with no pitch, stone dragged over stone.
setcpm(60);
stack(
  s("brown").attack(0.08).decay(0.47).sustain(0).lpf(320).tremolo(14).tremolodepth(0.5),
  s("pink").attack(0.1).decay(0.4).sustain(0).bpf(180).bpq(1).gain(0.4),
);
