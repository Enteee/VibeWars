// sfx barrier: 0.35 s, peak -13 dBFS
// An energy barrier near you went up or down (#3139): a soft sine hum that
// rises a fifth, with an octave above it breathing in.
setcpm(60);
stack(
  s("sine").freq(220).penv(7).pattack(0.3).panchor(0).attack(0.06).decay(0.29).sustain(0),
  s("sine").freq(440).penv(7).pattack(0.3).panchor(0).attack(0.15).decay(0.2).sustain(0).gain(0.3),
);
