// sfx cast-motif-hex: 0.22 s, peak -14 dBFS
// A hex is cast (#3298): a falling detuned pair, sour where the spell is clean.
setcpm(60);
stack(
  s("sawtooth")
    .freq(550)
    .penv(-5)
    .pattack(0.22)
    .panchor(0)
    .attack(0.01)
    .decay(0.21)
    .sustain(0)
    .lpf(2000),
  s("sawtooth")
    .freq(575)
    .penv(-5)
    .pattack(0.22)
    .panchor(0)
    .attack(0.01)
    .decay(0.21)
    .sustain(0)
    .lpf(2000)
    .gain(0.8),
);
