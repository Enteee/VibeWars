// sfx crit: 0.15 s, peak -8 dBFS
// A critical hit, dealt or taken (#3366): a short bright transient over the hit.
setcpm(60);
stack(
  s("white").attack(0.003).decay(0.05).sustain(0).hpf(3000).lpf(6000).gain(0.6),
  s("triangle").freq(1175).attack(0.001).decay(0.12).sustain(0).gain(0.5),
);
