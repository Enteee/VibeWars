// sfx cast-motif-enchantment: 0.25 s, peak -14 dBFS
// An enchantment is cast (#3298): a small bell pair, a sixth apart.
setcpm(60);
stack(
  s("sine").freq(1320).attack(0.003).decay(0.24).sustain(0),
  s("sine").freq(2200).attack(0.003).decay(0.16).sustain(0).gain(0.5),
);
