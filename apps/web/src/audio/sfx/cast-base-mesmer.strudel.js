// sfx cast-base-mesmer: 0.4 s, peak -12 dBFS
// A Mesmer casts (#3298): a glassy detuned pad, a slow beat between two sines.
setcpm(60);
stack(
  s("sine").freq(262).attack(0.08).decay(0.32).sustain(0),
  s("sine").freq(267).attack(0.08).decay(0.32).sustain(0).gain(0.8),
  s("triangle").freq(786).attack(0.06).decay(0.3).sustain(0).gain(0.15),
);
