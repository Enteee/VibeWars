// sfx cast-base-ranger: 0.4 s, peak -12 dBFS
// A Ranger casts (#3298): a wooden flute's breath, a soft hollow tone.
setcpm(60);
stack(
  s("triangle").freq(220).attack(0.08).decay(0.3).sustain(0).lpf(1200).vib(5).vibmod(0.08),
  s("pink").attack(0.05).decay(0.3).sustain(0).bpf(900).bandq(4).gain(0.35),
);
