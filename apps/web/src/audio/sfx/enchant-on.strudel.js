// sfx enchant-on: 0.3 s, peak -14 dBFS
// An enchantment landed on you: a soft brass shimmer, two partials a fifth
// apart, swelling in slowly. Warm where heal is bright and quick.
setcpm(60);
stack(
  s("sawtooth").freq(392).attack(0.1).decay(0.2).sustain(0).lpf(1400).gain(0.5),
  s("sine").freq(588).attack(0.12).decay(0.18).sustain(0).vib(5).vibmod(0.1).gain(0.5),
);
