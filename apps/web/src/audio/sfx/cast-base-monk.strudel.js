// sfx cast-base-monk: 0.45 s, peak -12 dBFS
// A Monk casts (#3298): a low sung chant, one held "o".
setcpm(60);
stack(
  s("sawtooth").freq(147).vowel("o").attack(0.1).decay(0.35).sustain(0).lpf(1500),
  s("sine").freq(147).attack(0.1).decay(0.35).sustain(0).gain(0.4),
);
