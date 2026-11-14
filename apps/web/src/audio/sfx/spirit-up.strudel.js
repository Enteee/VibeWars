// sfx spirit-up: 0.4 s, peak -13 dBFS
// A spirit of either side was summoned near you (#3297): a hollow, breathy
// tone rising a fifth.
setcpm(60);
stack(
  s("sine").freq(330).penv(7).pattack(0.4).panchor(0).attack(0.12).decay(0.28).sustain(0),
  s("sine").freq(990).penv(7).pattack(0.4).panchor(0).attack(0.15).decay(0.25).sustain(0).gain(0.15),
  s("white").attack(0.15).decay(0.25).sustain(0).hpf(1200).lpf(2500).gain(0.15),
);
