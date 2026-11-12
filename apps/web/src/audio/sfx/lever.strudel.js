// sfx lever: 0.18 s, peak -12 dBFS
// A lever near you was thrown (#3139): a dry wooden clack, then a short
// metal ratchet, one rattled burst rather than ticks (cast-target keeps
// those). Small and close, so it is quiet.
setcpm(60);
stack(
  s("triangle").freq(220).penv(-7).pattack(0.04).panchor(0).attack(0.001).decay(0.05).sustain(0),
  s("pink").attack(0.0005).decay(0.03).sustain(0).bpf(900).bpq(2).gain(0.6),
  s("pink")
    .attack(0.005)
    .decay(0.08)
    .sustain(0)
    .bpf(2400)
    .bpq(3)
    .tremolo(45)
    .tremolodepth(0.8)
    .gain(0.3)
    .compress(0.06, 0.16),
);
