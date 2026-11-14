// sfx cast-motif-shout: 0.18 s, peak -14 dBFS
// A shout, chant or echo is used (#3298): a short sung "a", clipped.
setcpm(60);
stack(
  s("sawtooth").freq(700).vowel("a").attack(0.02).decay(0.16).sustain(0).lpf(3000),
);
