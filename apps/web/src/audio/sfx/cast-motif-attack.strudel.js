// sfx cast-motif-attack: 0.18 s, peak -14 dBFS
// An attack skill is used (#3298): a blade's short scrape, a falling edge.
setcpm(60);
stack(
  s("white").attack(0.01).decay(0.16).sustain(0).bpf(2600).bandq(5),
  s("sawtooth").freq(900).penv(-4).pattack(0.18).panchor(0).attack(0.01).decay(0.12).sustain(0).lpf(2400).gain(0.3),
);
