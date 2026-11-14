// sfx cast-base-assassin: 0.35 s, peak -12 dBFS
// An Assassin casts (#3298): a short, dry whisper, barely a tone under it.
setcpm(60);
stack(
  s("pink").attack(0.02).decay(0.2).sustain(0).bpf(2400).bandq(3),
  s("sine").freq(185).attack(0.01).decay(0.14).sustain(0).gain(0.35),
);
