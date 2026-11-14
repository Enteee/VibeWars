// sfx enchant-on: 0.30 s, peak -14 dBFS
// An enchantment landed on you: a soft brass shimmer, two partials a fifth
// apart with a slow attack. Warm and rounded, nothing like a chime.
setcpm(60);
stack(
  s("triangle").freq(440).attack(0.09).decay(0.21).sustain(0).lpf(1800),
  s("triangle").freq(660).attack(0.12).decay(0.18).sustain(0).lpf(1800).gain(0.6),
);
