// sfx spirit-up: 0.4 s, peak -13 dBFS
// A spirit was summoned near you: a hollow, breathy rising tone.
setcpm(60);
stack(
  s("sine").freq(294).penv(7).pattack(0.4).panchor(0).attack(0.12).decay(0.28).sustain(0),
  s("brown").attack(0.15).decay(0.25).sustain(0).bpf(600).bandq(3).gain(0.5),
);
