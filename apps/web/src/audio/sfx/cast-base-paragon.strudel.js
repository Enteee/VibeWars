// sfx cast-base-paragon: 0.45 s, peak -12 dBFS
// A Paragon casts (#3298): a brass swell, a low fifth.
setcpm(60);
stack(
  s("sawtooth").freq(131).attack(0.15).decay(0.3).sustain(0).lpf(950),
  s("sawtooth").freq(196).attack(0.18).decay(0.27).sustain(0).lpf(950).gain(0.45),
);
