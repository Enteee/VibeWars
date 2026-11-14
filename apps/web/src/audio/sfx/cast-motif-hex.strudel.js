// sfx cast-motif-hex: 0.22 s, peak -14 dBFS
// A hex is cast (#3298): a falling detuned pair, sour where the spell is clean.
setcpm(60);
stack(
  s("sawtooth").freq(1100).penv(-5).pattack(0.22).panchor(0).attack(0.01).decay(0.21).sustain(0).lpf(2600),
  s("sawtooth").freq(1150).penv(-5).pattack(0.22).panchor(0).attack(0.01).decay(0.21).sustain(0).lpf(2600).gain(0.8),
);
