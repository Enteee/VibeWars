// sfx enchant-on: 0.3 s, peak -14 dBFS
// An enchantment landed on you (#3297): a soft brass shimmer, two partials
// a fifth apart swelling in slowly. Warmer and lower than heal's chime.
setcpm(60);
stack(
  s("sawtooth").freq(587.33).attack(0.08).release(0.2).lpf(1800).gain(0.4).compress(0, 0.28),
  s("sine").freq(880).attack(0.1).release(0.18).gain(0.5).compress(0.03, 0.28),
);
