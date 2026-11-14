// sfx spirit-up: 0.40 s, peak -13 dBFS
// A spirit was summoned near you: a hollow, breathy tone that rises.
setcpm(60);
stack(
  s("sine").freq(294).penv(5).pattack(0.35).panchor(0).attack(0.12).decay(0.28).sustain(0),
  s("pink").attack(0.1).decay(0.3).sustain(0).lpf(1400).hpf(500).gain(0.2),
);
