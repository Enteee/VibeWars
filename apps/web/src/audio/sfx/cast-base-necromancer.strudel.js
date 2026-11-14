// sfx cast-base-necromancer: 0.45 s, peak -12 dBFS
// A Necromancer casts (#3298): a dark bowed drone, two strings rubbing.
setcpm(60);
stack(
  s("sawtooth").freq(98).attack(0.12).decay(0.33).sustain(0).lpf(520).vib(4).vibmod(0.1),
  s("sawtooth").freq(98.9).attack(0.12).decay(0.33).sustain(0).lpf(520).gain(0.7),
);
